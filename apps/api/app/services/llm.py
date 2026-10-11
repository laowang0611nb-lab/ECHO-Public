import json
import math
import re
from typing import Protocol

import httpx

from app.schemas.knowledge import (
    ChapterDraft,
    KnowledgeRelationDraft,
    KnowledgeRelationPointDraft,
)

EXTRACTION_SYSTEM_PROMPT = "You extract educational knowledge structures. Return strict JSON only."
MERGE_SYSTEM_PROMPT = "You merge partial educational knowledge structures. Return strict JSON only."
EXTRACTION_PROMPT_PREFIX = (
    "Analyze the course material and return strict JSON only. "
    'The JSON shape must be {"chapters":[{"title":string,'
    '"summary":string|null,"knowledge_points":[{"name":string,'
    '"description":string|null}]}]}. Keep chapter and knowledge point '
    "names concise and grounded in the material. Return at most 20 chapters "
    "and at most 8 knowledge points per chapter. Do not include markdown.\n\n"
    "COURSE MATERIAL:\n"
)
MERGE_PROMPT_PREFIX = (
    "Merge the partial chapter drafts below into one deduplicated structure. "
    "Preserve chapter order, merge equivalent chapters and knowledge points, "
    'and return strict JSON in the shape {"chapters":[{"title":string,'
    '"summary":string|null,"knowledge_points":[{"name":string,'
    '"description":string|null}]}]}. Return at most 20 chapters and at most '
    "8 knowledge points per chapter. Do not include markdown.\n\n"
    "PARTIAL DRAFTS:\n"
)
CJK_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
WORD_PATTERN = re.compile(r"[A-Za-z0-9]+(?:[._/+:-][A-Za-z0-9]+)*")
REQUEST_OVERHEAD_TOKENS = 16
PART_SEPARATOR = "\n\n"

RELATION_SYSTEM_PROMPT = (
    "You extract explicit prerequisite and association relations between course "
    "knowledge points. Return strict JSON only."
)
RELATION_PROMPT_PREFIX = (
    "Analyze the following course knowledge points and return strict JSON only. "
    'The JSON shape must be {"relations":[{"source_key":string,'
    '"target_key":string,"relation_type":"prerequisite|related",'
    '"reason":string}]}. Use prerequisite when the source must be understood '
    "before the target. Use related only for strong, explicit mutual association. "
    "Do not create weak generic links. Do not create self-links. Prefer a small "
    "number of high-confidence edges over a dense graph. Keep every reason short. "
    "Use only keys present in the input. Do not include markdown.\n\n"
    "KNOWLEDGE POINTS:\n"
)


class LLMConfigurationError(Exception):
    pass


class LLMProviderError(Exception):
    pass


class LLMProviderTimeoutError(LLMProviderError):
    pass


class LLMContextLimitError(LLMProviderError):
    pass


class KnowledgeStructureProvider(Protocol):
    async def generate(self, pages: list[str]) -> list[ChapterDraft]: ...


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    cjk_count = len(CJK_PATTERN.findall(text))
    word_tokens = sum(max(1.0, len(word) + 0.5) for word in WORD_PATTERN.findall(text))
    remainder = WORD_PATTERN.sub("", CJK_PATTERN.sub("", text))
    symbol_count = sum(1 for character in remainder if not character.isspace())
    return max(1, math.ceil(cjk_count * 1.5 + word_tokens + symbol_count))


def _request_tokens(system_prompt: str, prompt: str) -> int:
    return estimate_tokens(system_prompt) + estimate_tokens(prompt) + REQUEST_OVERHEAD_TOKENS


def _split_text_to_budget(text: str, token_budget: int) -> list[str]:
    if token_budget <= 0:
        raise LLMContextLimitError("LLM context budget is too small for the document")
    if estimate_tokens(text) <= token_budget:
        return [text]
    if len(text) <= 1:
        raise LLMContextLimitError("A single document segment exceeds the LLM context budget")
    midpoint = len(text) // 2
    return [
        *_split_text_to_budget(text[:midpoint], token_budget),
        *_split_text_to_budget(text[midpoint:], token_budget),
    ]


def _build_material_parts(pages: list[str], token_budget: int) -> list[str]:
    parts: list[str] = []
    for page_number, raw_text in enumerate(pages, start=1):
        text = raw_text.strip()
        if not text:
            continue
        label = f"[Page {page_number}]"
        content_budget = token_budget - estimate_tokens(label) - 4
        for segment in _split_text_to_budget(text, content_budget):
            parts.append(f"{label}\n{segment}")
    return parts


def _tail_by_tokens(text: str, max_tokens: int) -> str:
    if max_tokens <= 0 or not text:
        return ""
    if estimate_tokens(text) <= max_tokens:
        return text
    low = 0
    high = len(text)
    while low < high:
        midpoint = (low + high + 1) // 2
        if estimate_tokens(text[-midpoint:]) <= max_tokens:
            low = midpoint
        else:
            high = midpoint - 1
    return text[-low:] if low else ""


