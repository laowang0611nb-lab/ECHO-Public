# ECHO

ECHO 是面向高等教育课程的 AI 教育 Agent，连接课程教材、学生 Agent、学习证据、教师审核和教学行动。仓库采用 Monorepo 组织教师 Web、学生移动端、FastAPI 后端、数据库基础层和共享 TypeScript 包。

本仓库是 ECHO 的公开比赛代码版本，保留源代码、测试、技术文档、配置模板和主要开发历史。内部部署记录、提示词、消息记录、演示数据包和本机路径不包含在公开版本中。

## 当前版本

| 项目 | 当前值 |
|---|---|
| 代码版本 | `0.0.297` |
| 比赛分支 | `0.0.x-274` |
| 分支标识 | `0.0.x-274`，其中 `x` 是固定字母 |

相同版本号不代表服务器一定运行最新构建。必须分别核对 Git 分支、教师 Web 页面版本和 `/api/v1/health` 返回的实际 API 版本。

## 团队信息

| 项目 | 内容 |
| --- | --- |
| 团队名称 | 熵减小队 |
| 团队成员 | 王鹏 |
| 学校 | 哈尔滨华德学院 |
| 学院 | 数据科学与信息工程学院 |
| 指导教师 | 董沣 |
| 分工 | 王鹏：全栈开发 |

## 在线演示

| 项目 | 地址或说明 |
| --- | --- |
| 教师 Web | <https://echo.laowangworld.xyz> |
| API 健康检查 | <https://echo.laowangworld.xyz/api/v1/health> |
| 当前线上版本 | `v0.0.274` |
| 体验账号 | 由比赛提交平台单独提供，账号和密码不写入公开仓库 |
| 使用范围 | 仅用于比赛评审和功能体验，请勿公开传播 |

当前公网环境运行 `v0.0.274`，本仓库后续代码版本可能高于线上演示版本。评审和演示时以公网环境实际可用的功能为准；教师 Web 可体验 Dashboard、课程管理、知识库、学生学情、课程知识图谱、AI 教学洞察、AI 回答审核和教学策略。

## 技术架构

| 模块 | 技术栈 | 目录 |
| --- | --- | --- |
| 教师 Web | Next.js、React、TypeScript、Tailwind CSS、AntV G6、ECharts | `apps/web/` |
| 学生移动端 | React Native、Expo、Expo Router、NativeWind、Zustand | `apps/mobile/` |
| 后端 API | FastAPI、Pydantic、SQLAlchemy Async、Alembic | `apps/api/` |
| 数据层 | PostgreSQL、pgvector；SQLite 用于本地测试 | `database/` |
| 共享包 | OpenAPI Client、共享类型、设计 Token | `packages/` |
| 工程脚本 | 网络与 ADB 辅助脚本 | `scripts/` |

## 目录

```text
apps/
  api/          FastAPI 后端
  web/          Next.js 教师端
  mobile/       React Native + Expo 学生端
database/       SQLAlchemy 模型、Alembic 迁移和测试
packages/       API Client、共享类型、设计 Token
docs/           架构、API、数据库、知识图谱和移动端文档
scripts/        网络与 ADB 辅助脚本
```

## 环境要求

- Node.js 20+
- pnpm 11+
- Python 3.11+
- PostgreSQL 17 + pgvector，或 SQLite 本地测试

依赖清单位于根目录和各子项目：

- `package.json`
- `pnpm-lock.yaml`
- `apps/api/pyproject.toml`
- `apps/web/package.json`
- `apps/mobile/package.json`
- `database/requirements.txt`
- `database/requirements-dev.txt`

## 环境变量

仓库提供以下模板：

- `.env.example`：共享后端与前端变量
- `apps/api/.env.example`：后端与环境变量
- `apps/web/.env.example`：教师 Web
- `apps/mobile/.env.example`：学生端
- `apps/mobile/.env.adb.example`
- `apps/mobile/.env.hotspot.example`
- `apps/mobile/.env.public.example`

完整变量说明、默认值、密钥边界和服务器版本核验方法见 [`docs/环境变量说明.md`](docs/环境变量说明.md)。

使用方式：

```powershell
Copy-Item .env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

按实际环境填写数据库地址、鉴权密钥、模型 API 和服务地址。真实 `.env`、密钥、令牌和账号凭据不得提交到仓库。

生产环境至少确认：

- `ECHO_DEVELOPMENT_AUTH_ENABLED=false`
- `ECHO_AUTH_SECRET_KEY` 使用强随机值
- `EXPO_PUBLIC_ALLOW_INSECURE_API_OVERRIDE=false`
- 数据库仅监听本机
- Chat、Embedding 和远程 ASR 已在服务器侧实际连通

## 安装

```powershell
pnpm install
```

后端虚拟环境：

```powershell
py -3.11 -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -e "apps/api[dev]"
```

macOS / Linux：

```bash
python3.11 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -e "apps/api[dev]"
```

## 数据库

PostgreSQL 需要 pgvector 扩展。默认连接通过 `ECHO_DATABASE_URL` 配置，例如：

```text
postgresql+asyncpg://echo:echo@localhost:5432/echo
```

本地测试也可以使用 SQLite：

```text
sqlite+aiosqlite:///./echo.db
```

执行迁移：

```powershell
apps/api/.venv/Scripts/python.exe -m alembic -c database/alembic.ini upgrade head
```

数据库结构和迁移说明见 `database/README.md`、`docs/database/`。

## 运行

```powershell
pnpm run dev:api
pnpm run dev:web
pnpm run dev:mobile
```

非 Windows 环境直接启动后端：

```bash
apps/api/.venv/bin/python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --reload
```

默认地址：

```text
API:      http://127.0.0.1:8000
教师 Web: http://127.0.0.1:3000
Metro:    http://127.0.0.1:8081
```

## 验证

```powershell
pnpm run lint
pnpm run typecheck
pnpm run test:api
pnpm run test:database
```

## 文档与索引

- 代码与目录索引：`CODE_INDEX.md`
- 环境变量：`docs/环境变量说明.md`
- 系统架构：`docs/architecture/`
- API 契约：`docs/api/`、`docs/API契约.md`
- 数据库：`database/README.md`、`docs/database/`
- 知识图谱：`docs/knowledge-graph/`
- 移动端：`docs/mobile/`

## 安全边界

- 教材、头像和聊天附件通过鉴权接口读取，不公开整个存储目录。
- 模型和短信密钥只保存在服务器端。
- AI 分析只能引用持久化证据，证据不足时必须明确说明。
- 未实现能力不得用 Mock 或虚构数据包装为已交付功能。
