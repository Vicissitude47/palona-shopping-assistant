# Palona Shopping Assistant

这是一个类似 Amazon Rufus 的购物助手 take-home assignment 项目。  
当前目标是围绕一个受控商品目录（catalog）实现可靠推荐，确保模型只返回目录内商品。

## 当前进度

- Phase A: 基本完成（本地构建、核心用例验证、README/API 文档）
- Phase B: 待开始（Image-Based Product Search）
- Phase C: 待开始（体验与稳定性）
- Phase D: 待开始（交付与部署）

## 架构概览

核心链路如下：

1. 前端聊天页发送消息到 `POST /api/chat`
2. `app/(chat)/api/chat/route.ts` 校验请求 + 鉴权 + 限流
3. 组装 system prompt（`lib/ai/prompts.ts`）并调用 `streamText`
4. 对购物问题优先调用 `searchCatalog` tool（`lib/ai/tools/search-catalog.ts`）
5. tool 通过 `searchCatalogProducts` 仅查询 `Product` 表（`lib/db/queries.ts`）
6. 回答与消息持久化到 Postgres（`Chat` / `Message_v2` / `Product` 等）

关键约束：

- 推荐商品必须来自 catalog 数据库
- 无匹配时要明确告知并给邻近建议
- reasoning 模型不启用 tools（会提示用户切换模型）

## 技术选型

- Next.js 16 + App Router: API/页面一体化，交付快
- Vercel AI SDK: 统一模型调用 + tool calling + SSE 流式输出
- Drizzle ORM + Postgres: 类型安全 schema 与迁移
- Auth.js: 会话与访问控制
- Zod: `/api/chat` 入参强校验
- Playwright: e2e 验证基础能力

## 本地运行

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env.local`，至少配置：

- `AUTH_SECRET`
- `AI_GATEWAY_API_KEY`（非 Vercel 环境必需）
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`
- `REDIS_URL`（可选，缺失时仅关闭 resumable stream）

### 3. 数据库迁移与种子数据

```bash
pnpm db:migrate
pnpm db:seed
```

- 迁移脚本：`lib/db/migrate.ts`
- 商品 seed 脚本：`lib/db/seed.ts`
- catalog 源数据：`lib/commerce/catalog.ts`

### 4. 启动与构建

```bash
pnpm dev
pnpm build
```

Windows PowerShell 若遇到执行策略限制，可使用 `pnpm.cmd`。

## Phase A 验证记录（2026-03-03）

### 构建验证

- 执行命令：`pnpm.cmd build`
- 结果：通过
- 包含步骤：DB migration + Next.js production build

### 3 条核心对话用例

执行了本地 catalog 检索验证脚本（`pnpm.cmd exec tsx -e ...`），输出：

- Case 1（运动 T 恤需求，价格上限）：返回 `tee-001`, `tee-002`, `tee-003`
- Case 2（通勤背包需求）：返回 `bag-001`
- Case 3（目录外商品 `4K OLED TV`）：返回空列表
- 约束校验：`allInCatalog = true`

说明：当前验证聚焦于推荐核心约束（只返回 catalog 内商品 + 无匹配处理）。完整 API 行为见文档。

## API 文档

- `/api/chat` 文档：`docs/api-chat.md`

## Phase B（Image-Based Search）实现说明

已实现最小线上向量方案（Neon + pgvector）：

1. migration 启用 `pgvector` 并创建 `product_image_embeddings`
2. 离线脚本 `pnpm db:seed:image` 读取 catalog 图片 URL，生成向量并 upsert
3. 新增 `searchCatalogByImage` tool（输入 Blob URL，向量检索后 join `Product` 返回结果）
4. 前端支持仅上传图片发送，返回相似商品卡片（含相似度）

相关文件：

- migration: `lib/db/migrations/0012_product_image_embeddings.sql`
- embedding 脚本: `lib/db/seed-image-embeddings.ts`
- image tool: `lib/ai/tools/search-catalog-by-image.ts`
- chat route wiring: `app/(chat)/api/chat/route.ts`
- UI 卡片: `components/message.tsx`

## 后续计划（摘要）

- Phase B: 图片向量化与图片检索 tool（同一 agent 编排）
- Phase C: 推荐卡片优化、错误兜底、可观测性与核心测试
- Phase D: 部署到 Vercel 并补全交付材料
