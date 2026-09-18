from fastapi import APIRouter

from app.api.routes import (
    auth,
    chat,
    chunks,
    courses,
    dashboard,
    dashboard_details,
    demo,
    documents,
    health,
    knowledge,
    learning,
    planning,
    review,
    search,
    system,
    teacher_resources,
    teaching_policy,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chat.router)
api_router.include_router(chunks.router)
api_router.include_router(dashboard.router)
api_router.include_router(dashboard_details.router)
api_router.include_router(demo.router)
api_router.include_router(courses.router)
api_router.include_router(documents.router)
api_router.include_router(knowledge.router)
api_router.include_router(learning.router)
api_router.include_router(planning.router)
api_router.include_router(review.router)
api_router.include_router(system.router)
api_router.include_router(search.router)
api_router.include_router(teaching_policy.router)
api_router.include_router(teacher_resources.router)
api_router.include_router(health.router)
