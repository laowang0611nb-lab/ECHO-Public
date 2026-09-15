from fastapi import APIRouter

from app.api.routes import auth, chunks, courses, documents, health, knowledge

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chunks.router)
api_router.include_router(courses.router)
api_router.include_router(documents.router)
api_router.include_router(knowledge.router)
api_router.include_router(health.router)
