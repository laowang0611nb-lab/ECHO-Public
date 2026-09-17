import { PlaceholderPage } from "@/components/common/placeholder-page";

export default function KnowledgeResourcePage() {
  return (
    <PlaceholderPage
      breadcrumbs={[{ label: "知识库", href: "/knowledge" }, { label: "资源详情" }]}
      description="资源详情、解析状态和来源定位将在知识库阶段正式实现。"
      title="知识库资源详情"
    />
  );
}
