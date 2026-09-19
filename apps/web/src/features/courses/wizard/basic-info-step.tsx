import type { CourseBasicInfo } from "@/features/courses/wizard/schema";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Field({ label, children, error, hint }: { label: string; children: React.ReactNode; error?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
      {hint && !error ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function BasicInfoStep({
  value,
  errors,
  onChange,
}: {
  value: CourseBasicInfo;
  errors: Partial<Record<keyof CourseBasicInfo, string>>;
  onChange: (value: CourseBasicInfo) => void;
}) {
  const terms = ["2026 秋季学期", "2027 春季学期", "自定义学期"];
  const courseTypes = ["专业课程", "公共基础课", "实验课程", "选修课程", "其他"] as const;

  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardTitle>1 课程基本信息</CardTitle>
        <p className="text-sm text-muted-foreground">填写课程基本信息，这些内容将用于创建课程并配置后续教学流程。</p>
      </CardHeader>
      <CardContent className="grid gap-5 px-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Field error={errors.name} label="课程名称 *">
            <Input onChange={(event) => onChange({ ...value, name: event.target.value })} value={value.name} />
          </Field>
          <Field error={errors.courseCode} hint="课程加入码由后端自动生成，当前字段仅作草稿标记。" label="课程代码">
            <Input disabled placeholder="创建后自动生成" value={value.courseCode} />
          </Field>
          <Field error={errors.description} label={`课程简介 * (${value.description.length}/500)`}>
            <Textarea className="min-h-32 resize-y" maxLength={500} onChange={(event) => onChange({ ...value, description: event.target.value })} value={value.description} />
          </Field>
        </div>

        <div className="space-y-5">
          <Field error={errors.term} label="学期 *">
            <Select items={terms.map((term) => ({ value: term, label: term }))} onValueChange={(term) => term && onChange({ ...value, term })} value={value.term}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{terms.map((term) => <SelectItem key={term} value={term}>{term}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field error={errors.courseType} label="课程类型 *">
            <Select items={courseTypes.map((type) => ({ value: type, label: type }))} onValueChange={(type) => type && onChange({ ...value, courseType: type as CourseBasicInfo["courseType"] })} value={value.courseType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{courseTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field error={errors.audience} label="适用对象">
            <Input onChange={(event) => onChange({ ...value, audience: event.target.value })} value={value.audience} />
          </Field>
          <Field error={errors.expectedStudents} label="预期学生人数">
            <Input inputMode="numeric" onChange={(event) => onChange({ ...value, expectedStudents: event.target.value })} placeholder="例如：50" value={value.expectedStudents} />
          </Field>
        </div>
        <p className="lg:col-span-2 text-xs text-muted-foreground">课程类型、适用对象和预期人数会随课程创建请求一并保存，并可在课程设置中继续修改。</p>
      </CardContent>
    </Card>
  );
}
