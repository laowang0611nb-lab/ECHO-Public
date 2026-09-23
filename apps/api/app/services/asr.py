import base64
from pathlib import Path
from typing import Protocol

import anyio
import httpx


class ASRConfigurationError(Exception):
    pass


class ASRProviderError(Exception):
    pass


class ASRProvider(Protocol):
    async def transcribe(
        self,
        path: Path,
        *,
        language: str | None,
        mime_type: str | None = None,
    ) -> str: ...


class FasterWhisperProvider:
    def __init__(
        self,
        *,
        model_name: str,
        device: str,
        compute_type: str,
        beam_size: int,
        download_root: str | None = None,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.beam_size = beam_size
        self.download_root = download_root
        self._model = None

    async def transcribe(
        self,
        path: Path,
        *,
        language: str | None,
        mime_type: str | None = None,
    ) -> str:
        return await anyio.to_thread.run_sync(self._transcribe_sync, path, language)

    def _transcribe_sync(self, path: Path, language: str | None) -> str:
        model = self._get_model()
        try:
            segments, _ = model.transcribe(
                str(path),
                language=language or None,
                beam_size=self.beam_size,
                vad_filter=True,
            )
            transcript = "".join(segment.text for segment in segments).strip()
        except Exception as exc:
            raise ASRProviderError("Speech recognition failed") from exc
        if not transcript:
            raise ASRProviderError("Speech recognition returned an empty transcript")
        return transcript

    def _get_model(self):
        if self._model is not None:
            return self._model
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise ASRConfigurationError(
                "faster-whisper is not installed; install echo-api[asr]"
            ) from exc
        try:
            self._model = WhisperModel(
                self.model_name,
                device=self.device,
                compute_type=self.compute_type,
                download_root=self.download_root,
            )
        except Exception as exc:
            raise ASRConfigurationError("Unable to load the configured ASR model") from exc
        return self._model


class DashScopeAsrProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        model: str,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def transcribe(
        self,
        path: Path,
        *,
        language: str | None,
        mime_type: str | None = None,
    ) -> str:
        if not self.api_key:
            raise ASRConfigurationError("ASR API key is not configured")
        if not path.is_file():
            raise ASRProviderError("Audio attachment file is missing")
        payload: dict[str, object] = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": _audio_data_url(path, mime_type),
                            },
                        }
                    ],
                }
            ],
            "stream": False,
        }
        if language:
            payload["asr_options"] = {"language": language}
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                transcript = data["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ASRProviderError("Remote speech recognition failed") from exc
        if not isinstance(transcript, str) or not transcript.strip():
            raise ASRProviderError("Speech recognition returned an empty transcript")
        return transcript.strip()


class FallbackASRProvider:
    def __init__(self, providers: list[ASRProvider]) -> None:
        self.providers = providers

    async def transcribe(
        self,
        path: Path,
        *,
        language: str | None,
        mime_type: str | None = None,
    ) -> str:
        last_error: Exception | None = None
        for provider in self.providers:
            try:
                return await provider.transcribe(
                    path,
                    language=language,
                    mime_type=mime_type,
                )
            except (ASRConfigurationError, ASRProviderError) as exc:
                last_error = exc
        if last_error is not None:
            raise last_error
        raise ASRConfigurationError("No speech recognition provider is configured")


def _audio_data_url(path: Path, mime_type: str | None) -> str:
    normalized_mime = (mime_type or "audio/mpeg").strip().lower()
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{normalized_mime};base64,{encoded}"
