import { Lightbulb } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { WizardStep } from "@/features/courses/wizard/types";

const steps = [
  ["基本信息", "填写课程基本信息"],
  ["导入教材", "上传教材和教学资料"],
  ["AI 解析", "自动抽取章节、知识点和构建知识库"],
  ["教学策略", "设置教学目标与教学策略"],
  ["确认发布", "预览并发布课程"],
] as const;

export function WizardAside({ currentStep }: { currentStep: WizardStep }) {
  return (
    <aside className="space-y-4">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <div className="flex items-center justify-between">
            <CardTitle>创建进度</CardTitle>
            <span className="text-xs text-muted-foreground">{currentStep}/5</span>
          </div>
          <Progress className="mt-3" value={currentStep * 20} />
        </CardHeader>
        <CardContent className="space-y-3 px-5">
          {steps.map(([title, description], index) => {
            const step = (index + 1) as WizardStep;
            return (
              <div className={cn("rounded-lg border border-transparent px-3 py-2", step === currentStep && "border-blue-100 bg-blue-50")} key={title}>
                <p className={cn("text-sm font-medium", step === currentStep ? "text-primary" : "text-foreground")}>
                  {step}. {title}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="gap-3 border-orange-100 bg-orange-50/50 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lightbulb className="size-4 text-orange-500" />
            小贴士
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-5 text-xs leading-5 text-muted-foreground">
          <p>课程名称建议简洁明确，便于学生识别。</p>
          <p>上传教材后，AI 将自动解析章节和知识点。</p>
          <p>发布前可以返回任意步骤修改信息。</p>
        </CardContent>
      </Card>
    </aside>
  );
}