def _pack_material_parts(
    parts: list[str],
    token_budget: int,
    overlap_tokens: int,
) -> list[str]:
    batches: list[str] = []
    current: list[str] = []
    current_tokens = 0
    pending = list(parts)
    index = 0
    while index < len(pending):
        part = pending[index]
        part_tokens = estimate_tokens(part) + 4
        if part_tokens > token_budget:
            split_parts = _split_text_to_budget(part, token_budget)
            if current:
                batches.append(PART_SEPARATOR.join(current))
                current = []
                current_tokens = 0
            pending[index : index + 1] = split_parts
            continue
        if current and current_tokens + part_tokens > token_budget:
            completed = PART_SEPARATOR.join(current)
            batches.append(completed)
            overlap = _tail_by_tokens(completed, overlap_tokens)
            current = [overlap] if overlap else []
            current_tokens = estimate_tokens(overlap) + 4 if overlap else 0
        current.append(part)
        current_tokens += part_tokens
        index += 1
    if current:
        batches.append(PART_SEPARATOR.join(current))
    return batches


def _serialize_drafts(drafts: list[ChapterDraft]) -> str:
    return json.dumps(
        {"chapters": [draft.model_dump(mode="json") for draft in drafts]},
        ensure_ascii=False,
    )


def _split_draft_batch(
    drafts: list[ChapterDraft],
    token_budget: int,
) -> list[list[ChapterDraft]]:
    if estimate_tokens(_serialize_drafts(drafts)) <= token_budget:
        return [drafts]
    if len(drafts) > 1:
        midpoint = len(drafts) // 2
        return [
            *_split_draft_batch(drafts[:midpoint], token_budget),
            *_split_draft_batch(drafts[midpoint:], token_budget),
        ]
    if len(drafts) == 0:
        return []
    chapter = drafts[0]
    points = chapter.knowledge_points
    if len(points) <= 1:
        raise LLMContextLimitError("A single chapter draft exceeds the LLM context budget")
    midpoint = len(points) // 2
    return [
        *_split_draft_batch(
            [chapter.model_copy(update={"knowledge_points": points[:midpoint]})],
            token_budget,
        ),
        *_split_draft_batch(
            [chapter.model_copy(update={"knowledge_points": points[midpoint:]})],
            token_budget,
        ),
    ]


def _group_draft_batches(
    batches: list[list[ChapterDraft]],
    token_budget: int,
) -> list[list[list[ChapterDraft]]]:
    atomic_batches: list[list[ChapterDraft]] = []
    for batch in batches:
        atomic_batches.extend(_split_draft_batch(batch, token_budget))

    groups: list[list[list[ChapterDraft]]] = []
    current: list[list[ChapterDraft]] = []
    current_tokens = 0
    for batch in atomic_batches:
        batch_tokens = estimate_tokens(_serialize_drafts(batch)) + 8
        if current and current_tokens + batch_tokens > token_budget:
            groups.append(current)
            current = []
            current_tokens = 0
        current.append(batch)
        current_tokens += batch_tokens
    if current:
        groups.append(current)
    return groups


MAX_RELATION_POINTS_PER_REQUEST = 120


def _relation_point_batches(
    points: list[KnowledgeRelationPointDraft],
) -> list[list[KnowledgeRelationPointDraft]]:
    batches: list[list[KnowledgeRelationPointDraft]] = []
    current: list[KnowledgeRelationPointDraft] = []
    for point in points:
        if current and len(current) >= MAX_RELATION_POINTS_PER_REQUEST:
            batches.append(current)
            current = [current[-1]]
        current.append(point)
    if current:
        batches.append(current)
    return batches


