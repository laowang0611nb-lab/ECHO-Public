"use client";

import { Plus, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function MasteryCorrectionDialog({
  courseId,
  studentId,
  knowledgePointId,
  knowledgePointName,
  originalScore,
  onChanged,
}: {
  courseId: string;
  studentId: string;
  knowledgePointId: string;
  knowledgePointName: string;
  originalScore: number;
  onChanged: () => void;
}) {
  const { user } = useTeacherSession();
  const [score, setScore] = useState(String(Math.round(originalScore)));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numericScore = Number(score);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        教师修正
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修正“{knowledgePointName}”掌握判断</DialogTitle>
          <DialogDescription>
            原掌握度为 {Math.round(originalScore)}%。修正会追加 LearningEvent，不覆盖原始证据。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select
            items={[
              { value: "90", label: "掌握良好（90）" },
              { value: "75", label: "基本掌握（75）" },
              { value: "60", label: "需要加强（60）" },
              { value: "40", label: "未掌握（40）" },
            ]}
            onValueChange={(value) => value && setScore(value)}
            value={score}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="90">掌握良好（90）</SelectItem>
              <SelectItem value="75">基本掌握（75）</SelectItem>
              <SelectItem value="60">需要加强（60）</SelectItem>
              <SelectItem value="40">未掌握（40）</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
          <Textarea onChange={(event) => setReason(event.target.value)} placeholder="修正原因，例如：课堂问答已确认掌握" value={reason} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !reason.trim() || !Number.isFinite(numericScore)}
            onClick={() => {
              setPending(true);
              setError(null);
              void apiClient.createLearningEvent(user!.id, courseId, {
                student_id: studentId,
                knowledge_point_id: knowledgePointId,
                event_type: "teacher_adjustment",
                evidence: reason.trim(),
                metadata_json: { target_score: numericScore, source: "teacher_correction", original_score: originalScore },
              }).then(() => onChanged()).catch((requestError) => {
                setError(requestError instanceof Error ? requestError.message : "修正失败");
              }).finally(() => setPending(false));
            }}
            type="button"
          >
            <Save data-icon="inline-start" />
            {pending ? "正在保存..." : "保存修正"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherNoteForm({
  courseId,
  studentId,
  onChanged,
}: {
  courseId: string;
  studentId: string;
  onChanged: () => void;
}) {
  const { user } = useTeacherSession();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addNote() {
    if (!content.trim()) return;
    setPending(true);
    setError(null);
    void apiClient.createLearningEvent(user!.id, courseId, {
      student_id: studentId,
      event_type: "teacher_adjustment",
      evidence: content.trim(),
      metadata_json: { kind: "teacher_note" },
    }).then(() => {
      setContent("");
      onChanged();
    }).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "备注保存失败");
    }).finally(() => setPending(false));
  }

  return (
    <div className="space-y-3">
      <Input onChange={(event) => setContent(event.target.value)} placeholder="添加教学备注..." value={content} />
      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span className="text-xs text-muted-foreground">备注保存为教师修正事件。</span>}
        <Button disabled={pending || !content.trim()} onClick={addNote} type="button">
          <Plus data-icon="inline-start" />
          {pending ? "正在保存..." : "添加备注"}
        </Button>
      </div>
    </div>
  );
}
