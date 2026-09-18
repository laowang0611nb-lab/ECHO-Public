from types import SimpleNamespace
from uuid import UUID, uuid4

from database.models.course import CourseStatus
from database.models.user import UserRole
from sqlalchemy.exc import IntegrityError

from app.schemas.course import CourseJoinRequest
from app.services.course import join_course_by_code


class ExpiringUser:
    def __init__(self) -> None:
        self._id = uuid4()
        self.role = UserRole.STUDENT
        self.expired = False

    @property
    def id(self) -> UUID:
        if self.expired:
            raise RuntimeError("expired ORM attribute was accessed")
        return self._id


class FakeSession:
    def __init__(self, course: SimpleNamespace, user: ExpiringUser) -> None:
        self.course = course
        self.user = user
        self.scalar_calls = 0
        self.added: list[object] = []

    async def scalar(self, _: object) -> object | None:
        self.scalar_calls += 1
        if self.scalar_calls == 1:
            return self.course
        if self.scalar_calls == 2:
            return None
        return uuid4()

    def add(self, value: object) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        raise IntegrityError("insert", {}, Exception("duplicate"))

    async def rollback(self) -> None:
        self.user.expired = True

    async def get(self, _: object, course_id: UUID) -> object | None:
        if course_id == self.course.id:
            return self.course
        return None


async def test_join_race_rolls_back_without_accessing_expired_user() -> None:
    course = SimpleNamespace(
        id=uuid4(),
        code="ABCDEFGH",
        status=CourseStatus.PUBLISHED,
    )
    user = ExpiringUser()
    session = FakeSession(course, user)

    result = await join_course_by_code(
        session,  # type: ignore[arg-type]
        user,  # type: ignore[arg-type]
        CourseJoinRequest(code=course.code),
    )

    assert result is course
    assert session.added
