from pathlib import Path
from uuid import uuid4

import pytest
from database.db.base import Base
from database.models.course import Course, CourseStatus
from database.models.user import User, UserRole
from database.seeds.seed_teacher_student_analytics import seed_teacher_student_analytics
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_teacher_student_analytics_seed_is_repeatable(tmp_path: Path) -> None:
    database_path = tmp_path / "teacher-analytics.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    existing_teacher = User(
        id=uuid4(),
        email="demo.teacher@example.com",
        display_name="已有教师",
        role=UserRole.TEACHER,
    )
    existing_student = User(
        id=uuid4(),
        email="demo.student01@example.com",
        display_name="已有学生",
        role=UserRole.STUDENT,
    )
    second_course_id = uuid4()
    async with factory() as session:
        session.add_all([existing_teacher, existing_student])
        session.add(
            Course(
                id=second_course_id,
                name="第二演示课程",
                status=CourseStatus.DRAFT,
                code="SECOND01",
                created_by=existing_teacher.id,
            )
        )
        await session.commit()
    try:
        async with factory() as session:
            first = await seed_teacher_student_analytics(session, None)
        async with factory() as session:
            second_course = await seed_teacher_student_analytics(
                session,
                second_course_id,
            )
        async with factory() as session:
            second = await seed_teacher_student_analytics(session, None)
        async with factory() as session:
            second_course_again = await seed_teacher_student_analytics(
                session,
                second_course_id,
            )
    finally:
        await engine.dispose()

    assert first["courseId"] == second["courseId"]
    assert first["studentIds"] == second["studentIds"]
    assert second_course["courseId"] == str(second_course_id)
    assert second_course_again["conversationIds"] == second_course["conversationIds"]
    assert first["conversationIds"] != second_course["conversationIds"]
    assert first["resourceIds"] != second_course["resourceIds"]
    assert first["studentIds"][0] == str(existing_student.id)
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
