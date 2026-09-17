import asyncio
import json

from app.schemas.knowledge import ChapterDraft, KnowledgePointDraft
from app.services.llm import (
    EXTRACTION_SYSTEM_PROMPT,
    MERGE_SYSTEM_PROMPT,
    QwenKnowledgeStructureProvider,
    _build_material_parts,
    _extract_json,
    _pack_material_parts,
    _request_tokens,
    estimate_tokens,
)


def test_token_estimator_counts_cjk_content_conservatively() -> None:
    assert estimate_tokens("什么是黑盒测试") >= 6
    assert estimate_tokens("") == 0


def test_material_partition_respects_token_budget() -> None:
    pages = ["中" * 80, "文" * 80]
    budget = 144
    parts = _build_material_parts(pages, budget)
    batches = _pack_material_parts(parts, budget)

    assert len(batches) >= 2
    assert all(estimate_tokens(batch) <= budget for batch in batches)


def test_agentic_generation_splits_and_merges_large_material() -> None:
    class RecordingProvider(QwenKnowledgeStructureProvider):
        def __init__(self) -> None:
            super().__init__(
                api_key="test-key",
                base_url="https://example.invalid/v1",
                model="test-model",
                timeout_seconds=1,
                max_input_tokens=400,
            )
            self.extraction_calls = 0
            self.merge_calls = 0

        async def _request_chapters(self, system_prompt: str, prompt: str) -> list[ChapterDraft]:
            assert _request_tokens(system_prompt, prompt) <= self.max_input_tokens
            if system_prompt == MERGE_SYSTEM_PROMPT:
                self.merge_calls += 1
                return [
                    ChapterDraft(
                        title="Merged",
                        knowledge_points=[KnowledgePointDraft(name="Point")],
                    )
                ]
            assert system_prompt == EXTRACTION_SYSTEM_PROMPT
            self.extraction_calls += 1
            return [
                ChapterDraft(
                    title=f"Chapter {self.extraction_calls}",
                    knowledge_points=[KnowledgePointDraft(name=f"Point {self.extraction_calls}")],
                )
            ]

    provider = RecordingProvider()
    drafts = asyncio.run(provider.generate(["中" * 160, "文" * 160, "课" * 160]))

    assert provider.extraction_calls >= 3
    assert provider.merge_calls >= 1
    assert [draft.title for draft in drafts] == ["Merged"]


def test_extract_json_selects_valid_block_from_multiple_fences() -> None:
    content = (
        "```json\nnot valid json\n```\n\n"
        '```json\n{"chapters":[{"title":"A","knowledge_points":'
        '[{"name":"P"}]}]}\n```'
    )

    extracted = _extract_json(content)

    assert json.loads(extracted)["chapters"][0]["title"] == "A"


def test_chapter_draft_deduplicates_knowledge_point_names() -> None:
    chapter = ChapterDraft(
        title="Chapter",
        knowledge_points=[
            KnowledgePointDraft(name="Point"),
            KnowledgePointDraft(name=" point "),
            KnowledgePointDraft(name="Other"),
        ],
    )

    assert [point.name for point in chapter.knowledge_points] == ["Point", "Other"]
