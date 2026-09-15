from app.db.base import Base


def test_core_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == {
        "course_invites",
        "course_members",
        "courses",
        "users",
    }


def test_course_member_pair_is_unique() -> None:
    constraints = Base.metadata.tables["course_members"].constraints
    unique_names = {constraint.name for constraint in constraints if constraint.name}

    assert "uq_course_members_course_user" in unique_names
