import json
import re
from typing import Protocol

import httpx

from app.schemas.knowledge import ChapterDraft


class LLMConfigurationError(Exception):
    pass


class LLMProviderError(Exception):
    pass


class KnowledgeStructureProvider(Protocol):
    async def generate(self, pages: list[str]) -> list[ChapterDraft]: ...


class QwenKnowledgeStructureProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        model: str,
        timeout_seconds: float,
        max_context_chars: int,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.max_context_chars = max_context_chars

    async def generate(self, pages: list[str]) -> list[ChapterDraft]:
        if not self.api_key:
            raise LLMConfigurationError("LLM API key is not configured")

        context = "\n\n".join(
            f"[Page {index}]\n{text}" for index, text in enumerate(pages, start=1)
        )[: self.max_context_chars]
        prompt = (
            "Analyze the course material and return strict JSON only. "
            'The JSON shape must be {"chapters":[{"title":string,'
            '"summary":string|null,"knowledge_points":[{"name":string,'
            '"description":string|null}]}]}. Keep chapter and knowledge point '
            "names concise and grounded in the material.\n\n"
            f"COURSE MATERIAL:\n{context}"
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
                            {
                                "role": "system",
                                "content": (
                                    "You extract educational knowledge structures. "
                                    "Return JSON only."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.2,
                    },
                )
                response.raise_for_status()
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


def _extract_json(content: str) -> str:
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", content, flags=re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return content
    return content[start : end + 1]
