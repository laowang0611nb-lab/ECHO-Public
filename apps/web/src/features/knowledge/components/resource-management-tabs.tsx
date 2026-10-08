"use client";

import type {
  Chapter,
  ExternalResource,
  ExternalResourceCreateRequest,
  ExternalResourceStatus,
  KnowledgePoint,
  QuestionDifficulty,
  QuestionItem,
  QuestionItemCreateRequest,
  QuestionType,
} from "@echo/shared-types";
import { ExternalLink, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateExternalResource,
  useCreateQuestionItem,
  useDeleteExternalResource,
  useDeleteQuestionItem,
  useExternalResources,
  useQuestionItems,
  useUpdateExternalResource,
  useUpdateQuestionItem,
} from "@/features/knowledge/queries";

const questionTypes: Array<{ value: QuestionType; label: string }> = [
  { value: "single_choice", label: "单选题" },
  { value: "multiple_choice", label: "多选题" },
  { value: "true_false", label: "判断题" },
  { value: "short_answer", label: "简答题" },
  { value: "coding", label: "编程题" },
  { value: "experiment", label: "实验题" },
];

const difficulties: Array<{ value: QuestionDifficulty; label: string }> = [
  { value: "easy", label: "基础" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "困难" },
];

const externalStatuses: Array<{ value: ExternalResourceStatus; label: string }> = [
  { value: "unchecked", label: "未校验" },
  { value: "valid", label: "链接有效" },
  { value: "invalid", label: "链接失效" },
  { value: "unknown", label: "状态未知" },
];

function pointsFromChapters(chapters: Chapter[]) {
  return chapters.flatMap((chapter) => chapter.knowledge_points);
}

function questionTypeLabel(type: QuestionType) {
  return questionTypes.find((item) => item.value === type)?.label ?? type;
}

function difficultyLabel(difficulty: QuestionDifficulty) {
  return difficulties.find((item) => item.value === difficulty)?.label ?? difficulty;
}

function externalStatusLabel(status: ExternalResourceStatus) {
  return externalStatuses.find((item) => item.value === status)?.label ?? status;
}

function externalStatusTone(status: ExternalResourceStatus) {
  if (status === "valid") return "success" as const;
  if (status === "invalid") return "danger" as const;
  return "neutral" as const;
}

export function QuestionItemsTab({
  courseId,
  query,
  chapters,
}: {
  courseId: string;
  query: ReturnType<typeof useQuestionItems>;
  chapters: Chapter[];
}) {
  const knowledgePoints = useMemo(() => pointsFromChapters(chapters), [chapters]);
  const [editing, setEditing] = useState<QuestionItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<QuestionItem | null>(null);
  const createMutation = useCreateQuestionItem(courseId);
  const updateMutation = useUpdateQuestionItem(courseId);
  const deleteMutation = useDeleteQuestionItem(courseId);

  if (query.isLoading) return <LoadingState label="正在加载示例与习题..." />;
  if (query.isError) return <ErrorState description="示例与习题加载失败。" onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(item: QuestionItem) {
    setEditing(item);
    setDialogOpen(true);
  }

  async function removeItem() {
    if (!deleteItem) return;
    try {
      await deleteMutation.mutateAsync(deleteItem.id);
    } catch {
      // Mutation state renders the backend error.
    }
    setDeleteItem(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">示例与习题</p>
          <p className="mt-1 text-xs text-muted-foreground">题目、答案和知识点关联通过正式题库接口维护。</p>
        </div>
        <Button onClick={openCreate} type="button">
          <Plus data-icon="inline-start" />新增题目
        </Button>
      </div>
      {createMutation.isError || updateMutation.isError || deleteMutation.isError ? (
        <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {(createMutation.error ?? updateMutation.error ?? deleteMutation.error) instanceof Error
            ? (createMutation.error ?? updateMutation.error ?? deleteMutation.error)?.message
            : "题目操作失败。"}
        </p>
      ) : null}
      {items.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <Card className="gap-3 py-5" key={item.id}>
              <CardHeader className="px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="min-w-0 truncate">{item.title}</CardTitle>
                  <div className="flex gap-2">
                    <StatusBadge tone="info">{questionTypeLabel(item.type)}</StatusBadge>
                    <StatusBadge tone={item.difficulty === "hard" ? "danger" : item.difficulty === "medium" ? "warning" : "success"}>
                      {difficultyLabel(item.difficulty)}
                    </StatusBadge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-5 text-sm leading-6">
                <p className="line-clamp-4 whitespace-pre-wrap">{item.content}</p>
                <p className="text-xs text-muted-foreground">
                  关联知识点 {item.knowledge_point_ids.length} 个{item.source_page ? ` · 来源第 ${item.source_page} 页` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => openEdit(item)} size="sm" type="button" variant="outline">
                    <Pencil data-icon="inline-start" />编辑
                  </Button>
                  <Button onClick={() => setDeleteItem(item)} size="sm" type="button" variant="destructive">
                    <Trash2 data-icon="inline-start" />删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState description="当前课程还没有题库、代码示例或实验题目，可由教师手动新增。" title="暂无示例与习题数据" />
      )}

      <QuestionItemDialog
        courseId={courseId}
        item={editing}
        key={editing?.id ?? "new-question"}
        knowledgePoints={knowledgePoints}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        pending={createMutation.isPending || updateMutation.isPending}
        onSubmit={async (payload) => {
          if (editing) {
            await updateMutation.mutateAsync({ itemId: editing.id, payload });
          } else {
            await createMutation.mutateAsync(payload);
          }
          setDialogOpen(false);
        }}
      />

      <ConfirmDeleteDialog
        description="删除后题目会进入回收站，可由课程资源回收站恢复。"
        onConfirm={() => void removeItem()}
        onOpenChange={(open) => { if (!open) setDeleteItem(null); }}
        open={Boolean(deleteItem)}
        pending={deleteMutation.isPending}
        title={`删除题目“${deleteItem?.title ?? ""}”？`}
      />
    </div>
  );
}

