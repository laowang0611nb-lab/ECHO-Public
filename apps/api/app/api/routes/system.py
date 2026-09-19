import os
import socket
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from sqlalchemy import text

from app.api.dependencies import CurrentUser, DBSession
from app.core.config import settings
from app.schemas.system import (
    AIProviderStatus,
    DatabaseStatus,
    LanStatus,
    StorageStatus,
    SystemStatusResponse,
    VectorStatus,
)

router = APIRouter(prefix="/system", tags=["system"])


@router.get(
    "/status",
    response_model=SystemStatusResponse,
    summary="Read-only local deployment status",
)
async def system_status(
    request: Request,
    current_user: CurrentUser,
    session: DBSession,
) -> SystemStatusResponse:
    del current_user
    database, vector = await _database_and_vector_status(session)
    ai_provider = _ai_provider_status()
    storage = _storage_status()
    lan = _lan_status(request)
    states = {
        database.status,
        vector.status,
        ai_provider.status,
        storage.status,
    }
    overall = "offline" if "offline" in states else "warning" if states - {"healthy"} else "healthy"
    return SystemStatusResponse(
        status=overall,
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database,
        vector=vector,
        ai_provider=ai_provider,
        storage=storage,
        lan=lan,
        checked_at=datetime.now(UTC),
    )


async def _database_and_vector_status(session: DBSession) -> tuple[DatabaseStatus, VectorStatus]:
    started_at = time.perf_counter()
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        database = DatabaseStatus(
            status="offline",
            dialect="unknown",
            current_label="Unavailable",
            target_architecture="PostgreSQL + pgvector",
            latency_ms=latency_ms,
            message="Database connection failed.",
        )
        vector = VectorStatus(
            status="offline",
            available=False,
            engine="unknown",
            message="Vector capability cannot be checked while the database is offline.",
        )
        return database, vector

    latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
    dialect = session.get_bind().dialect.name
    if dialect == "sqlite":
        return (
            DatabaseStatus(
                status="warning",
                dialect=dialect,
                current_label="SQLite Development Database",
                target_architecture="PostgreSQL + pgvector",
                latency_ms=latency_ms,
                message=(
                    "Current development runtime uses SQLite; formal deployment target remains "
                    "PostgreSQL + pgvector."
                ),
            ),
            VectorStatus(
                status="warning",
                available=False,
                engine="SQLite development fallback",
                message=(
                    "pgvector is unavailable in the current development database. "
                    "Formal vector search requires PostgreSQL + pgvector."
                ),
            ),
        )

    if dialect == "postgresql":
        vector_available = bool(
            await session.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')")
            )
        )
        return (
            DatabaseStatus(
                status="healthy",
                dialect=dialect,
                current_label="PostgreSQL",
                target_architecture="PostgreSQL + pgvector",
                latency_ms=latency_ms,
                message="PostgreSQL connection succeeded.",
            ),
            VectorStatus(
                status="healthy" if vector_available else "warning",
                available=vector_available,
                engine="pgvector" if vector_available else "PostgreSQL without pgvector",
                message=(
                    "pgvector extension is available."
                    if vector_available
                    else "PostgreSQL is connected, but the pgvector extension is not installed."
                ),
            ),
        )

    return (
        DatabaseStatus(
            status="warning",
            dialect=dialect,
            current_label=dialect,
            target_architecture="PostgreSQL + pgvector",
            latency_ms=latency_ms,
            message=(
                "Database connection succeeded, but the dialect is not the formal "
                "deployment target."
            ),
        ),
        VectorStatus(
            status="warning",
            available=False,
            engine=dialect,
            message="Vector capability has not been verified for this database dialect.",
        ),
    )


def _ai_provider_status() -> AIProviderStatus:
    llm_configured = bool(settings.llm_api_key)
    chat_configured = bool(settings.chat_api_key)
    embedding_configured = bool(settings.embedding_api_key)
    configured = llm_configured and chat_configured and embedding_configured
    if configured:
        status = "healthy"
    elif llm_configured or chat_configured or embedding_configured:
        status = "warning"
    else:
        status = "unconfigured"
    return AIProviderStatus(
        status=status,
        configured=configured,
        chat_configured=chat_configured,
        embedding_configured=embedding_configured,
        model=settings.llm_model,
        chat_model=settings.chat_model,
        embedding_model=settings.embedding_model,
        message=(
            "Qwen-compatible LLM, chat, and embedding providers are configured."
            if configured
            else "One or more Qwen-compatible provider keys are not configured."
            if status == "warning"
            else "Qwen-compatible provider keys are not configured."
        ),
    )


def _storage_status() -> StorageStatus:
    root = settings.document_storage_root
    writable = root.exists() and os.access(root, os.W_OK)
    return StorageStatus(
        status="healthy" if writable else "warning",
        mode="local",
        path_label=root.name or str(root),
        writable=writable,
        message=(
            "Local file storage is available."
            if writable
            else "Local file storage directory is missing or not writable."
        ),
    )


def _lan_status(request: Request) -> LanStatus:
    port = request.url.port or 8000
    api_base_url = str(request.base_url).rstrip("/")
    candidates = _candidate_lan_ips()
    student_url = f"http://{candidates[0]}:{port}" if candidates else None
    return LanStatus(
        api_base_url=api_base_url,
        api_port=port,
        candidate_lan_ips=candidates,
        student_api_base_url=student_url,
        message=(
            "Candidate LAN addresses were detected. Verify that FastAPI listens on "
            "0.0.0.0 and Windows Firewall allows the API port."
            if candidates
            else "No non-loopback LAN address was detected. Check the hotspot or network adapter."
        ),
    )


def _candidate_lan_ips() -> list[str]:
    candidates: set[str] = set()
    try:
        for address in socket.gethostbyname_ex(socket.gethostname())[2]:
            if _is_candidate_lan_ip(address):
                candidates.add(address)
    except OSError:
        pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            address = probe.getsockname()[0]
            if _is_candidate_lan_ip(address):
                candidates.add(address)
    except OSError:
        pass

    return sorted(candidates)


def _is_candidate_lan_ip(address: str) -> bool:
    return not (
        address.startswith("127.") or address.startswith("169.254.") or address == "0.0.0.0"
    )
