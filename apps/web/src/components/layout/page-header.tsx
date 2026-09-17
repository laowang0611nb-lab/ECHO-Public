import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem } from "@/components/layout/breadcrumb";

export function PageHeader({
  breadcrumbs = [],
  title,
  description,
  actions,
}: {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {breadcrumbs.length ? <Breadcrumb items={breadcrumbs} /> : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
