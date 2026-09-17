import { StudentConversationPage } from "@/features/students/components/student-conversation-page";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentConversationRoute({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; conversationId: string }>;
  searchParams: Promise<{
    from?: string | string[];
    messageId?: string | string[];
    knowledgePointId?: string | string[];
  }>;
}) {
  const { studentId, conversationId } = await params;
  const query = await searchParams;
  return (
    <StudentConversationPage
      conversationId={conversationId}
      from={first(query.from) ?? "student"}
      knowledgePointId={first(query.knowledgePointId)}
      messageId={first(query.messageId)}
      studentId={studentId}
    />
  );
}
