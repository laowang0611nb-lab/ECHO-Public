import { ShieldCheck } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";
import { HexagonBackground } from "@/features/auth/components/hexagon-background";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white px-4 py-8 sm:px-6 sm:py-12">
      <HexagonBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link className="flex items-center gap-2 text-foreground" href="/login">
            <span className="rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">ECHO</span>
            <span className="text-sm font-semibold">教师工作台</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            教师端认证
          </span>
        </header>
        <PageMotion>{children}</PageMotion>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          认证请求仅通过 ECHO API 发出；验证码和验证票据不会写入浏览器存储。
        </p>
      </div>
    </main>
  );
}
