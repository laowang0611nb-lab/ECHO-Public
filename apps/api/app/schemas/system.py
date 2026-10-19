from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ServiceState = Literal["healthy", "warning", "offline", "unconfigured"]


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str


class DatabaseStatus(BaseModel):
    status: ServiceState
    dialect: str
    current_label: str
    target_architecture: str
    latency_ms: int
    message: str


class VectorStatus(BaseModel):
    status: ServiceState
    available: bool
    engine: str
    message: str


class AIProviderStatus(BaseModel):
    status: ServiceState
    configured: bool
    chat_configured: bool
    embedding_configured: bool
    model: str
    chat_model: str
    embedding_model: str
    message: str


class StorageStatus(BaseModel):
    status: ServiceState
    mode: str
    path_label: str
    writable: bool
    message: str


class LanStatus(BaseModel):
    api_base_url: str
    api_port: int
    candidate_lan_ips: list[str]
    student_api_base_url: str | None
    message: str


class SystemStatusResponse(BaseModel):
    status: ServiceState
    service: str
    version: str
    environment: str
    deployment_mode: Literal["local", "public_demo"]
    public_base_url: str
    teacher_web_base_url: str
    public_registration_enabled: bool
    database: DatabaseStatus
    vector: VectorStatus
    ai_provider: AIProviderStatus
    storage: StorageStatus
    lan: LanStatus
    checked_at: datetime