def _deduplicate_relation_drafts(
    relations: list[KnowledgeRelationDraft],
    valid_keys: set[str],
) -> list[KnowledgeRelationDraft]:
    result: list[KnowledgeRelationDraft] = []
    seen_pairs: set[tuple[str, str]] = set()
    for relation in relations:
        if (
            relation.source_key not in valid_keys
            or relation.target_key not in valid_keys
            or relation.source_key == relation.target_key
        ):
            continue
        pair = tuple(sorted((relation.source_key, relation.target_key)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        result.append(relation)
    return result


class QwenKnowledgeStructureProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        model: str,
        timeout_seconds: float,
        max_input_tokens: int,
        batch_overlap_tokens: int = 0,
        max_output_tokens: int = 32768,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.max_input_tokens = max_input_tokens
        self.batch_overlap_tokens = batch_overlap_tokens
        self.max_output_tokens = max_output_tokens

    async def generate_relations(
        self,
        points: list[KnowledgeRelationPointDraft],
    ) -> list[KnowledgeRelationDraft]:
        if len(points) < 2:
            return []
        valid_keys = {point.key for point in points}
        relations: list[KnowledgeRelationDraft] = []
        for batch in _relation_point_batches(points):
            prompt = RELATION_PROMPT_PREFIX + json.dumps(
                {"points": [point.model_dump(mode="json") for point in batch]},
                ensure_ascii=False,
            )
            relations.extend(await self._request_relations(RELATION_SYSTEM_PROMPT, prompt))
        return _deduplicate_relation_drafts(relations, valid_keys)

    async def generate(self, pages: list[str]) -> list[ChapterDraft]:
        if not self.api_key:
            raise LLMConfigurationError("LLM API key is not configured")

        extraction_overhead = _request_tokens(
            EXTRACTION_SYSTEM_PROMPT,
            EXTRACTION_PROMPT_PREFIX,
        )
        material_budget = self.max_input_tokens - extraction_overhead
        if material_budget <= 0:
            raise LLMContextLimitError("LLM context budget is too small for extraction")
        parts = _build_material_parts(pages, material_budget)
        if not parts:
            return []

        full_context = PART_SEPARATOR.join(parts)
        request_tokens = _request_tokens(
            EXTRACTION_SYSTEM_PROMPT,
            EXTRACTION_PROMPT_PREFIX + full_context,
        )
        if request_tokens <= self.max_input_tokens:
            return await self._request_chapters(
                EXTRACTION_SYSTEM_PROMPT,
                EXTRACTION_PROMPT_PREFIX + full_context,
            )

        batches = _pack_material_parts(
            parts,
            material_budget,
            self.batch_overlap_tokens,
        )
        partial_drafts: list[list[ChapterDraft]] = []
        for batch in batches:
            drafts = await self._request_chapters(
                EXTRACTION_SYSTEM_PROMPT,
                EXTRACTION_PROMPT_PREFIX + batch,
            )
            if drafts:
                partial_drafts.append(drafts)
        if not partial_drafts:
            return []
        if len(partial_drafts) == 1:
            return partial_drafts[0]
        return await self._merge_draft_batches(partial_drafts)

    async def _merge_draft_batches(
        self,
        batches: list[list[ChapterDraft]],
    ) -> list[ChapterDraft]:
        merge_overhead = _request_tokens(MERGE_SYSTEM_PROMPT, MERGE_PROMPT_PREFIX)
        merge_budget = self.max_input_tokens - merge_overhead
        if merge_budget <= 0:
            raise LLMContextLimitError("LLM context budget is too small for merging")
        current = batches
        while len(current) > 1:
            groups = _group_draft_batches(current, merge_budget)
            next_batches: list[list[ChapterDraft]] = []
            for group in groups:
                if len(group) == 1:
                    next_batches.extend(group)
                    continue
                prompt = MERGE_PROMPT_PREFIX + json.dumps(
                    {
                        "batches": [
                            json.loads(_serialize_drafts(batch))["chapters"] for batch in group
                        ]
                    },
                    ensure_ascii=False,
                )
                next_batches.append(await self._request_chapters(MERGE_SYSTEM_PROMPT, prompt))
            if len(next_batches) >= len(current):
                raise LLMContextLimitError(
                    "Unable to reduce merged drafts within the context budget"
                )
            current = next_batches
        return current[0]

    async def _request_chapters(
        self,
        system_prompt: str,
        prompt: str,
    ) -> list[ChapterDraft]:
        if _request_tokens(system_prompt, prompt) > self.max_input_tokens:
            raise LLMContextLimitError("LLM request exceeds the configured input token budget")
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "response_format": {"type": "json_object"},
                        "max_tokens": self.max_output_tokens,
                    },
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise LLMProviderTimeoutError("LLM request timed out") from exc
        except httpx.HTTPError as exc:
            raise LLMProviderError("LLM request failed") from exc

        try:
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
            parsed = json.loads(_extract_json(content))
            chapters = [ChapterDraft.model_validate(item) for item in parsed["chapters"]]
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise LLMProviderError("LLM returned an invalid knowledge structure") from exc

        if not chapters:
            raise LLMProviderError("LLM returned no chapters")
        return chapters

    async def _request_relations(
        self,
        system_prompt: str,
        prompt: str,
    ) -> list[KnowledgeRelationDraft]:
        if _request_tokens(system_prompt, prompt) > self.max_input_tokens:
            raise LLMContextLimitError(
                "LLM relation request exceeds the configured input token budget"
            )
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "response_format": {"type": "json_object"},
                        "max_tokens": self.max_output_tokens,
                    },
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise LLMProviderTimeoutError("LLM relation request timed out") from exc
        except httpx.HTTPError as exc:
            raise LLMProviderError("LLM relation request failed") from exc

        try:
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
            parsed = json.loads(_extract_json(content))
            raw_relations = parsed["relations"]
            if not isinstance(raw_relations, list):
                raise TypeError("relations must be a list")
            return [KnowledgeRelationDraft.model_validate(item) for item in raw_relations]
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise LLMProviderError("LLM returned invalid knowledge relations") from exc


def _extract_json(content: str) -> str:
    candidates: list[str] = [
        match.group(1).strip()
        for match in re.finditer(
            r"```(?:json)?\s*(.*?)\s*```",
            content,
            flags=re.DOTALL,
        )
    ]

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", content):
        try:
            _, end = decoder.raw_decode(content[match.start() :])
        except json.JSONDecodeError:
            continue
        candidates.append(content[match.start() : match.start() + end])

    candidates.append(content.strip())
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return candidate
    return content
