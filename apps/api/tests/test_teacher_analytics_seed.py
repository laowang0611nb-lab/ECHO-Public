from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.scripts.seed_teacher_student_analytics import seed_teacher_student_analytics


@pytest.mark.asyncio
async def test_teacher_student_analytics_seed_is_repeatable(tmp_path: Path) -> None:
    database_path = tmp_path / "teacher-analytics.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    try:
        async with factory() as session:
            first = await seed_teacher_student_analytics(session, None)
        async with factory() as session:
            second = await seed_teacher_student_analytics(session, None)
    finally:
        await engine.dispose()

    assert first["courseId"] == second["courseId"]
    assert first["studentIds"] == second["studentIds"]
    assert len(second["studentIds"]) == 10
    assert len(second["conversationIds"]) == 6
    assert len(second["messageIds"]) == 54
    assert len(second["knowledgePointIds"]) == 12
    assert len(second["resourceIds"]) == 1
    assert len(second["chunkIds"]) == 3
    assert len(second["events"]) == 84
    assert len(second["masteryStates"]) == 108
    assert len(second["snapshots"]) == 432
    assert {review["status"] for review in second["reviews"]} == {
        "open",
        "confirmed_correct",
        "marked_incorrect",
    }
