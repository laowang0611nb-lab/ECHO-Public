# @echo/design-tokens

跨端基础设计 token 包，当前只提供最小共享集合，不替代教师 Web 的 Tailwind/CSS variables 或学生端的本地主题系统。

## Entry

- `src/index.ts`：导出 `colors`、`radii` 和 `motion`。

## Current Tokens

- `colors`：background、surface、text、textMuted、primary、success、warning、danger。
- `radii`：small `6`、medium `8`、large `12`。
- `motion.duration`：micro `120`、fast `220`、normal `360`、slow `600`。
- `motion.spring`：gentle 与 snappy 两组阻尼/刚度。

## Usage Boundary

- 当前学生端 `apps/mobile/src/constants/student-theme.ts` 消费该包。
- 教师 Web 目前主要使用 `apps/web/src/app/globals.css`、Tailwind CSS 变量和组件本地样式；新增 Web token 前先确认不会与现有 CSS variables 重复。
- 不把页面私有颜色、品牌图片、图表配置或组件样式塞进该包。

## Check

```powershell
pnpm --filter @echo/design-tokens typecheck
```
