import { Suspense, type ReactNode } from "react";

import { LoadingState } from "@/components/common/loading-state";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { CourseWorkspaceProvider } from "@/providers/course-workspace-provider";
import { DemoProvider } from "@/features/demo/demo-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <CourseWorkspaceProvider>
      <DemoProvider>
        <Suspense fallback={<LoadingState label="正在加载教师工作台..." />}>
          <WorkspaceShell>{children}</WorkspaceShell>
        </Suspense>
      </DemoProvider>
    </CourseWorkspaceProvider>
  );
}
