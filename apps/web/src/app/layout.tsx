import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WebBackground } from "@/components/layout/web-background";
import { QueryProvider } from "@/providers/query-provider";
import { TeacherSessionProvider } from "@/providers/teacher-session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECHO Teacher",
  description: "ECHO teacher workspace",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <WebBackground />
        <div className="relative z-10 min-h-screen">
          <QueryProvider>
            <TeacherSessionProvider>{children}</TeacherSessionProvider>
          </QueryProvider>
        </div>
      </body>
    </html>
  );
}
