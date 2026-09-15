from fastapi import APIRouter

from app.api.routes import (
    auth,
    chat,
    chunks,
    courses,
    documents,
    health,
    knowledge,
    learning,
    search,
    teaching_policy,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chat.router)
api_router.include_router(chunks.router)
api_router.include_router(courses.router)
api_router.include_router(documents.router)
api_router.include_router(knowledge.router)
api_router.include_router(learning.router)
api_router.include_router(search.router)
api_router.include_router(teaching_policy.router)
api_router.include_router(health.router)
