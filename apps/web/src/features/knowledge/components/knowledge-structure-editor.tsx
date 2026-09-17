"use client";

import type { Chapter } from "@echo/shared-types";
import { ArrowDown, ArrowUp, Merge, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function KnowledgeStructureEditor({
  courseId,
  documentId,
  chapters,
  onChanged,
}: {
  courseId: string;
  documentId: string;
  chapters: Chapter[];
  onChanged: () => void;
}) {
  const { user } = useTeacherSession();
  const [pending, setPending] = useState<string | null>(null);
  const [newChapter, setNewChapter] = useState("");
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({});
  const [pointNames, setPointNames] = useState<Record<string, string>>({});
  const [newPoints, setNewPoints] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [mergeName, setMergeName] = useState("");
  const [mergeDescription, setMergeDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allPoints = useMemo(() => chapters.flatMap((chapter) => chapter.knowledge_points), [chapters]);
  const selectedPoints = allPoints.filter((point) => selectedIds.includes(point.id));

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      onChanged();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存失败，请稍后重试。");
      return false;
    } finally {
      setPending(null);
    }
  }

  function togglePoint(pointId: string) {
    setSelectedIds((current) => {
      const next = current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId];
      if (!targetId && next.length) {
        setTargetId(next[0]);
        setMergeName(allPoints.find((point) => point.id === next[0])?.name ?? "");
      }
      if (targetId && !next.includes(targetId)) setTargetId(next[0] ?? null);
      return next;
    });
  }

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle>结构编辑</CardTitle>
        <p className="text-sm text-muted-foreground">复用现有章节、知识点、排序、移动和合并接口；修改后知识库与课程详情会重新同步。</p>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="flex gap-2">
          <Input onChange={(event) => setNewChapter(event.target.value)} placeholder="新章节名称" value={newChapter} />
          <Button
            disabled={!newChapter.trim() || pending !== null}
            onClick={() => {
              void run("new-chapter", () => apiClient.createChapter(user!.id, documentId, { title: newChapter.trim(), order_index: chapters.length }), "章节已创建。").then((saved) => saved && setNewChapter(""));
            }}
            type="button"
          >
            <Plus data-icon="inline-start" />新建章节
          </Button>
        </div>

        {error ? <p className="rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

        {chapters.map((chapter, chapterIndex) => (
          <section className="rounded-xl border border-border bg-card" key={chapter.id}>
            <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-primary">{chapterIndex + 1}</span>
              <Input
                onChange={(event) => setChapterTitles((current) => ({ ...current, [chapter.id]: event.target.value }))}
                value={chapterTitles[chapter.id] ?? chapter.title}
              />
              <div className="flex gap-1">
                <Button disabled={chapterIndex === 0 || pending !== null} onClick={() => void run(`chapter-up-${chapter.id}`, () => apiClient.updateChapter(user!.id, chapter.id, { order_index: chapterIndex - 1 }), "章节顺序已更新。")} size="icon-sm" type="button" variant="outline"><ArrowUp /></Button>
                <Button disabled={chapterIndex === chapters.length - 1 || pending !== null} onClick={() => void run(`chapter-down-${chapter.id}`, () => apiClient.updateChapter(user!.id, chapter.id, { order_index: chapterIndex + 1 }), "章节顺序已更新。")} size="icon-sm" type="button" variant="outline"><ArrowDown /></Button>
                <Button disabled={pending !== null || (chapterTitles[chapter.id] ?? chapter.title).trim() === chapter.title} onClick={() => void run(`chapter-save-${chapter.id}`, () => apiClient.updateChapter(user!.id, chapter.id, { title: chapterTitles[chapter.id]!.trim() }), "章节已更新。")} size="icon-sm" type="button" variant="outline"><Save /></Button>
                <Button onClick={() => { if (window.confirm(`删除章节“${chapter.title}”及其全部知识点？`)) void run(`chapter-delete-${chapter.id}`, () => apiClient.deleteChapter(user!.id, chapter.id), "章节已删除。"); }} size="icon-sm" type="button" variant="destructive"><Trash2 /></Button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {chapter.knowledge_points.map((point, pointIndex) => (
                <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center" key={point.id}>
                  <Checkbox checked={selectedIds.includes(point.id)} onCheckedChange={() => togglePoint(point.id)} />
                  <Input onChange={(event) => setPointNames((current) => ({ ...current, [point.id]: event.target.value }))} value={pointNames[point.id] ?? point.name} />
                  <Select
                    items={chapters.map((target) => ({ value: target.id, label: target.title }))}
                    onValueChange={(value) => value && void run(`point-move-${point.id}`, () => apiClient.updateKnowledgePoint(user!.id, point.id, { chapter_id: value, order_index: chapters.find((item) => item.id === value)?.knowledge_points.length ?? 0 }), "知识点已移动。")}
                    value={chapter.id}
                  >
                    <SelectTrigger className="w-full lg:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{chapters.map((target) => <SelectItem key={target.id} value={target.id}>{target.title}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Button disabled={pointIndex === 0 || pending !== null} onClick={() => void run(`point-up-${point.id}`, () => apiClient.updateKnowledgePoint(user!.id, point.id, { order_index: pointIndex - 1 }), "知识点顺序已更新。")} size="icon-sm" type="button" variant="outline"><ArrowUp /></Button>
                    <Button disabled={pointIndex === chapter.knowledge_points.length - 1 || pending !== null} onClick={() => void run(`point-down-${point.id}`, () => apiClient.updateKnowledgePoint(user!.id, point.id, { order_index: pointIndex + 1 }), "知识点顺序已更新。")} size="icon-sm" type="button" variant="outline"><ArrowDown /></Button>
                    <Button disabled={pending !== null || (pointNames[point.id] ?? point.name).trim() === point.name} onClick={() => void run(`point-save-${point.id}`, () => apiClient.updateKnowledgePoint(user!.id, point.id, { name: pointNames[point.id]!.trim() }), "知识点已更新。")} size="icon-sm" type="button" variant="outline"><Save /></Button>
                    <Button onClick={() => { if (window.confirm(`删除知识点“${point.name}”？`)) void run(`point-delete-${point.id}`, () => apiClient.deleteKnowledgePoint(user!.id, point.id), "知识点已删除。"); }} size="icon-sm" type="button" variant="destructive"><Trash2 /></Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t border-border p-3">
              <Input onChange={(event) => setNewPoints((current) => ({ ...current, [chapter.id]: event.target.value }))} placeholder="新增知识点" value={newPoints[chapter.id] ?? ""} />
              <Button disabled={!newPoints[chapter.id]?.trim() || pending !== null} onClick={() => void run(`point-new-${chapter.id}`, () => apiClient.createKnowledgePoint(user!.id, chapter.id, { name: newPoints[chapter.id]!.trim(), order_index: chapter.knowledge_points.length }), "知识点已创建。").then((saved) => saved && setNewPoints((current) => ({ ...current, [chapter.id]: "" })))} type="button"><Plus data-icon="inline-start" />添加</Button>
            </div>
          </section>
        ))}

        {selectedIds.length >= 2 ? (
          <Dialog>
            <DialogTrigger render={<Button type="button" variant="outline" />}>
              <Merge data-icon="inline-start" />合并已选 {selectedIds.length} 个知识点
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>合并知识点</DialogTitle>
                <DialogDescription>选择目标知识点，来源知识点及其学情证据会迁移到目标点。</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <Select items={selectedPoints.map((point) => ({ value: point.id, label: point.name }))} onValueChange={(value) => value && setTargetId(value)} value={targetId ?? selectedIds[0]}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{selectedPoints.map((point) => <SelectItem key={point.id} value={point.id}>{point.name}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <Input onChange={(event) => setMergeName(event.target.value)} placeholder="合并后名称" value={mergeName} />
                <Textarea onChange={(event) => setMergeDescription(event.target.value)} placeholder="合并后说明（可选）" value={mergeDescription} />
              </div>
              <DialogFooter>
                <Button
                  disabled={pending !== null || !targetId}
                  onClick={() => void run("merge-points", () => apiClient.mergeKnowledgePoints(user!.id, courseId, { target_knowledge_point_id: targetId!, source_knowledge_point_ids: selectedIds.filter((id) => id !== targetId), name: mergeName.trim() || undefined, description: mergeDescription.trim() || undefined }), "知识点已合并。").then((saved) => { if (saved) { setSelectedIds([]); setTargetId(null); setMergeName(""); setMergeDescription(""); } })}
                  type="button"
                >
                  确认合并
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
