from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from database.auth.password import PASSWORD_ALGORITHM, hash_password, verify_password
from database.auth.sessions import (
    create_auth_session,
    get_auth_session_by_refresh_token,
    revoke_auth_session,
    rotate_refresh_token,
)
from database.models.auth import AuthSession, UserCredential
from database.models.profile import StudentProfile, TeacherProfile
from database.models.user import User, UserRole, UserStatus


async def test_user_account_defaults_and_username_uniqueness(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        teacher = User(
            email="teacher@example.com",
            username="teacher-one",
            display_name="Teacher",
            role=UserRole.TEACHER,
        )
        student = User(
            email="student@example.com",
            display_name="Student",
            role=UserRole.STUDENT,
        )
        session.add_all([teacher, student])
        await session.commit()
        await session.refresh(teacher)
        await session.refresh(student)

        assert teacher.status == UserStatus.ACTIVE
        assert student.status == UserStatus.ACTIVE
        assert teacher.role == UserRole.TEACHER
        assert student.role == UserRole.STUDENT

        session.add(
            User(
                email="other@example.com",
                username="teacher-one",
                display_name="Duplicate",
                role=UserRole.STUDENT,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_phone_identity_is_unique_in_database(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        first = User(
            email="phone-one@example.com",
            phone="13800138000",
            display_name="Phone One",
            role=UserRole.TEACHER,
        )
        session.add(first)
        await session.commit()

        session.add(
            User(
                email="phone-two@example.com",
                phone="13800138000",
                display_name="Phone Two",
                role=UserRole.STUDENT,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_credential_hash_verify_and_profile_one_to_one(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = User(
            email="credential@example.com",
            display_name="Credential User",
            role=UserRole.TEACHER,
        )
        session.add(user)
        await session.flush()
        password_hash, algorithm = hash_password("correct horse battery staple")
        session.add(
            UserCredential(
                user_id=user.id,
                password_hash=password_hash,
                password_algorithm=algorithm,
            )
        )
        session.add(
            TeacherProfile(
                user_id=user.id,
                school_name="ECHO University",
                employee_no="T-001",
            )
        )
        await session.commit()

        credential = await session.get(UserCredential, user.id)
        profile = await session.get(TeacherProfile, user.id)
        assert credential is not None
        assert credential.password_hash != "correct horse battery staple"
        assert credential.password_algorithm == PASSWORD_ALGORITHM
        assert verify_password("correct horse battery staple", credential.password_hash)
        assert not verify_password("wrong password", credential.password_hash)
        assert profile is not None
        assert profile.school_name == "ECHO University"

        async with session_factory() as duplicate_session:
            duplicate_session.add(
                TeacherProfile(user_id=user.id, school_name="Duplicate Profile")
            )
            with pytest.raises(IntegrityError):
                await duplicate_session.commit()


async def test_student_profile_and_users_without_profiles_are_valid(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        student = User(
            email="student-profile@example.com",
            display_name="Student Profile",
            role=UserRole.STUDENT,
        )
        historical = User(
            email="historical@example.com",
            display_name="Historical",
            role=UserRole.STUDENT,
        )
        session.add_all([student, historical])
        await session.flush()
        session.add(
            StudentProfile(
                user_id=student.id,
                student_no="S-001",
                major="Software Engineering",
                grade="2026",
                class_name="SE-1",
            )
        )
        await session.commit()

        assert await session.get(StudentProfile, student.id) is not None
        assert await session.get(StudentProfile, historical.id) is None
        assert await session.get(TeacherProfile, historical.id) is None


async def test_refresh_token_rotation_revokes_previous_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime.now(UTC)
    async with session_factory() as session:
        user = User(
            email="rotation@example.com",
            display_name="Rotation User",
            role=UserRole.STUDENT,
        )
        session.add(user)
        await session.flush()
        original_session, original_token = await create_auth_session(
            session,
            user.id,
            now=now,
        )
        await session.commit()

        rotation_time = now + timedelta(minutes=1)
        rotated = await rotate_refresh_token(
            session,
            original_token,
            now=rotation_time,
        )
        assert rotated is not None
        rotated_session, rotated_token = rotated
        await session.commit()

        assert rotated_session.id != original_session.id
        assert rotated_token != original_token
        assert (
            await get_auth_session_by_refresh_token(
                session,
                original_token,
                now=rotation_time,
            )
            is None
        )
        stored_rotated = await get_auth_session_by_refresh_token(
            session,
            rotated_token,
            now=rotation_time,
        )
        assert stored_rotated is not None
        assert stored_rotated.id == rotated_session.id


async def test_auth_session_create_expire_revoke_and_cascade(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime.now(UTC)
    async with session_factory() as session:
        user = User(
            email="session@example.com",
            display_name="Session User",
            role=UserRole.STUDENT,
        )
        session.add(user)
        await session.flush()
        user_id = user.id
        password_hash, algorithm = hash_password("session password")
        session.add(
            UserCredential(
                user_id=user.id,
                password_hash=password_hash,
                password_algorithm=algorithm,
            )
        )

        auth_session, refresh_token = await create_auth_session(
            session,
            user.id,
            device_name="pytest",
            expires_delta=timedelta(days=1),
            now=now,
        )
        await session.commit()
        assert auth_session.refresh_token_hash != refresh_token
        await revoke_auth_session(session, auth_session, now=now)
        await session.commit()
        assert auth_session.revoked_at is not None

        session.add(
            AuthSession(
                user_id=user_id,
                refresh_token_hash=auth_session.refresh_token_hash,
                expires_at=now + timedelta(days=1),
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        expired_session, _ = await create_auth_session(
            session,
            user_id,
            expires_delta=timedelta(seconds=-1),
            now=now,
        )
        await session.commit()
        assert expired_session.expires_at < now
        assert await get_auth_session_by_refresh_token(session, "unknown-token") is None

        stored_user = await session.get(User, user_id)
        assert stored_user is not None
        await session.delete(stored_user)
        await session.commit()
        session_count = await session.scalar(
            select(func.count()).select_from(AuthSession)
        )
        credential_count = await session.scalar(
            select(func.count()).select_from(UserCredential)
        )
        assert session_count == 0
        assert credential_count == 0
