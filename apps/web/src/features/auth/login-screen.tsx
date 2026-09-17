"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function LoginScreen() {
  const { login } = useTeacherSession();
  const [email, setEmail] = useState("teacher@example.com");
  const [displayName, setDisplayName] = useState("演示教师");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login({ email: email.trim(), display_name: displayName.trim(), role: "teacher" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "登录失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-semibold text-primary">ECHO</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">教师工作台</h1>
        <p className="mt-2 text-sm text-muted-foreground">登录后进入课程教学总览。</p>
        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">邮箱</span>
            <Input onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">显示名称</span>
            <Input onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
          </label>
          {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "正在登录..." : "进入工作台"}
          </Button>
        </form>
      </section>
    </main>
  );
}