function QuestionItemDialog({
  courseId,
  item,
  knowledgePoints,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  courseId: string;
  item: QuestionItem | null;
  knowledgePoints: KnowledgePoint[];
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: QuestionItemCreateRequest) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  const [explanation, setExplanation] = useState(item?.explanation ?? "");
  const [type, setType] = useState<QuestionType>(item?.type ?? "single_choice");
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(item?.difficulty ?? "medium");
  const [knowledgePointIds, setKnowledgePointIds] = useState<string[]>(item?.knowledge_point_ids ?? []);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !content.trim()) {
      setError("题目标题和题目内容不能为空。");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        answer: answer.trim() || null,
        explanation: explanation.trim() || null,
        type,
        difficulty,
        knowledge_point_ids: knowledgePointIds,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "题目操作失败。");
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "编辑题目" : "新增题目"}</DialogTitle>
          <DialogDescription>保存后立即进入当前课程题库，并可从知识点详情查看关联题目。</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[66vh] gap-4 overflow-y-auto py-2 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-muted-foreground">题目标题</span>
            <Input maxLength={255} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">题型</span>
            <Select items={questionTypes} onValueChange={(value) => value && setType(value as QuestionType)} value={type}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{questionTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">难度</span>
            <Select items={difficulties} onValueChange={(value) => value && setDifficulty(value as QuestionDifficulty)} value={difficulty}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{difficulties.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-muted-foreground">题目内容</span>
            <Textarea className="min-h-32" onChange={(event) => setContent(event.target.value)} value={content} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">参考答案</span>
            <Textarea className="min-h-24" onChange={(event) => setAnswer(event.target.value)} value={answer} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">解析</span>
            <Textarea className="min-h-24" onChange={(event) => setExplanation(event.target.value)} value={explanation} />
          </label>
          <KnowledgePointPicker
            knowledgePoints={knowledgePoints}
            onChange={setKnowledgePointIds}
            selectedIds={knowledgePointIds}
          />
          {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={pending || !courseId} onClick={() => void submit()} type="button">
            <Save data-icon="inline-start" />{pending ? "正在保存..." : "保存题目"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExternalResourcesTab({
  courseId,
  query,
  chapters,
}: {
  courseId: string;
  query: ReturnType<typeof useExternalResources>;
  chapters: Chapter[];
}) {
  const knowledgePoints = useMemo(() => pointsFromChapters(chapters), [chapters]);
  const [editing, setEditing] = useState<ExternalResource | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ExternalResource | null>(null);
  const createMutation = useCreateExternalResource(courseId);
  const updateMutation = useUpdateExternalResource(courseId);
  const deleteMutation = useDeleteExternalResource(courseId);

  if (query.isLoading) return <LoadingState label="正在加载外部资源..." />;
  if (query.isError) return <ErrorState description="外部资源加载失败。" onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];

  async function removeItem() {
    if (!deleteItem) return;
    try {
      await deleteMutation.mutateAsync(deleteItem.id);
    } catch {
      // Mutation state renders the backend error.
    }
    setDeleteItem(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">外部资源</p>
          <p className="mt-1 text-xs text-muted-foreground">登记平台链接、网页资料和教学参考，并维护校验状态。</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} type="button">
          <Plus data-icon="inline-start" />新增外部资源
        </Button>
      </div>
      {createMutation.isError || updateMutation.isError || deleteMutation.isError ? (
        <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {(createMutation.error ?? updateMutation.error ?? deleteMutation.error) instanceof Error
            ? (createMutation.error ?? updateMutation.error ?? deleteMutation.error)?.message
            : "外部资源操作失败。"}
        </p>
      ) : null}
      {items.length ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card className="gap-3 py-5" key={item.id}>
              <CardHeader className="px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{item.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.provider || "外部来源"} · {item.last_verified_at ? `校验于 ${item.last_verified_at.slice(0, 10)}` : "尚未校验"}
                    </p>
                  </div>
                  <StatusBadge tone={externalStatusTone(item.check_status)}>{externalStatusLabel(item.check_status)}</StatusBadge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 px-5 text-sm">
                <p className="min-w-0 flex-1 text-muted-foreground">{item.description || "暂无描述"}</p>
                <div className="flex flex-wrap gap-2">
                  <a className={buttonVariants({ size: "sm", variant: "outline" })} href={item.url} rel="noreferrer" target="_blank"><ExternalLink data-icon="inline-start" />打开链接</a>
                  <Button onClick={() => { setEditing(item); setDialogOpen(true); }} size="sm" type="button" variant="outline"><Pencil data-icon="inline-start" />编辑</Button>
                  <Button onClick={() => setDeleteItem(item)} size="sm" type="button" variant="destructive"><Trash2 data-icon="inline-start" />删除</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState description="当前课程还没有登记外部链接或平台资源，可由教师手动新增。" title="暂无外部资源" />
      )}

      <ExternalResourceDialog
        item={editing}
        key={editing?.id ?? "new-external"}
        knowledgePoints={knowledgePoints}
        onOpenChange={setDialogOpen}
        onSubmit={async (payload) => {
          if (editing) {
            await updateMutation.mutateAsync({ resourceId: editing.id, payload });
          } else {
            await createMutation.mutateAsync(payload);
          }
          setDialogOpen(false);
        }}
        open={dialogOpen}
        pending={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDeleteDialog
        description="删除后外部资源会进入回收站，可由课程资源回收站恢复。"
        onConfirm={() => void removeItem()}
        onOpenChange={(open) => { if (!open) setDeleteItem(null); }}
        open={Boolean(deleteItem)}
        pending={deleteMutation.isPending}
        title={`删除外部资源“${deleteItem?.title ?? ""}”？`}
      />
    </div>
  );
}

function ExternalResourceDialog({
  item,
  knowledgePoints,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  item: ExternalResource | null;
  knowledgePoints: KnowledgePoint[];
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ExternalResourceCreateRequest & { check_status?: ExternalResourceStatus }) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [provider, setProvider] = useState(item?.provider ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status, setStatus] = useState<ExternalResourceStatus>(item?.check_status ?? "unchecked");
  const [knowledgePointIds, setKnowledgePointIds] = useState<string[]>(item?.knowledge_point_ids ?? []);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !url.trim()) {
      setError("标题和 URL 不能为空。");
      return;
    }
    setError(null);
    const payload: ExternalResourceCreateRequest & { check_status?: ExternalResourceStatus } = {
      title: title.trim(),
      url: url.trim(),
      provider: provider.trim() || null,
      description: description.trim() || null,
      knowledge_point_ids: knowledgePointIds,
    };
    if (item) payload.check_status = status;
    try {
      await onSubmit(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "外部资源操作失败。");
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "编辑外部资源" : "新增外部资源"}</DialogTitle>
          <DialogDescription>外部链接只登记和校验状态，不自动抓取网页内容。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">标题</span>
            <Input maxLength={255} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">来源平台</span>
            <Input onChange={(event) => setProvider(event.target.value)} value={provider} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-muted-foreground">URL</span>
            <Input onChange={(event) => setUrl(event.target.value)} placeholder="https://" type="url" value={url} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-muted-foreground">描述</span>
            <Textarea className="min-h-24" onChange={(event) => setDescription(event.target.value)} value={description} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">校验状态</span>
            {item ? (
              <Select items={externalStatuses} onValueChange={(value) => value && setStatus(value as ExternalResourceStatus)} value={status}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{externalStatuses.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center rounded-md border-2 border-border bg-muted/40 px-3 text-sm text-muted-foreground">未校验</div>
            )}
          </label>
          <KnowledgePointPicker knowledgePoints={knowledgePoints} onChange={setKnowledgePointIds} selectedIds={knowledgePointIds} />
          {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={pending} onClick={() => void submit()} type="button"><Save data-icon="inline-start" />{pending ? "正在保存..." : "保存资源"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KnowledgePointPicker({
  knowledgePoints,
  selectedIds,
  onChange,
}: {
  knowledgePoints: KnowledgePoint[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  if (!knowledgePoints.length) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground sm:col-span-2">当前课程还没有知识点，可先保存后再补充关联。</p>;
  }
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 block text-xs text-muted-foreground">关联知识点（可多选）</legend>
      <div className="grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
        {knowledgePoints.map((point) => (
          <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/45" key={point.id}>
            <input
              checked={selectedIds.includes(point.id)}
              className="mt-1"
              onChange={() => onChange(selectedIds.includes(point.id) ? selectedIds.filter((id) => id !== point.id) : [...selectedIds, point.id])}
              type="checkbox"
            />
            <span className="min-w-0"><span className="block truncate">{point.name}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ConfirmDeleteDialog({
  title,
  description,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  title: string;
  description: string;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={pending} onClick={onConfirm} type="button" variant="destructive">{pending ? "正在删除..." : "确认删除"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
