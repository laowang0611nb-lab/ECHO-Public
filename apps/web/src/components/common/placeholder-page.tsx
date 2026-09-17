import { PageHeader } from "@/components/layout/page-header";

export function PlaceholderPage({
  title,
  description,
  breadcrumbs,
}: {
  title: string;
  description: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="space-y-6">
      <PageHeader breadcrumbs={breadcrumbs} description={description} title={title} />
      <section className="border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">页面将在后续阶段实现</p>
        <p className="mt-2 text-sm text-muted-foreground">当前阶段只完成导航骨架，不提供未确认的业务 UI。</p>
      </section>
    </div>
  );
}
