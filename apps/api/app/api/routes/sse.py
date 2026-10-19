from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

SSE_HEARTBEAT_SECONDS = 50.0
SSE_HEARTBEAT_FRAME = b":\n\n"


async def stream_with_heartbeat(
    events: AsyncIterator[str],
    heartbeat_seconds: float = SSE_HEARTBEAT_SECONDS,
) -> AsyncIterator[bytes]:
    iterator = events.__aiter__()
    try:
        while True:
            pending = asyncio.ensure_future(anext(iterator))
            try:
                while True:
                    done, _ = await asyncio.wait({pending}, timeout=heartbeat_seconds)
                    if pending in done:
                        try:
                            event = pending.result()
                        except StopAsyncIteration:
                            return
                        yield event.encode()
                        break
                    yield SSE_HEARTBEAT_FRAME
            finally:
                if not pending.done():
                    pending.cancel()
                    try:
                        await pending
                    except (asyncio.CancelledError, StopAsyncIteration):
                        pass
    finally:
        aclose = getattr(iterator, "aclose", None)
        if aclose is not None:
            await aclose()
