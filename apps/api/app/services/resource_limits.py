from __future__ import annotations

import asyncio
import ipaddress
import math
import threading
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from weakref import WeakKeyDictionary

from fastapi import Request

from app.core.config import settings


class RateLimitExceededError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        self.retry_after_seconds = max(1, retry_after_seconds)
        super().__init__("Request rate limit exceeded")


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._entries: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, namespace: str, key: str, *, limit: int, window_seconds: int) -> None:
        if limit <= 0 or window_seconds <= 0:
            return
        now = time.monotonic()
        cutoff = now - window_seconds
        bucket = (namespace, key)
        with self._lock:
            entries = self._entries[bucket]
            while entries and entries[0] <= cutoff:
                entries.popleft()
            if len(entries) >= limit:
                retry_after = math.ceil(entries[0] + window_seconds - now)
                raise RateLimitExceededError(retry_after)
            entries.append(now)


class EventLoopJobSlotLimiter:
    def __init__(self, limit: int) -> None:
        self._limit = max(1, limit)
        self._semaphores: WeakKeyDictionary[
            asyncio.AbstractEventLoop,
            asyncio.Semaphore,
        ] = WeakKeyDictionary()

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        loop = asyncio.get_running_loop()
        semaphore = self._semaphores.get(loop)
        if semaphore is None:
            semaphore = asyncio.Semaphore(self._limit)
            self._semaphores[loop] = semaphore
        async with semaphore:
            yield


sms_rate_limiter = SlidingWindowRateLimiter()
chat_rate_limiter = SlidingWindowRateLimiter()
document_job_limiter = EventLoopJobSlotLimiter(settings.document_processing_max_concurrency)
analysis_job_limiter = EventLoopJobSlotLimiter(settings.analysis_max_concurrency)


def request_client_ip(request: Request) -> str:
    peer = request.client.host if request.client and request.client.host else ""
    if peer in {"127.0.0.1", "::1"}:
        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            try:
                return str(ipaddress.ip_address(real_ip))
            except ValueError:
                pass
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            candidate = forwarded.rsplit(",", 1)[-1].strip()
            if candidate:
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    pass
    return peer or "unknown"


def enforce_chat_rate_limit(user_id: str) -> None:
    chat_rate_limiter.check(
        "chat",
        user_id,
        limit=settings.chat_rate_limit_per_minute,
        window_seconds=60,
    )


def enforce_sms_rate_limit(*, phone: str, request: Request) -> None:
    sms_rate_limiter.check(
        "sms-phone",
        phone,
        limit=settings.sms_send_phone_limit_per_hour,
        window_seconds=3600,
    )
    sms_rate_limiter.check(
        "sms-ip",
        request_client_ip(request),
        limit=settings.sms_send_ip_limit_per_hour,
        window_seconds=3600,
    )
