from pathlib import Path
from typing import Protocol

import anyio


class ASRConfigurationError(Exception):
    pass


class ASRProviderError(Exception):
    pass


class ASRProvider(Protocol):
    async def transcribe(self, path: Path, *, language: str | None) -> str: ...


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

    async def transcribe(self, path: Path, *, language: str | None) -> str:
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
