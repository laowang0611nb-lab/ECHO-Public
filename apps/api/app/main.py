import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from database.db.session import engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.dependencies import get_chat_provider
from app.api.router import api_router
from app.core.config import settings
from app.services.analysis_tasks import create_analysis_task_scheduler
from app.services.chat_attachment_cleanup import (
    run_chat_attachment_cleanup_loop,
)
from app.services.storage import LocalDocumentStorage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    task_scheduler = create_analysis_task_scheduler(get_chat_provider())
    try:
        await task_scheduler.recover()
    except Exception:
        logger.exception("Unable to recover interrupted AI analysis tasks")
    cleanup_task = asyncio.create_task(
        run_chat_attachment_cleanup_loop(
            LocalDocumentStorage(settings.chat_attachment_storage_root),
            interval_seconds=settings.chat_attachment_cleanup_interval_seconds,
        ),
        name="chat-attachment-cleanup",
    )
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        await task_scheduler.shutdown()
        await engine.dispose()


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="ECHO education agent API",
        docs_url=f"{settings.api_v1_prefix}/docs",
        redoc_url=f"{settings.api_v1_prefix}/redoc",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router, prefix=settings.api_v1_prefix)
    return application


app = create_app()
