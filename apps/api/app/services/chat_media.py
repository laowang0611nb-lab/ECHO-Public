from datetime import UTC, datetime, timedelta
from fractions import Fraction
from pathlib import Path

import anyio
import httpx
from database.models.chat import ChatAttachment, ChatAttachmentKind
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


class ChatMediaError(Exception):
    pass


async def ensure_video_model_url(
    session: AsyncSession,
    attachment: ChatAttachment,
    path: Path,
) -> str | None:
    if attachment.kind != ChatAttachmentKind.VIDEO:
        return None
    if not settings.chat_media_upload_enabled:
        return None
    if not settings.chat_api_key:
        raise ChatMediaError("DashScope media upload API key is not configured")
    if _cached_url_is_valid(attachment):
        return attachment.model_file_url

    normalized_path = await anyio.to_thread.run_sync(
        _normalize_video,
        path,
        settings.chat_video_normalization_fps,
        settings.chat_video_max_dimension,
    )
    model_url = await _upload_file(
        normalized_path,
        api_key=settings.chat_api_key,
        base_url=settings.chat_media_upload_base_url,
        model=settings.chat_model,
        timeout_seconds=max(settings.chat_timeout_seconds, 120.0),
    )
    expires_at = datetime.now(UTC) + timedelta(hours=settings.chat_model_file_expiry_hours)
    attachment.model_file_url = model_url
    attachment.model_file_model = settings.chat_model
    attachment.model_file_expires_at = expires_at
    await session.commit()
    return model_url


def _cached_url_is_valid(attachment: ChatAttachment) -> bool:
    if not attachment.model_file_url or attachment.model_file_model != settings.chat_model:
        return False
    if attachment.model_file_expires_at is None:
        return False
    expires_at = attachment.model_file_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at > datetime.now(UTC) + timedelta(minutes=10)


def _normalize_video(path: Path, fps: int, max_dimension: int) -> Path:
    if not path.is_file():
        raise ChatMediaError("Video attachment file is missing")
    cache_path = path.with_name(f".{path.stem}.model.mp4")
    if cache_path.is_file() and cache_path.stat().st_mtime >= path.stat().st_mtime:
        return cache_path

    try:
        import av
    except ImportError as exc:
        raise ChatMediaError("PyAV is required for video normalization") from exc

    temporary = cache_path.with_suffix(".part.mp4")
    temporary.unlink(missing_ok=True)
    try:
        with av.open(str(path)) as source:
            input_stream = source.streams.video[0] if source.streams.video else None
            if input_stream is None:
                raise ChatMediaError("Uploaded video has no video stream")
            duration = _stream_duration(input_stream)
            if duration is None or duration <= 0:
                raise ChatMediaError("Uploaded video duration is unavailable")
            width, height = _normalized_dimensions(
                input_stream.codec_context.width,
                input_stream.codec_context.height,
                max_dimension,
            )
            target_duration = max(duration, 2.1)
            frame_interval = 1 / fps
            with av.open(str(temporary), "w", "mp4") as output:
                output_stream = output.add_stream("libx264", rate=fps)
                output_stream.width = width
                output_stream.height = height
                output_stream.pix_fmt = "yuv420p"
                output_stream.options = {
                    "preset": "veryfast",
                    "crf": "28",
                    "movflags": "+faststart",
                }
                next_pts = 0
                current_frame = None
                for frame in source.decode(video=0):
                    frame_time = float(frame.time or 0.0)
                    if current_frame is None:
                        current_frame = frame
                        continue
                    while next_pts * frame_interval < frame_time:
                        _encode_frame(
                            output, output_stream, current_frame, next_pts, fps, width, height
                        )
                        next_pts += 1
                    current_frame = frame
                if current_frame is None:
                    raise ChatMediaError("Uploaded video contains no decodable frames")
                while next_pts * frame_interval <= target_duration:
                    _encode_frame(
                        output, output_stream, current_frame, next_pts, fps, width, height
                    )
                    next_pts += 1
                for packet in output_stream.encode():
                    output.mux(packet)
        temporary.replace(cache_path)
    except ChatMediaError:
        temporary.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temporary.unlink(missing_ok=True)
        raise ChatMediaError("Unable to normalize uploaded video") from exc
    return cache_path


def _encode_frame(
    output,
    output_stream,
    frame,
    pts: int,
    fps: int,
    width: int,
    height: int,
) -> None:
    normalized = frame.reformat(width=width, height=height, format="yuv420p")
    normalized.pts = pts
    normalized.time_base = Fraction(1, fps)
    for packet in output_stream.encode(normalized):
        output.mux(packet)


def _stream_duration(stream) -> float | None:
    if stream.duration is None or stream.time_base is None:
        return None
    return float(stream.duration * stream.time_base)


def _normalized_dimensions(width: int, height: int, max_dimension: int) -> tuple[int, int]:
    scale = min(1.0, max_dimension / max(width, height))
    normalized_width = max(2, int(width * scale))
    normalized_height = max(2, int(height * scale))
    return normalized_width - normalized_width % 2, normalized_height - normalized_height % 2


async def _upload_file(
    path: Path,
    *,
    api_key: str,
    base_url: str,
    model: str,
    timeout_seconds: float,
) -> str:
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        policy_response = await client.get(
            f"{base_url.rstrip('/')}/api/v1/uploads",
            headers=headers,
            params={"action": "getPolicy", "model": model},
        )
        if policy_response.status_code != 200:
            raise ChatMediaError(
                f"DashScope file policy request failed: {policy_response.status_code}"
            )
        policy = policy_response.json().get("data")
        if not isinstance(policy, dict):
            raise ChatMediaError("DashScope file policy response is invalid")

        upload_dir = str(policy.get("upload_dir") or "").strip("/")
        if not upload_dir:
            raise ChatMediaError("DashScope file policy is missing upload_dir")
        object_key = f"{upload_dir}/{path.name}"
        upload_response = await client.post(
            str(policy["upload_host"]),
            files={
                "OSSAccessKeyId": (None, str(policy["oss_access_key_id"])),
                "Signature": (None, str(policy["signature"])),
                "policy": (None, str(policy["policy"])),
                "x-oss-object-acl": (None, str(policy["x_oss_object_acl"])),
                "x-oss-forbid-overwrite": (None, str(policy["x_oss_forbid_overwrite"])),
                "key": (None, object_key),
                "success_action_status": (None, "200"),
                "file": (path.name, path.read_bytes(), "video/mp4"),
            },
        )
        if upload_response.status_code != 200:
            raise ChatMediaError(f"DashScope file upload failed: {upload_response.status_code}")
    return f"oss://{object_key}"
