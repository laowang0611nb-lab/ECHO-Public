import type { Metadata } from "next";
import type { ReactNode } from "react";
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
        <QueryProvider>
          <TeacherSessionProvider>{children}</TeacherSessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
