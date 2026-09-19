import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const templates = [
  ["标准教学模式", "课程知识优先。概念问题可直接讲解，超出课程资料时明确标记。"],
  ["引导式教学", "习题和作业不直接给答案，先提示和追问，连续失败后再完整解释。"],
  ["苏格拉底式教学", "优先通过连续问题帮助学生发现概念之间的关系和错误。"],
  ["实践导向", "优先检索实践资料，提供步骤、检查点和常见问题排查建议。"],
] as const;

export function StrategyStep({
  value,
  pending,
  error,
  onChange,
}: {
  value: string;
  pending: boolean;
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardTitle>4 教学策略</CardTitle>
        <p className="text-sm text-muted-foreground">选择模板并编辑自然语言规则。点击底部“保存并进入发布”，保存成功后才能进入第 5 步确认发布。</p>
      </CardHeader>
      <CardContent className="space-y-5 px-6">
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map(([name, content]) => (
            <button className={cn("rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50", value === content ? "border-primary bg-blue-50" : "border-border")} key={name} onClick={() => onChange(content)} type="button">
              <p className="text-sm font-medium">{name}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{content}</p>
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">AI 教学规则</span>
          <Textarea className="min-h-52 resize-y" onChange={(event) => onChange(event.target.value)} value={value} />
        </label>
        {pending ? <p className="text-sm text-muted-foreground">正在保存教学策略，请稍候，不要重复提交...</p> : null}
        {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error} 修改后可直接再次点击，不会重复创建课程。</p> : null}
        <p className="text-xs text-muted-foreground">保存失败时不会进入发布步骤；请确认 API 服务和教师会话正常后重试。</p>
      </CardContent>
    </Card>
  );
}
