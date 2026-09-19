"use client";

import type { ServiceState, SystemStatusResponse } from "@echo/shared-types";
import { Activity, CheckCircle2, Copy, Database, Globe2, HardDrive, RefreshCw, Server, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRefreshServerStatus, useServerHealth, useSystemStatus } from "@/features/server-settings/queries";
import { formatCheckedAt, serviceStateLabel, serviceStateTone } from "@/features/server-settings/view-model";
import { apiBaseUrl } from "@/lib/api";

const tabs = [
  { value: "services", label: "服务状态" },
  { value: "network", label: "网络与访问" },
  { value: "ai", label: "AI 模型配置" },
  { value: "database", label: "数据库" },
  { value: "storage", label: "存储与文件" },
] as const;

type ServerTab = (typeof tabs)[number]["value"];

export function ServerSettingsPage({ initialTab }: { initialTab: ServerTab }) {
  const [activeTab, setActiveTab] = useState<ServerTab>(initialTab);
  const health = useServerHealth();
  const status = useSystemStatus();
  const refresh = useRefreshServerStatus();
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  function changeTab(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as ServerTab) : "services";
    setActiveTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    window.history.replaceState(null, "", `/settings/server?${params.toString()}`);
  }

  async function refreshAll() {
    await refresh();
    setCheckedAt(new Date().toISOString());
  }

  if (health.isLoading || status.isLoading) return <LoadingState label="正在检查本地服务..." />;
  if (health.isError || status.isError || !status.data) {
    return <ErrorState description="服务器状态接口不可用，请确认 FastAPI 已启动。" onRetry={() => { void health.refetch(); void status.refetch(); }} />;
  }

  const system = status.data;
  const overallState = health.isSuccess ? system.status : "offline";
  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void refreshAll()} type="button" variant="outline"><RefreshCw data-icon="inline-start" />刷新状态</Button>
            <Button onClick={() => void refreshAll()} type="button"><CheckCircle2 data-icon="inline-start" />测试全部连接</Button>
          </div>
        }
        breadcrumbs={[{ label: "我的", href: "/me" }, { label: "系统设置", href: "/me?tab=system" }, { label: "服务器设置" }]}
        description="管理 ECHO 本地服务、数据库、AI 接口与局域网访问状态，确保演示环境稳定运行。"
        title="服务器设置"
      />

      <div className={`rounded-xl border-2 px-5 py-4 ${overallState === "healthy" ? "border-emerald-200 bg-emerald-50/55" : "border-orange-200 bg-orange-50/55"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold">{overallState === "healthy" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <ShieldCheck className="size-4 text-orange-600" />}{overallState === "healthy" ? "所有核心服务运行正常" : "演示环境需要检查"}</p>
            <p className="mt-1 text-xs text-muted-foreground">最后检查：{checkedAt ? formatCheckedAt(checkedAt) : formatCheckedAt(system.checked_at)}</p>
          </div>
          <StatusBadge tone={serviceStateTone(overallState)}>{serviceStateLabel(overallState)}</StatusBadge>
        </div>
      </div>

      <Tabs onValueChange={changeTab} value={activeTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-border px-0 lg:grid-cols-5" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent className="mt-5" value="services">
          <ServicesTab healthLatency={health.data?.latencyMs} system={system} />
        </TabsContent>
        <TabsContent className="mt-5" value="network">
          <NetworkTab system={system} />
        </TabsContent>
        <TabsContent className="mt-5" value="ai">
          <AITab system={system} />
        </TabsContent>
        <TabsContent className="mt-5" value="database">
          <DatabaseTab system={system} />
        </TabsContent>
        <TabsContent className="mt-5" value="storage">
          <StorageTab system={system} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ServicesTab({ system, healthLatency }: { system: SystemStatusResponse; healthLatency?: number }) {
  const services = [
    { icon: Server, name: "后端服务（FastAPI）", state: "healthy" as ServiceState, detail: `${apiBaseUrl} · 延迟 ${healthLatency ?? "-"} ms`, message: `运行版本 ${system.version}` },
    { icon: Globe2, name: "教师端 Web", state: "healthy" as ServiceState, detail: typeof window === "undefined" ? "本机浏览器" : window.location.origin, message: "当前页面已加载" },
    { icon: Database, name: "数据库", state: system.database.status, detail: system.database.current_label, message: `${system.database.message} · ${system.database.latency_ms} ms` },
    { icon: Sparkles, name: "向量能力", state: system.vector.status, detail: system.vector.engine, message: system.vector.message },
    { icon: Sparkles, name: "AI 模型服务", state: system.ai_provider.status, detail: system.ai_provider.model, message: system.ai_provider.message },
    { icon: HardDrive, name: "文件服务", state: system.storage.status, detail: `${system.storage.mode} · ${system.storage.path_label}`, message: system.storage.message },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4"><CardTitle>核心服务</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border px-0">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div className="flex items-start gap-4 px-5 py-4" key={service.name}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="size-4" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{service.name}</p><StatusBadge tone={serviceStateTone(service.state)}>{serviceStateLabel(service.state)}</StatusBadge></div><p className="mt-1 text-xs text-muted-foreground">{service.detail}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{service.message}</p></div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>环境检查</CardTitle><p className="text-xs text-muted-foreground">状态来自真实健康检查，不模拟延迟后全绿。</p></CardHeader>
          <CardContent className="space-y-3 px-5">
            <CheckLine label="FastAPI" state="healthy" />
            <CheckLine label="数据库连接" state={system.database.status} />
            <CheckLine label="pgvector" state={system.vector.status} />
            <CheckLine label="Qwen 配置" state={system.ai_provider.status} />
            <CheckLine label="文件服务" state={system.storage.status} />
            <CheckLine label="局域网地址" state={system.lan.student_api_base_url ? "healthy" : "warning"} />
          </CardContent>
        </Card>
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2"><Activity className="size-4 text-primary" />部署运行探针</CardTitle>
            <p className="text-xs text-muted-foreground">展示当前接口能够真实读取的运行指标；不伪造 CPU、内存或网络曲线。</p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 text-sm">
            <CheckLine label="API 请求延迟" state="healthy" />
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">本次 API 延迟</span><span className="font-medium tabular-nums">{healthLatency ?? "-"} ms</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">数据库延迟</span><span className="font-medium tabular-nums">{system.database.latency_ms} ms</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">向量状态</span><StatusBadge tone={serviceStateTone(system.vector.status)}>{serviceStateLabel(system.vector.status)}</StatusBadge></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">文件目录</span><span className="font-medium">{system.storage.writable ? "可写" : "需要检查"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">局域网候选地址</span><span className="font-medium tabular-nums">{system.lan.candidate_lan_ips.length} 个</span></div>
            <p className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs leading-5">CPU、内存、磁盘容量和日志流仍需要独立监控 Contract；当前页面不提供旋钮或假图表。</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NetworkTab({ system }: { system: SystemStatusResponse }) {
  const [copied, setCopied] = useState<string | null>(null);
  const studentUrl = system.lan.student_api_base_url;
  const localUrl = system.lan.api_base_url;
  const lanUrls = system.lan.candidate_lan_ips.map((ip) => `http://${ip}:${system.lan.api_port}`);

  async function copy(value: string) {
    await window.navigator.clipboard.writeText(value);
    setCopied(value);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Wifi className="size-4 text-primary" />局域网与本机地址</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-5">
            <AddressRow label="API Base URL" value={apiBaseUrl} onCopy={copy} />
            <AddressRow label="后端请求地址" value={localUrl} onCopy={copy} />
            <AddressRow label="局域网候选地址" value={lanUrls.length ? lanUrls.join(" · ") : "未检测到"} onCopy={lanUrls[0] ? copy : undefined} />
            <AddressRow label="Android 学生端连接地址" value={studentUrl ?? "未检测到"} onCopy={studentUrl ? copy : undefined} />
            <p className="text-xs leading-5 text-muted-foreground">{system.lan.message}</p>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>学生端连接步骤</CardTitle></CardHeader>
          <CardContent className="grid gap-3 px-5 md:grid-cols-4">
            {["教师电脑开启热点", "Android 连接热点", "填写或扫描 API 地址", "测试连接后进入 ECHO"].map((step, index) => <div className="rounded-lg border border-border px-3 py-3" key={step}><p className="text-xs font-semibold text-primary">0{index + 1}</p><p className="mt-2 text-sm">{step}</p></div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>连接二维码</CardTitle><p className="text-xs text-muted-foreground">复用现有二维码能力，编码真实学生端 API 地址。</p></CardHeader>
        <CardContent className="flex flex-col items-center gap-4 px-5">
          {studentUrl ? <div className="rounded-xl bg-white p-4 ring-1 ring-border"><QRCodeSVG size={220} value={studentUrl} /></div> : <div className="flex min-h-56 w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">未检测到可用局域网地址</div>}
          {studentUrl ? <Button onClick={() => void copy(studentUrl)} type="button"><Copy data-icon="inline-start" />复制学生端地址</Button> : null}
          {copied ? <p className="text-xs text-emerald-600">已复制：{copied}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function AITab({ system }: { system: SystemStatusResponse }) {
  const ai = system.ai_provider;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>Qwen 配置</CardTitle><p className="text-xs text-muted-foreground">只显示配置状态和模型名，不暴露任何 API Key。</p></CardHeader>
        <CardContent className="space-y-3 px-5">
          <SettingLine label="LLM 配置" value={ai.configured ? "已配置" : "未配置"} />
          <SettingLine label="Chat 配置" value={ai.chat_configured ? "已配置" : "未配置"} />
          <SettingLine label="Embedding 配置" value={ai.embedding_configured ? "已配置" : "未配置"} />
          <SettingLine label="默认模型" value={ai.model} />
          <SettingLine label="Chat 模型" value={ai.chat_model} />
          <SettingLine label="Embedding 模型" value={ai.embedding_model} />
          <StatusBadge tone={serviceStateTone(ai.status)}>{serviceStateLabel(ai.status)}</StatusBadge>
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>比赛稳定性</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
          <p>实时模式直接调用真实 Qwen；稳定模式使用 Demo 预置数据，并在页面中明确标记“演示数据”。</p>
          <p>API Key 只保留在后端环境变量中，教师 Web 与学生端都不会保存明文密钥。</p>
        </CardContent>
      </Card>
    </div>
  );
}

function DatabaseTab({ system }: { system: SystemStatusResponse }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>当前开发运行库</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5">
          <SettingLine label="类型" value={system.database.current_label} />
          <SettingLine label="Dialect" value={system.database.dialect} />
          <SettingLine label="连接延迟" value={`${system.database.latency_ms} ms`} />
          <StatusBadge tone={serviceStateTone(system.database.status)}>{serviceStateLabel(system.database.status)}</StatusBadge>
          <p className="text-xs leading-5 text-muted-foreground">{system.database.message}</p>
        </CardContent>
      </Card>
      <Card className="gap-4 border-blue-200 bg-blue-50/40 py-5">
        <CardHeader className="px-5"><CardTitle>正式部署目标</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm">
          <p className="text-lg font-semibold">{system.database.target_architecture}</p>
          <p className="leading-6 text-muted-foreground">SQLite 仅用于当前开发环境；正式课程、学生、学习事件、审核记录和向量检索统一进入 PostgreSQL + pgvector。</p>
          <StatusBadge tone="info">正式架构未变更</StatusBadge>
        </CardContent>
      </Card>
    </div>
  );
}

function StorageTab({ system }: { system: SystemStatusResponse }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>文件服务</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5">
          <SettingLine label="模式" value={system.storage.mode} />
          <SettingLine label="目录" value={system.storage.path_label} />
          <SettingLine label="可写" value={system.storage.writable ? "是" : "否"} />
          <StatusBadge tone={serviceStateTone(system.storage.status)}>{serviceStateLabel(system.storage.status)}</StatusBadge>
          <p className="text-xs leading-5 text-muted-foreground">{system.storage.message}</p>
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>文件资源</CardTitle></CardHeader>
        <CardContent className="px-5 text-sm text-muted-foreground">资源数量、空间占用和备份接口尚未进入本轮 P0；文件服务状态与可写性已真实检测。</CardContent>
      </Card>
    </div>
  );
}

function CheckLine({ label, state }: { label: string; state: ServiceState }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><StatusBadge tone={serviceStateTone(state)}>{serviceStateLabel(state)}</StatusBadge></div>;
}

function AddressRow({ label, value, onCopy }: { label: string; value: string; onCopy?: (value: string) => void }) {
  return <div className="rounded-lg border border-border px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all font-mono text-sm">{value}</p></div>{onCopy ? <Button onClick={() => void onCopy(value)} size="sm" type="button" variant="outline"><Copy data-icon="inline-start" />复制</Button> : null}</div></div>;
}

function SettingLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="max-w-[65%] break-all text-right font-medium">{value}</span></div>;
}

export function normalizeServerTab(value?: string): ServerTab {
  return tabs.some((tab) => tab.value === value) ? (value as ServerTab) : "services";
}
