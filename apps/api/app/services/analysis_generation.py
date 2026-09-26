import json
import re

from pydantic import ValidationError

from app.schemas.analysis import AIAnalysisDraft
from app.services.chat_provider import ChatProvider


class AIAnalysisProviderError(Exception):
    pass


ANALYSIS_SYSTEM_PROMPT = (
    "You are ECHO's evidence-based teaching analyst. Return strict JSON only, without "
    "markdown. Analyze only the provided course evidence. Never invent a student, "
    "knowledge point, citation, event, or cause. Every fact must cite one or more "
    "evidence_ids from the input. If the evidence is insufficient or contradictory, "
    "set insufficient_evidence to true and state what additional evidence is needed. "
    "Recommendations are suggestions for teacher review, never automatically accepted "
    "or published actions."
)

ANALYSIS_SCHEMA_PROMPT = """
Return one JSON object with this shape:
{
  "conclusion": string,
  "root_cause": string,
  "recommendation": string,
  "affected_student_ids": string[],
  "facts": [{"fact": string, "evidence_ids": string[]}],
  "insufficient_evidence": boolean,
  "insufficient_reason": string | null,
  "insufficient_categories": string[]
}
When insufficient_evidence is true, still answer with your concrete reasoning:
- conclusion: why the current evidence cannot support a reliable conclusion
- root_cause: which part of the causal chain is still unproven
- recommendation: the specific evidence a teacher should collect next
- insufficient_reason: one short paragraph naming what is missing
- insufficient_categories: array using only these values:
  no_evidence (no usable persisted evidence),
  partial_coverage (evidence covers only part of the students or knowledge points),
  conflicting_evidence (evidence contradicts itself),
  missing_causal_evidence (key evidence for causality is absent),
  model_uncertain (the evidence is present but the model cannot confirm the conclusion).
Never leave conclusion, root_cause or recommendation empty; they explain the
insufficiency instead of restating a generic apology.
Use only evidence_ids and affected_student_ids present in the supplied context.
Do not claim causality unless the evidence directly supports it.
"""


async def generate_analysis_draft(
    provider: ChatProvider,
    context: dict[str, object],
) -> AIAnalysisDraft:
    parts: list[str] = []
    async for chunk in provider.stream(
        [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": ANALYSIS_SCHEMA_PROMPT
                + "\nUse only this persisted evidence context:\n"
                + json.dumps(context, ensure_ascii=False),
            },
        ]
    ):
        parts.append(chunk)
    content = "".join(parts).strip()
    if not content:
        raise AIAnalysisProviderError("AI analysis returned an empty result")
    try:
        payload = json.loads(_extract_json_object(content))
    except json.JSONDecodeError as exc:
        raise AIAnalysisProviderError("AI analysis returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise AIAnalysisProviderError("AI analysis result must be a JSON object")
    try:
        return AIAnalysisDraft.model_validate(payload)
    except ValidationError as exc:
        raise AIAnalysisProviderError("AI analysis returned an invalid result") from exc


def _extract_json_object(content: str) -> str:
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", content, flags=re.DOTALL)
    if fenced:
        return fenced.group(1)

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", content):
        try:
            _, end = decoder.raw_decode(content[match.start() :])
        except json.JSONDecodeError:
            continue
        return content[match.start() : match.start() + end]
    return content
