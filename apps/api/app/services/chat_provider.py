import json
from collections.abc import AsyncIterator
from typing import Protocol

import httpx


class ChatConfigurationError(Exception):
    pass


class ChatProviderError(Exception):
    pass


class ChatProvider(Protocol):
    async def stream(self, messages: list[dict[str, object]]) -> AsyncIterator[str]: ...

    async def complete(self, messages: list[dict[str, object]]) -> str: ...


class QwenChatProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def complete(self, messages: list[dict[str, object]]) -> str:
        if not self.api_key:
            raise ChatConfigurationError("Chat API key is not configured")

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
                        "messages": messages,
                        "temperature": 0.2,
                        "stream": False,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                content = payload["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ChatProviderError("Chat request failed") from exc
        if not isinstance(content, str):
            raise ChatProviderError("Chat response did not contain text")
        return content

    async def stream(self, messages: list[dict[str, object]]) -> AsyncIterator[str]:
        if not self.api_key:
            raise ChatConfigurationError("Chat API key is not configured")

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": 0.3,
                        "stream": True,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line.removeprefix("data:").strip()
                        if payload == "[DONE]":
                            break
                        try:
                            data = json.loads(payload)
                            delta = data["choices"][0]["delta"].get("content")
                        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
                            continue
                        if delta:
                            yield delta
        except httpx.HTTPError as exc:
            raise ChatProviderError("Chat request failed") from exc
