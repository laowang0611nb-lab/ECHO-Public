from typing import Protocol

import httpx


class EmbeddingConfigurationError(Exception):
    pass


class EmbeddingProviderError(Exception):
    pass


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class QwenEmbeddingProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        model: str,
        dimension: int,
        timeout_seconds: float,
        batch_size: int,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dimension = dimension
        self.timeout_seconds = timeout_seconds
        self.batch_size = batch_size

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.api_key:
            raise EmbeddingConfigurationError("Embedding API key is not configured")
        if not texts:
            return []
        if self.batch_size <= 0:
            raise EmbeddingConfigurationError("embedding batch size must be positive")

        embeddings: list[list[float]] = []
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for start in range(0, len(texts), self.batch_size):
                batch = texts[start : start + self.batch_size]
                embeddings.extend(await self._embed_batch(client, batch))
        return embeddings

    async def _embed_batch(
        self,
        client: httpx.AsyncClient,
        texts: list[str],
    ) -> list[list[float]]:
        try:
            response = await client.post(
                f"{self.base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": self.model, "input": texts},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise EmbeddingProviderError("Embedding request failed") from exc

        try:
            payload = response.json()
            rows = sorted(payload["data"], key=lambda item: item["index"])
            vectors = [row["embedding"] for row in rows]
        except (KeyError, TypeError, ValueError) as exc:
            raise EmbeddingProviderError("Embedding provider returned invalid data") from exc

        if len(vectors) != len(texts):
            raise EmbeddingProviderError("Embedding provider returned the wrong vector count")
        if any(len(vector) != self.dimension for vector in vectors):
            raise EmbeddingProviderError("Embedding provider returned the wrong dimension")
        return vectors
