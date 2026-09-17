import type { Chapter } from "@echo/shared-types";
import { GitBranch, Layers3, Network, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const chapterPalette = [
  { fill: "#EAF3FF", stroke: "#8CB8F7", text: "#1859B8" },
  { fill: "#EAFBF2", stroke: "#72D6A4", text: "#157347" },
  { fill: "#FFF7E7", stroke: "#F2C56B", text: "#9A6200" },
  { fill: "#F3EEFF", stroke: "#B9A2F5", text: "#6941C6" },
  { fill: "#FFF0F5", stroke: "#EDA7C1", text: "#B4236A" },
  { fill: "#EAF9FA", stroke: "#72CDD5", text: "#0F7580" },
] as const;

const VIEWBOX_WIDTH = 900;
const VIEWBOX_HEIGHT = 520;
const CENTER_X = 450;
const CENTER_Y = 260;
const CHAPTER_NODE_WIDTH = 176;
const CHAPTER_NODE_HEIGHT = 64;

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
  const nodes = useMemo(() => chapters.slice(0, 8), [chapters]);
  const totalPoints = chapters.reduce((total, chapter) => total + chapter.knowledge_points.length, 0);
  const chapterPositions = useMemo(() => buildChapterPositions(nodes.length), [nodes.length]);

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

  if (compact) {
    return <CompactKnowledgePreview chapters={nodes} courseId={courseId} courseName={courseName} totalPoints={totalPoints} />;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border-2 border-border">
        <div className={cn("relative min-w-[700px] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,#FFFFFF_0%,#F5F9FF_46%,#EDF4FF_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", compact ? "h-[300px]" : "h-[500px]")}>
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(#BFD7FA_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent" />
        <div className="absolute right-4 top-4 z-10 flex flex-wrap gap-3 rounded-lg border border-border bg-white/92 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />课程</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#72A9F5]" />章节</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#BFDBFE]" />知识点</span>
        </div>
        <svg className="size-full" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} aria-label="课程知识结构预览" role="img">
          <defs>
            <filter id="course-node-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="10" floodColor="#2F7CF6" floodOpacity="0.22" stdDeviation="12" />
            </filter>
            <filter id="chapter-node-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="5" floodColor="#496C9C" floodOpacity="0.13" stdDeviation="7" />
            </filter>
            <linearGradient id="edge-gradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#2F7CF6" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#8CB8F7" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {nodes.map((chapter, index) => {
            const position = chapterPositions[index];
            return (
              <line key={`edge-${chapter.id}`} stroke="url(#edge-gradient)" strokeLinecap="round" strokeWidth="2" x1={CENTER_X} x2={position.x} y1={CENTER_Y} y2={position.y} />
            );
          })}

          <circle cx={CENTER_X} cy={CENTER_Y} fill="#DCEAFF" r="84" />
          <circle cx={CENTER_X} cy={CENTER_Y} fill="#2F7CF6" filter="url(#course-node-shadow)" r="64" stroke="#FFFFFF" strokeWidth="4" />
          <text fill="white" fontSize="14" fontWeight="700" textAnchor="middle" x={CENTER_X} y={CENTER_Y - 5}>{truncate(courseName, 8)}</text>
          <text fill="white" fillOpacity="0.76" fontSize="11" textAnchor="middle" x={CENTER_X} y={CENTER_Y + 18}>课程知识</text>

          {nodes.map((chapter, index) => {
            const position = chapterPositions[index];
            const color = chapterPalette[index % chapterPalette.length];
            return (
              <g key={chapter.id}>
                <rect fill={color.fill} filter="url(#chapter-node-shadow)" height={CHAPTER_NODE_HEIGHT} rx="16" stroke={color.stroke} strokeWidth="1.5" width={CHAPTER_NODE_WIDTH} x={position.x - CHAPTER_NODE_WIDTH / 2} y={position.y - CHAPTER_NODE_HEIGHT / 2} />
                <text fill={color.text} fontSize="13" fontWeight="700" textAnchor="middle" x={position.x} y={position.y - 5}>{truncate(chapter.title, 10)}</text>
                <text fill="#667085" fontSize="10" textAnchor="middle" x={position.x} y={position.y + 15}>{chapter.knowledge_points.length} 个知识点</text>
                {chapter.knowledge_points.slice(0, 6).map((point, pointIndex) => {
                  const visiblePoints = chapter.knowledge_points.slice(0, 6);
                  const arcStart = -110;
                  const arcEnd = 110;
                  const angle = ((arcStart + ((arcEnd - arcStart) * pointIndex) / Math.max(visiblePoints.length - 1, 1)) * Math.PI) / 180;
                  const baseAngle = angleFromCenter(position) + angle * 0.55;
                  const pointX = position.x + Math.cos(baseAngle) * (CHAPTER_NODE_WIDTH / 2 + 34);
                  const pointY = position.y + Math.sin(baseAngle) * (CHAPTER_NODE_HEIGHT / 2 + 26);
                  return (
                    <g key={point.id}>
                      <line stroke={color.stroke} strokeOpacity="0.5" strokeWidth="1" x1={position.x} x2={pointX} y1={position.y} y2={pointY} />
                      <circle cx={pointX} cy={pointY} fill="#FFFFFF" r="7" stroke={color.stroke} strokeWidth="2"><title>{point.name}</title></circle>
                      <circle cx={pointX} cy={pointY} fill={color.stroke} r="2.6" />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        </div>
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

function CompactKnowledgePreview({
  chapters,
  courseId,
  courseName,
  totalPoints,
}: {
  chapters: Chapter[];
  courseId: string;
  courseName: string;
  totalPoints: number;
}) {
  return (
    <div className="space-y-4">
      <div className="relative h-[320px] overflow-hidden rounded-xl border-2 border-border bg-[radial-gradient(circle_at_50%_20%,#FFFFFF_0%,#F5F9FF_52%,#EDF4FF_100%)] p-4">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(#BFD7FA_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative flex h-full flex-col">
          <div className="mx-auto max-w-full truncate rounded-full border-2 border-blue-200 bg-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(47,124,246,0.2)]">{courseName}</div>
          <div className="mx-auto h-4 w-px bg-primary/35" />
          <div className="flex flex-1 flex-col justify-center gap-2">
            {chapters.slice(0, 3).map((chapter, index) => {
              const color = chapterPalette[index % chapterPalette.length];
              return (
                <div className="flex items-center gap-3 rounded-lg border-2 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" key={chapter.id} style={{ borderColor: color.stroke }}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.stroke }} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: color.text }}>{chapter.title}</span>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{chapter.knowledge_points.length} 点</span>
                </div>
              );
            })}
            {chapters.length > 3 ? <p className="text-center text-[11px] text-muted-foreground">另有 {chapters.length - 3} 个章节</p> : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <GraphMetric icon={Network} label="章节" value={chapters.length} />
        <GraphMetric icon={Layers3} label="知识点" value={totalPoints} />
        <GraphMetric icon={GitBranch} label="知识关联" value="待接口" />
      </div>
      <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/knowledge?courseId=${courseId}&tab=graph`}>查看完整图谱</Link>
    </div>
  );
}

function buildChapterPositions(count: number) {
  if (count === 1) return [{ x: CENTER_X, y: 78 }];
  if (count === 2) return [{ x: 680, y: 140 }, { x: 220, y: 380 }];
  const radiusX = count <= 3 ? 282 : 312;
  const radiusY = count <= 3 ? 182 : 188;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return { x: CENTER_X + Math.cos(angle) * radiusX, y: CENTER_Y + Math.sin(angle) * radiusY };
  });
}

function angleFromCenter(position: { x: number; y: number }) {
  return Math.atan2(position.y - CENTER_Y, position.x - CENTER_X);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function GraphMetric({ icon: Icon, label, value }: { icon: typeof Network; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
