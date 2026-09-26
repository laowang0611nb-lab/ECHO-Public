from __future__ import annotations

import json
from pathlib import Path

from pypdf import PdfReader
from scripts.demo_data.build_software_engineering_package import (
    TARGET_TEACHER_EMAIL,
    TARGET_TEACHER_NAME,
    build_software_engineering_package,
)
from scripts.demo_data.validate_software_engineering_package import validate_package


def test_software_engineering_handoff_package_is_complete_and_valid(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "software-engineering-class-v1"
    manifest = build_software_engineering_package(
        package_root,
        create_zip=True,
        allowed_root=tmp_path,
    )

    assert manifest["target_teacher_email"] == TARGET_TEACHER_EMAIL
    assert manifest["target_teacher_name"] == TARGET_TEACHER_NAME
    assert manifest["databaseWritePerformedByBuilder"] is False
    assert manifest["secretsIncluded"] is False
    assert manifest["course"] == {
        "courseId": "cef819f7-63b7-50f8-806c-cf0687b2a3cf",
        "courseCode": "SE101",
        "courseName": "软件工程",
        "term": "2026 秋季学期",
        "studentCount": 48,
        "chapterCount": 12,
        "knowledgePointCount": 84,
        "status": "published",
    }
    assert manifest["counts"]["users"] == 49
    assert manifest["counts"]["students"] == 48
    assert manifest["counts"]["documents"] == 4
    assert manifest["counts"]["assignments"] == 12
    assert manifest["counts"]["assignment-submissions"] == 576
    assert manifest["counts"]["learning-events"] == 2016
    assert manifest["counts"]["student-knowledge-states"] == 4032
    assert manifest["counts"]["mastery-snapshots"] == 28224
    assert manifest["counts"]["conversations"] == 96
    assert manifest["counts"]["messages"] == 576
    assert manifest["counts"]["message-citations"] == 288
    assert manifest["counts"]["ai-review-flags"] == 96

    assert len(manifest["entities"]) == 44
    assert len(manifest["resources"]) == 4
    assert sum(resource["pageCount"] for resource in manifest["resources"]) == 160
    for resource in manifest["resources"]:
        path = package_root / resource["packagePath"]
        assert path.is_file()
        assert path.stat().st_size == resource["sizeBytes"]
        assert len(PdfReader(str(path)).pages) == resource["pageCount"]
        assert len(resource["citationPages"]) == len(set(resource["citationPages"]))

    report = validate_package(package_root)
    assert report["status"] == "passed"
    assert report["errors"] == []
    assert report["warnings"] == []
    assert report["resourceCount"] == 4
    assert report["checksumCount"] > 0

    checksum_path = package_root / "checksums.sha256"
    assert checksum_path.is_file()
    assert len(checksum_path.read_text(encoding="utf-8").splitlines()) == (
        report["checksumCount"]
    )

    zip_path = package_root.with_suffix(".zip")
    zip_checksum_path = Path(f"{zip_path}.sha256")
    assert zip_path.is_file()
    assert zip_checksum_path.is_file()
    zip_checksum = zip_checksum_path.read_text(encoding="utf-8").split()[0]
    assert len(zip_checksum) == 64

    manifest_on_disk = json.loads(
        (package_root / "manifest.json").read_text(encoding="utf-8")
    )
    assert manifest_on_disk["validation"]["status"] == "passed"
    assert (
        manifest_on_disk["target_teacher_email"]
        == TARGET_TEACHER_EMAIL
    )
