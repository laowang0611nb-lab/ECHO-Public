import json
import re
from typing import Any

from pydantic import ValidationError

from app.schemas.planning import (
    TeachingStrategyGenerationDraft,
    WeeklyPlanGenerationDraft,
)
from app.services.chat_provider import ChatProvider


class PlanGenerationProviderError(Exception):
    pass


STRATEGY_SYSTEM_PROMPT = (
    "You are an instructional design assistant. Return strict JSON only, without markdown. "
    "Only propose a draft for teacher review. Never claim that a strategy is already accepted, "
    "active, or completed."
)

WEEKLY_PLAN_SYSTEM_PROMPT = (
    "You create an execution plan draft for teacher review. Return strict JSON only, without "
    "markdown. The result is always a draft. Never claim that the plan has been published or "
    "that its tasks have been completed."
)

STRATEGY_SCHEMA_PROMPT = """
Return one JSON object with this shape:
{
  "title": string,
  "description": string,
  "type": "content_adjustment" | "teaching_method" |
    "differentiated_instruction" | "assignment_design" | "classroom_interaction",
  "priority": "high" | "medium" | "low",
  "goals": string[],
  "teaching_methods": [{"name": string, "weight": number}],
  "teaching_flow": [{"order": number, "title": string, "description": string}],
  "personalization_rules": string[],
  "ai_rules": string[],
  "expected_effect": {"summary": string, "impact": number | null, "metrics": object[]}
}
"""

WEEKLY_PLAN_SCHEMA_PROMPT = """
Return one JSON object with this shape:
{
  "weeks": [
    {
      "week_number": number,
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "content": string,
      "knowledge_point_ids": string[],
      "resource_ids": string[],
      "tasks": [
        {
          "title": string,
          "description": string,
          "type": "supplementary_practice" | "resource_push" |
            "classroom_lecture" | "quick_check" | "individual_tutoring" | "project_task",
          "due_at": "ISO-8601" | null,
          "knowledge_point_ids": string[],
          "resource_ids": string[],
          "target_student_ids": string[]
        }
      ]
    }
  ],
  "recommendations": [{"content": string}]
}
"""


async def generate_strategy_draft(
    provider: ChatProvider,
    context: dict[str, object],
) -> TeachingStrategyGenerationDraft:
    payload = await _request_json(
        provider,
        STRATEGY_SYSTEM_PROMPT,
        STRATEGY_SCHEMA_PROMPT
        + "\nUse only these persisted course context values:\n"
        + json.dumps(context, ensure_ascii=False),
    )
    try:
        return TeachingStrategyGenerationDraft.model_validate(payload)
    except ValidationError as exc:
        raise PlanGenerationProviderError("AI returned an invalid teaching strategy draft") from exc


async def generate_weekly_plan_draft(
    provider: ChatProvider,
    context: dict[str, object],
) -> WeeklyPlanGenerationDraft:
    payload = await _request_json(
        provider,
        WEEKLY_PLAN_SYSTEM_PROMPT,
        WEEKLY_PLAN_SCHEMA_PROMPT
        + "\nUse only these persisted plan values:\n"
        + json.dumps(context, ensure_ascii=False),
    )
    try:
        return WeeklyPlanGenerationDraft.model_validate(payload)
    except ValidationError as exc:
        raise PlanGenerationProviderError("AI returned an invalid weekly plan draft") from exc


async def _request_json(
    provider: ChatProvider,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    parts: list[str] = []
    async for chunk in provider.stream(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    ):
        parts.append(chunk)
    content = "".join(parts).strip()
    if not content:
        raise PlanGenerationProviderError("AI returned an empty draft")
    try:
        parsed = json.loads(_extract_json_object(content))
    except json.JSONDecodeError as exc:
        raise PlanGenerationProviderError("AI returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise PlanGenerationProviderError("AI draft must be a JSON object")
    return parsed


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
