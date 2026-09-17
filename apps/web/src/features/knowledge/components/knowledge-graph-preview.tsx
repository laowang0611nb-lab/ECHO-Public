import type { Chapter } from "@echo/shared-types";
import { GitBranch, Layers3, Network } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const positions = [
  [300, 34],
  [458, 82],
  [500, 160],
  [438, 236],
  [300, 260],
  [164, 236],
  [100, 158],
  [142, 80],
] as const;

export function KnowledgeGraphPreview({
  courseId,
  courseName,
  chapters,
  compact = false,
}: {
  courseId: string;
  courseName: string;
  chapters: Chapter[];
  compact?: boolean;
}) {
  const nodes = useMemo(() => chapters.slice(0, positions.length), [chapters]);
  const totalPoints = chapters.reduce((total, chapter) => total + chapter.knowledge_points.length, 0);

  return (
    <div className="space-y-4">
      <div className={cn("relative overflow-hidden rounded-xl border border-border bg-background", compact ? "h-[280px]" : "h-[430px]")}>
        <svg className="size-full" viewBox="0 0 600 294" aria-label="课程知识结构预览">
          {nodes.map((chapter, index) => (
            <line
              key={`line-${chapter.id}`}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="1.5"
              x1="300"
              x2={positions[index][0]}
              y1="147"
              y2={positions[index][1] + 12}
            />
          ))}
          <circle cx="300" cy="147" fill="#2f7cf6" r="38" />
          <text fill="white" fontSize="13" fontWeight="600" textAnchor="middle" x="300" y="142">
            {courseName.length > 8 ? `${courseName.slice(0, 8)}…` : courseName}
          </text>
          <text fill="white" fillOpacity="0.72" fontSize="9" textAnchor="middle" x="300" y="158">
            课程知识
          </text>
          {nodes.map((chapter, index) => (
            <g key={chapter.id}>
              <circle cx={positions[index][0]} cy={positions[index][1] + 12} fill={index % 2 === 0 ? "#dbeafe" : "#e0f2fe"} r="28" />
              <text fill="#182236" fontSize="10" fontWeight="600" textAnchor="middle" x={positions[index][0]} y={positions[index][1] + 9}>
                {chapter.title.length > 7 ? `${chapter.title.slice(0, 7)}…` : chapter.title}
              </text>
              <text fill="#667085" fontSize="8" textAnchor="middle" x={positions[index][0]} y={positions[index][1] + 22}>
                {chapter.knowledge_points.length} 点
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <GraphMetric icon={Network} label="章节" value={chapters.length} />
        <GraphMetric icon={Layers3} label="知识点" value={totalPoints} />
        <GraphMetric icon={GitBranch} label="知识关联" value="待接口" />
      </div>

      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">当前预览由真实章节与知识点生成。完整关系图谱接口尚未提供。</p>
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/knowledge?courseId=${courseId}&tab=resources`}>
            返回资源管理
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function GraphMetric({ icon: Icon, label, value }: { icon: typeof Network; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
