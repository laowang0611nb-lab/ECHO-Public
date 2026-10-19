from __future__ import annotations

import asyncio

from app.api.routes.sse import SSE_HEARTBEAT_FRAME, stream_with_heartbeat


async def test_stream_with_heartbeat_emits_comment_during_silence() -> None:
    async def events():
        await asyncio.sleep(0.05)
        yield "event: message_start\ndata: {}\n\n"

    frames = [frame async for frame in stream_with_heartbeat(events(), 0.01)]

    assert frames.count(SSE_HEARTBEAT_FRAME) >= 1
    assert frames[-1] == b"event: message_start\ndata: {}\n\n"


async def test_stream_with_heartbeat_forwards_without_delay() -> None:
    async def events():
        yield "event: done\ndata: {}\n\n"

    frames = [frame async for frame in stream_with_heartbeat(events(), 30)]

    assert frames == [b"event: done\ndata: {}\n\n"]
