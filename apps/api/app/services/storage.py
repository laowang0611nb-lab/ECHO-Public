from pathlib import Path

import anyio
from fastapi import UploadFile


class DocumentTooLargeError(Exception):
    pass


class UnsupportedDocumentTypeError(Exception):
    pass


class LocalDocumentStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("storage key escapes configured root")
        return path

    async def save(self, key: str, upload: UploadFile, max_bytes: int) -> int:
        target = self.path_for(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.part")
        total_bytes = 0

        try:
            async with await anyio.open_file(temporary, "wb") as output:
                while chunk := await upload.read(1024 * 1024):
                    total_bytes += len(chunk)
                    if total_bytes > max_bytes:
                        raise DocumentTooLargeError
                    await output.write(chunk)
            temporary.replace(target)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

        return total_bytes

    def delete(self, key: str) -> None:
        self.path_for(key).unlink(missing_ok=True)
