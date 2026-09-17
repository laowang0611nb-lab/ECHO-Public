import { SourceViewerPage } from "@/features/knowledge/components/source-viewer-page";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function KnowledgeSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resourceId: string }>;
  searchParams: Promise<{
    from?: string | string[];
    page?: string | string[];
    chunkId?: string | string[];
    knowledgePointId?: string | string[];
    messageId?: string | string[];
  }>;
}) {
  const { resourceId } = await params;
  const query = await searchParams;
  const pageValue = Number(first(query.page));
  return (
    <SourceViewerPage
      chunkId={first(query.chunkId)}
      from={first(query.from) ?? "resource"}
      initialPage={Number.isFinite(pageValue) && pageValue > 0 ? pageValue : undefined}
      knowledgePointId={first(query.knowledgePointId)}
      messageId={first(query.messageId)}
      resourceId={resourceId}
    />
  );
}
