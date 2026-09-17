import type { Chapter } from "@echo/shared-types";
import { GitBranch, Layers3, Network, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const chapterColors = ["#DBEAFE", "#DCFCE7", "#E0F2FE", "#FEF3C7", "#FCE7F3", "#EDE9FE", "#CCFBF1", "#FFE4E6"] as const;
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

  if (!nodes.length) {
    return (
      <div className="space-y-4">
        <div className={cn("relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-blue-200 bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF5FF_100%)] px-6 text-center", compact ? "h-[280px]" : "h-[430px]")}>
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#DBEAFE_1px,transparent_1px),linear-gradient(90deg,#DBEAFE_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative z-10 max-w-sm">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm ring-1 ring-blue-100"><Sparkles className="size-5" /></span>
            <p className="mt-4 text-base font-semibold text-foreground">尚未形成知识结构</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">上传并解析课程资料后，ECHO 会在这里生成章节和知识点网络。</p>
            <Link className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-5")} href={`/knowledge?courseId=${courseId}&tab=resources`}>去解析资源</Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <GraphMetric icon={Network} label="章节" value={0} />
          <GraphMetric icon={Layers3} label="知识点" value={0} />
          <GraphMetric icon={GitBranch} label="知识关联" value="待接口" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn("relative overflow-hidden rounded-xl border border-border bg-[linear-gradient(180deg,#FBFDFF_0%,#F4F8FF_100%)]", compact ? "h-[280px]" : "h-[430px]")}>
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(#DBEAFE_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="absolute right-4 top-4 z-10 flex flex-wrap gap-3 rounded-lg border border-white/80 bg-white/85 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />课程</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#7CAFFF]" />章节</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#BFDBFE]" />知识点</span>
        </div>
        <svg className="size-full" viewBox="0 0 600 294" aria-label="课程知识结构预览">
          {nodes.map((chapter, index) => (
            <line
              key={`line-${chapter.id}`}
              stroke="#BFDBFE"
              strokeOpacity="0.15"
              strokeWidth="1.5"
              x1="300"
              x2={positions[index][0]}
              y1="147"
              y2={positions[index][1] + 12}
            />
          ))}
          {nodes.map((chapter, index) => (
            <g key={`points-${chapter.id}`}>
              {chapter.knowledge_points.slice(0, 5).map((point, pointIndex) => {
                const visiblePoints = chapter.knowledge_points.slice(0, 5);
                const pointAngle = -Math.PI / 2 + (Math.PI * 2 * pointIndex) / Math.max(5, visiblePoints.length);
                const pointX = positions[index][0] + Math.cos(pointAngle) * 42;
                const pointY = positions[index][1] + 12 + Math.sin(pointAngle) * 34;
                return (
                  <g key={point.id}>
                    <line stroke="#DBEAFE" strokeOpacity="0.9" strokeWidth="1" x1={positions[index][0]} x2={pointX} y1={positions[index][1] + 12} y2={pointY} />
                    <circle cx={pointX} cy={pointY} fill="#BFDBFE" r="3.8" stroke="#FFFFFF" strokeWidth="1.2"><title>{point.name}</title></circle>
                  </g>
                );
              })}
            </g>
          ))}
          <circle cx="300" cy="147" fill="#2F7CF6" fillOpacity="0.12" r="50" />
          <circle cx="300" cy="147" fill="#2f7cf6" r="38" stroke="#FFFFFF" strokeWidth="3" />
          <text fill="white" fontSize="13" fontWeight="600" textAnchor="middle" x="300" y="142">
            {courseName.length > 8 ? `${courseName.slice(0, 8)}…` : courseName}
          </text>
          <text fill="white" fillOpacity="0.72" fontSize="9" textAnchor="middle" x="300" y="158">
            课程知识
          </text>
          {nodes.map((chapter, index) => (
            <g key={chapter.id}>
              <circle cx={positions[index][0]} cy={positions[index][1] + 12} fill={chapterColors[index % chapterColors.length]} r="30" stroke="#FFFFFF" strokeWidth="2" />
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
