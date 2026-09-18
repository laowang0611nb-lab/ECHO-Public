# ECHO Database V1 独立构架实施审计

日期：2026-09-18

## 1. 基线

- 仓库：`<repo>`
- 代码基线：`8d03d45`
- 后端历史 Alembic head：`d9e0f1a2b3c4`
- 独立数据库 Alembic head：`a3c4d5e6f7a8`
- 当前策略：先维护顶层 `database/` 独立副本，不要求 `apps/api` 接入

## 2. 已完成

### 2.1 结构复制

`database/` 已包含：

- `models/`
- `db/`
- `alembic/`
- `seeds/`
- `auth/`
- `tests/`
- `config.py`
- `requirements.txt`
- `alembic.ini`
- `README.md`

原后端数据库层已恢复在：

```text
apps/api/alembic.ini
apps/api/alembic/
apps/api/app/db/
apps/api/app/models/
apps/api/app/scripts/
```

### 2.2 账户模型

已实现：

- `User.username`
- `User.avatar_url`
- `User.status`
- `User.last_login_at`
- `UserCredential`
- `AuthSession`
- `TeacherProfile`
- `StudentProfile`

### 2.3 认证基础设施

已实现：

- Argon2id 密码 Hash/Verify
- Access JWT 的生成与校验
- Refresh Token 高熵随机生成
- Refresh Token 仅保存 SHA-256 Hash
- Session 创建、撤销、过期检查
- Refresh Token rotation

### 2.4 迁移

新增迁移：

```text
e1a2b3c4d5e6  add_user_account_fields
f2b3c4d5e6f7  add_user_credentials_and_sessions
a3c4d5e6f7a8  add_teacher_student_profiles
```

已验证：

- 空 SQLite 数据库 `upgrade head`
- `downgrade d9e0f1a2b3c4`
- 再次 `upgrade head`
- 最终 head 为 `a3c4d5e6f7a8`

## 3. 验证记录

```text
database pytest: 10 passed
database ruff check
database ruff format --check
SQLite migration upgrade/downgrade/upgrade
```

## 4. 明确未完成

以下内容属于后端冻结后的集成阶段，本次独立副本不做：

- 不把 `apps/api` 的正式导入切换为本副本
- 不实现正式 Auth REST API
- 不接入 Web/Android 登录
- 不创建 `MessageAttachment`
- 不完成 `courses.is_demo`、`documents.resource_type`、
  `knowledge_chunks.content_type`、`teaching_policies.version`
- 不改造演示 Seed 的密码、Profile 和 Demo 标记
- 不在没有 PostgreSQL 服务的本机伪造 PostgreSQL 验证结果

## 5. 已知风险

`alembic check` 在 SQLite 上会报告以下差异，其中部分属于 SQLite 类型
表示差异，部分需要在 PostgreSQL 接入前复核：

1. `knowledge_chunks.embedding` 在 SQLite 中显示为 `NUMERIC`，PostgreSQL
   目标类型应为 `VECTOR(1024)`。
2. `message_citations.citation_index` 迁移中存在 `server_default='1'`，
   模型本身没有 server default。
3. `teaching_policies.course_id` 的模型声明与旧迁移分别使用唯一索引和
   唯一约束，PostgreSQL 接入前必须统一。

正式接入前必须完成：

```text
PostgreSQL + pgvector 实例
→ upgrade head
→ 现有开发库升级
→ 关键读写与向量检索
→ downgrade/upgrade
```

## 6. 接入边界

后端线程冻结后，集成应按以下顺序进行：

1. 先确认 `apps/api` 工作区干净并完成现有后端修改。
2. 再统一 `database.*` 导入、session factory 和 Alembic 入口。
3. 然后补正式 Auth API 与 CurrentUser 兼容切换。
4. 最后处理 Attachment、业务元数据和 Seed 扩展。

在上述条件满足前，本目录只作为可独立测试的数据库基线，不视为已接入。
