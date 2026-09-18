import asyncio
import json

import httpx
import pytest

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
    assert estimate_tokens("a" * 10_000) >= 10_000


def test_material_partition_respects_token_budget() -> None:
    pages = ["中" * 80, "文" * 80]
    budget = 144
    parts = _build_material_parts(pages, budget)
    batches = _pack_material_parts(parts, budget, 0)

    assert len(batches) >= 2
    assert all(estimate_tokens(batch) <= budget for batch in batches)


def test_material_partition_adds_token_overlap() -> None:
    parts = _build_material_parts(["中" * 80, "文" * 80], 144)
    batches = _pack_material_parts(parts, 144, 20)

    assert len(batches) >= 2
    assert batches[0][-10:] in batches[1]


def test_llm_request_sets_max_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "choices": [
                    {"message": {"content": '{"chapters":[{"title":"A","knowledge_points":[]}]}'}}
                ]
            }

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, url: str, **kwargs: object) -> FakeResponse:
            captured["url"] = url
            captured.update(kwargs)
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    provider = QwenKnowledgeStructureProvider(
        api_key="test-key",
        base_url="https://example.invalid/v1",
        model="test-model",
        timeout_seconds=1,
        max_input_tokens=1000,
        max_output_tokens=1234,
    )

    asyncio.run(provider.generate(["short material"]))
    assert captured["json"]["max_tokens"] == 1234


def test_agentic_generation_splits_and_merges_large_material() -> None:
    class RecordingProvider(QwenKnowledgeStructureProvider):
        def __init__(self) -> None:
            super().__init__(
                api_key="test-key",
                base_url="https://example.invalid/v1",
                model="test-model",
                timeout_seconds=1,
                max_input_tokens=1000,
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
    drafts = asyncio.run(provider.generate(["中" * 400, "文" * 400, "课" * 400]))

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
