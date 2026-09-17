import type { CourseDocument } from "@echo/shared-types";
import { BookOpen, FileQuestion, FileText, Library, Presentation } from "lucide-react";

import { cn } from "@/lib/utils";
import { inferResourceKind } from "@/features/knowledge/view-model";

export function ResourceKindIcon({ document, className }: { document: CourseDocument; className?: string }) {
  const kind = inferResourceKind(document);
  const Icon = kind === "教学大纲" ? BookOpen : kind === "题库" ? FileQuestion : kind === "课件" ? Presentation : kind === "案例" ? Library : FileText;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary", className)}>
      <Icon className="size-5" />
    </span>
  );
}
