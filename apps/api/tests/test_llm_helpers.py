import json

import pytest

from app.schemas.knowledge import ChapterDraft, KnowledgePointDraft
from app.services.llm import LLMContextLimitError, QwenKnowledgeStructureProvider, _extract_json


def test_context_limit_raises_instead_of_silent_truncation() -> None:
    provider = QwenKnowledgeStructureProvider(
        api_key="test-key",
        base_url="https://example.invalid/v1",
        model="test-model",
        timeout_seconds=1,
        max_context_chars=64,
    )

    with pytest.raises(LLMContextLimitError):
        import asyncio

        asyncio.run(provider.generate(["x" * 100]))


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
