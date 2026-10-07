import type { ReactNode } from "react";

export function AuthPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[18px] border border-[rgba(65,145,235,0.22)] bg-white/88 p-5 shadow-[0_18px_55px_rgba(52,112,190,0.14),0_0_28px_rgba(88,135,235,0.08)] backdrop-blur-[14px] sm:p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
