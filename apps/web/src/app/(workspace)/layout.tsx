import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { CourseWorkspaceProvider } from "@/providers/course-workspace-provider";
import { DemoProvider } from "@/features/demo/demo-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <CourseWorkspaceProvider>
      <DemoProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </DemoProvider>
    </CourseWorkspaceProvider>
  );
}
