import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { CourseWorkspaceProvider } from "@/providers/course-workspace-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <CourseWorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </CourseWorkspaceProvider>
  );
}
