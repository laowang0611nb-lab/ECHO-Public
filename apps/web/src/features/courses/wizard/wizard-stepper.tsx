import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WizardStep } from "@/features/courses/wizard/types";

const steps = ["基本信息", "导入教材", "AI 解析", "教学策略", "确认发布"];

export function WizardStepper({ currentStep }: { currentStep: WizardStep }) {
  return (
    <ol className="grid grid-cols-5 items-start gap-2">
      {steps.map((label, index) => {
        const step = (index + 1) as WizardStep;
        const completed = step < currentStep;
        const active = step === currentStep;
        return (
          <li className="relative flex min-w-0 flex-col items-center text-center" key={label}>
            {index < steps.length - 1 ? (
              <span className={cn("absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-4 h-px bg-border", completed && "bg-primary")} />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-semibold",
                active && "border-primary bg-primary text-primary-foreground",
                completed && "border-primary bg-primary text-primary-foreground",
                !active && !completed && "border-blue-200 text-muted-foreground",
              )}
            >
              {completed ? <Check className="size-4" /> : step}
            </span>
            <span className={cn("mt-2 max-w-full text-sm", active ? "font-semibold text-primary" : "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
