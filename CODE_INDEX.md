# ECHO 代码索引

本文件是公开比赛版本的代码入口，按“应用、数据、共享包、文档、脚本”组织。

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
| 环境变量模板 | `.env.example`、各应用 `.env.example` |

## 2. 应用

### `apps/web/`

Next.js 教师端，包含课程、知识库、学生、AI 审核、教学洞察、策略和执行计划页面。

常用命令：

```powershell
pnpm --filter @echo/web dev
pnpm --filter @echo/web build
pnpm --filter @echo/web lint
pnpm --filter @echo/web typecheck
```

### `apps/mobile/`

Expo + React Native 学生端，包含课程、AI 对话、学习记录和知识图谱。

常用命令：

```powershell
pnpm --filter @echo/mobile start
pnpm --filter @echo/mobile android
pnpm --filter @echo/mobile lint
pnpm --filter @echo/mobile typecheck
```

### `apps/api/`

FastAPI 后端，统一前缀 `/api/v1`，提供鉴权、课程、教材、学习事件、AI 审核、策略和健康检查接口。

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
- `docs/knowledge-graph/`：知识图谱设计
- `docs/mobile/`：移动端实现说明

## 6. 脚本

- `scripts/database/`：PostgreSQL 启停和维护
- `scripts/demo_data/`：演示数据生成
- `scripts/use-mobile-network.ps1`：移动端局域网地址切换
- `scripts/adb-reverse.ps1`：ADB 端口反向映射

## 7. 提交与历史

公开版本保留 ECHO `main` 的主要开发历史。仅涉及内部资料、部署记录、提示词、消息记录、演示数据包和设计截图的提交已从公开历史移除，原私有仓库不受影响。
