export function DashboardFooter() {
  return (
    <footer className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>ECHO 让 AI 与教育产生真正的回响。</p>
      <div className="flex items-center gap-4">
        <span>隐私政策</span>
        <span>使用条款</span>
        <span>v0.0.53</span>
      </div>
    </footer>
  );
}
