import asyncio
from datetime import UTC, datetime
from uuid import UUID

from database.db.session import async_session_factory
from database.models.analysis import AIAnalysis, AIAnalysisStatus
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.services.analysis import execute_analysis_record, mark_analysis_failed
from app.services.chat_provider import ChatProvider

_ACTIVE_TASKS: dict[UUID, asyncio.Task[None]] = {}


class DatabaseAnalysisTaskScheduler:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        provider: ChatProvider,
    ) -> None:
        self.session_factory = session_factory
        self.provider = provider

    async def start(self, analysis_id: UUID) -> None:
        existing = _ACTIVE_TASKS.get(analysis_id)
        if existing is not None and not existing.done():
            return
        task = asyncio.create_task(
            self._run(analysis_id),
            name=f"ai-analysis:{analysis_id}",
        )
        _ACTIVE_TASKS[analysis_id] = task
        task.add_done_callback(
            lambda completed, current_id=analysis_id: self._cleanup(current_id, completed)
        )

    @staticmethod
    def _cleanup(analysis_id: UUID, task: asyncio.Task[None]) -> None:
        if _ACTIVE_TASKS.get(analysis_id) is task:
            _ACTIVE_TASKS.pop(analysis_id, None)

    async def _run(self, analysis_id: UUID) -> None:
        heartbeat_task = asyncio.create_task(self._heartbeat(analysis_id))
        try:
            async with self.session_factory() as session:
                analysis = await session.get(AIAnalysis, analysis_id)
                if analysis is None or analysis.status != AIAnalysisStatus.ANALYZING:
                    return
                await execute_analysis_record(session, self.provider, analysis_id)
        except Exception as exc:
            async with self.session_factory() as session:
                await mark_analysis_failed(session, analysis_id, exc)
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _heartbeat(self, analysis_id: UUID) -> None:
        interval = max(1, settings.analysis_progress_heartbeat_seconds)
        while True:
            await asyncio.sleep(interval)
            try:
                async with self.session_factory() as session:
                    analysis = await session.get(AIAnalysis, analysis_id)
                    if analysis is None or analysis.status != AIAnalysisStatus.ANALYZING:
                        return
                    analysis.heartbeat_at = datetime.now(UTC)
                    await session.commit()
            except Exception:
                continue


def create_analysis_task_scheduler(
    provider: ChatProvider,
    *,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> DatabaseAnalysisTaskScheduler:
    return DatabaseAnalysisTaskScheduler(
        session_factory or async_session_factory,
        provider,
    )
