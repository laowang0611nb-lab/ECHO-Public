"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DashboardFooter() {
  return (
    <footer className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>ECHO 让 AI 与教育产生真正的回响。</p>
      <div className="flex items-center gap-2">
        <Dialog>
          <DialogTrigger render={<Button className="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-foreground" type="button" variant="link" />}>
            隐私政策
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>隐私政策</DialogTitle>
              <DialogDescription>ECHO 仅处理完成教学所需的数据。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>课程资料、学习事件、对话和审核记录用于教师学情分析与 AI 教学支持。</p>
              <p>开发环境中的 API Key、数据库密码和会话凭证不会写入前端或项目索引。</p>
              <p>正式部署前需要由课程管理者确认数据保留周期、导出和删除策略。</p>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog>
          <DialogTrigger render={<Button className="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-foreground" type="button" variant="link" />}>
            使用条款
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>使用条款</DialogTitle>
              <DialogDescription>当前版本为教师端开发与路演验证环境。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>教师需要对 AI 生成内容进行审核后再用于教学决策，不应直接替代教师判断。</p>
              <p>演示数据、教材来源和学情结论仅用于当前课程范围，不用于跨课程推断。</p>
              <p>正式上线前需补充组织级账号、数据权限、审计和合规条款。</p>
            </div>
          </DialogContent>
        </Dialog>
        <span>v0.0.83</span>
      </div>
    </footer>
  );
}
