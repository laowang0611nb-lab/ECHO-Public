# ECHO 代码索引

本文件是公开比赛版本的代码入口，按“应用、数据、共享包、文档、脚本”组织。

> 公开镜像代码基线：`0.0.297`
> 比赛分支：`0.0.x-274`，其中 `x` 是固定字母
> 索引复核日期：2026-11-17
> 覆盖面：教师 Web 25 个 `page.tsx` / 14 个 Feature、学生端 20 个路由文件、FastAPI 25 个 Router 模块与 `sse.py` 心跳助手、51 个 Service 模块。

## 1. 快速入口

| 目标 | 入口 |
| --- | --- |
| 项目介绍与运行 | `README.md` |
| 教师 Web | `apps/web/` |
| 学生移动端 | `apps/mobile/` |
| FastAPI 后端 | `apps/api/` |
| 数据模型与迁移 | `database/` |
| 共享 API Client | `packages/api-client/` |
| 共享业务类型 | `packages/shared-types/` |
| 设计 Token | `packages/design-tokens/` |
| 系统架构 | `docs/architecture/` |
| API 契约 | `docs/api/` |
| 环境变量说明 | `docs/环境变量说明.md` |
| 全量代码索引 | `CODE_INDEX.md` |
| 环境变量模板 | `.env.example`、各应用 `.env.example` |

## 2. 应用

### `apps/web/`

Next.js 教师端，包含课程、知识库、学生学情、AI 审核、教学洞察、策略和执行计划页面。当前学生学情列表使用课程级聚合接口，知识图谱支持教材/章节范围与学生 WebView 嵌入。

常用命令：

```powershell
pnpm --filter @echo/web dev
pnpm --filter @echo/web build
pnpm --filter @echo/web lint
pnpm --filter @echo/web typecheck
```

### `apps/mobile/`

Expo + React Native 学生端，包含课程、AI 对话、附件、Quick Check、学习记录、错题和知识图谱 WebView。

常用命令：

```powershell
pnpm --filter @echo/mobile start
pnpm --filter @echo/mobile android
pnpm --filter @echo/mobile lint
pnpm --filter @echo/mobile typecheck
```

### `apps/api/`

FastAPI 后端，统一前缀 `/api/v1`，提供鉴权、课程、教材、学习事件、AI 审核、AI 分析、教学策略、执行计划、教师 AI 助手和健康检查接口。

常用命令：

```powershell
apps/api/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --reload
apps/api/.venv/Scripts/python.exe -m pytest apps/api/tests
```

## 3. 数据层

### `database/`

- `models/`：SQLAlchemy ORM 模型
- `db/`：数据库引擎和会话
- `alembic/`：迁移历史
- `auth/`：密码哈希、JWT 和会话
- `seeds/`：演示种子
- `tests/`：数据库与迁移测试
- `config.py`：数据库设置入口

```powershell
apps/api/.venv/Scripts/python.exe -m alembic -c database/alembic.ini upgrade head
apps/api/.venv/Scripts/python.exe -m pytest -c database/pytest.ini database/tests
```

## 4. 共享包

- `packages/api-client/`：OpenAPI 客户端入口
- `packages/shared-types/`：前后端共享业务类型
- `packages/design-tokens/`：颜色、间距和设计变量

## 5. 文档

- `docs/architecture/`：系统边界、运行逻辑、项目切片和流程图
- `docs/api/`：接口、数据结构和 SSE 协议
- `docs/database/`：数据库架构和迁移说明
- `docs/环境变量说明.md`：API、数据库、模型、短信、教师 Web 和学生端环境变量
- `docs/knowledge-graph/`：知识图谱设计
- `docs/mobile/`：移动端实现说明
- `docs/api/接口索引.md`：当前共享 API Client 与后端 REST/SSE 路径映射

## 6. 脚本

- `scripts/README.md`：脚本说明
- `scripts/use-mobile-network.ps1`：移动端局域网地址切换
- `scripts/adb-reverse.ps1`：ADB 端口反向映射

## 7. 提交与历史

公开版本保留 ECHO `main` 的主要开发历史。仅涉及内部资料、部署记录、提示词、消息记录、演示数据包和设计截图的提交已从公开历史移除，原私有仓库不受影响。

当前公开索引共同基线：

- 根项目 `package.json`：`0.0.297`
- 教师 Web：`0.0.297`
- API：`0.0.297`
- 数据库迁移 head：`f1a2b3c4d5e6`
