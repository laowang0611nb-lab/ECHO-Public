from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

PASSWORD_ALGORITHM = "argon2id"
_password_hasher = PasswordHasher(type=Type.ID)


def hash_password(password: str) -> tuple[str, str]:
    if not password.strip():
        raise ValueError("password must not be blank")
    return _password_hasher.hash(password), PASSWORD_ALGORITHM


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
