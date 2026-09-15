import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import (
    Conversation,
    Message,
    MessageCitation,
    MessageRole,
    TeachingPolicy,
)
from app.models.user import User
from app.schemas.chat import ConversationCreate
from app.schemas.search import ChunkSearchResult
from app.services.chat_provider import ChatProvider
from app.services.course import get_course_for_member
from app.services.embedding import EmbeddingProvider
from app.services.search import search_course_chunks


class ConversationNotFoundError(Exception):
    pass


class ConversationForbiddenError(Exception):
    pass


@dataclass(frozen=True)
class ChatEvent:
    event: str
    data: dict[str, object]

    def encode(self) -> str:
        payload = json.dumps(self.data, ensure_ascii=False)
        return f"event: {self.event}\ndata: {payload}\n\n"


async def create_conversation(
    session: AsyncSession,
    course_id: UUID,
    user: User,
    payload: ConversationCreate,
) -> Conversation:
    await get_course_for_member(session, course_id, user.id)
    conversation = Conversation(
        course_id=course_id,
        user_id=user.id,
        title=payload.title.strip() if payload.title else None,
    )
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def list_conversations(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> list[Conversation]:
    await get_course_for_member(session, course_id, user_id)
    conversations = await session.scalars(
        select(Conversation)
        .where(
            Conversation.course_id == course_id,
            Conversation.user_id == user_id,
        )
        .order_by(Conversation.updated_at.desc(), Conversation.created_at.desc())
    )
    return list(conversations)


async def list_messages(
    session: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
) -> list[Message]:
    conversation = await session.get(Conversation, conversation_id)
    if conversation is None:
        raise ConversationNotFoundError
    if conversation.user_id != user_id:
        raise ConversationForbiddenError
    messages = await session.scalars(
        select(Message)
        .options(selectinload(Message.citations))
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    return list(messages)


def _build_prompt(
    question: str,
    history: list[Message],
    sources: list[ChunkSearchResult],
    teaching_policy: str | None,
) -> list[dict[str, str]]:
    source_blocks = [
        f"[{index}] Pages {source.page_start}-{source.page_end}\n{source.content}"
        for index, source in enumerate(sources, start=1)
    ]
    source_text = "\n\n".join(source_blocks) if source_blocks else "No course sources found."
    policy_text = teaching_policy or "No additional teacher policy configured."
    system = (
        "You are ECHO, a course teaching agent. Answer in the student's language. "
        "Prefer the course sources, cite them as [1], [2], and clearly mark any "
        "course-external supplement. Guide thinking for homework-style questions "
        "instead of immediately revealing final answers.\n\n"
        f"TEACHER POLICY:\n{policy_text}\n\n"
        f"COURSE SOURCES:\n{source_text}"
    )
    prompt_messages = [{"role": "system", "content": system}]
    prompt_messages.extend(
        {"role": message.role.value, "content": message.content}
        for message in history[-10:]
        if message.role in {MessageRole.USER, MessageRole.ASSISTANT}
    )
    prompt_messages.append({"role": "user", "content": question})
    return prompt_messages


async def stream_chat_response(
    session: AsyncSession,
    embedding_provider: EmbeddingProvider,
    chat_provider: ChatProvider,
    conversation_id: UUID,
    user_id: UUID,
    content: str,
    retrieval_limit: int,
) -> AsyncIterator[ChatEvent]:
    conversation = await session.get(Conversation, conversation_id)
    if conversation is None:
        raise ConversationNotFoundError
    if conversation.user_id != user_id:
        raise ConversationForbiddenError

    sources = await search_course_chunks(
        session,
        embedding_provider,
        conversation.course_id,
        user_id,
        content,
        retrieval_limit,
    )
    policy = await session.scalar(
        select(TeachingPolicy).where(TeachingPolicy.course_id == conversation.course_id)
    )
    history = await list_messages(session, conversation_id, user_id)

    user_message = Message(
        conversation_id=conversation.id,
        role=MessageRole.USER,
        content=content,
        created_at=datetime.now(UTC),
    )
    session.add(user_message)
    if not conversation.title:
        conversation.title = content[:80]
    conversation.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(user_message)

    collected: list[str] = []
    try:
        prompt = _build_prompt(
            content,
            history,
            sources,
            policy.content if policy else None,
        )
        async for delta in chat_provider.stream(prompt):
            collected.append(delta)
            yield ChatEvent("text_delta", {"delta": delta})
    except Exception as exc:
        yield ChatEvent("error", {"detail": str(exc)})
        return

    assistant_message = Message(
        conversation_id=conversation.id,
        role=MessageRole.ASSISTANT,
        content="".join(collected),
        created_at=datetime.now(UTC),
    )
    assistant_message.citations = [
        MessageCitation(
            chunk_id=source.chunk_id,
            document_id=source.document_id,
            page_start=source.page_start,
            page_end=source.page_end,
            quote=source.content[:500],
        )
        for source in sources
    ]
    session.add(assistant_message)
    conversation.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(assistant_message)

    for index, source in enumerate(sources, start=1):
        yield ChatEvent(
            "citation",
            {
                "index": index,
                "chunk_id": str(source.chunk_id),
                "document_id": str(source.document_id),
                "page_start": source.page_start,
                "page_end": source.page_end,
            },
        )
    yield ChatEvent(
        "done",
        {
            "conversation_id": str(conversation.id),
            "message_id": str(assistant_message.id),
        },
    )
