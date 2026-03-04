# /api/chat API 文档（v1）

本接口为 Palona Shopping Assistant 的核心聊天接口，负责：

- 普通对话
- 商品推荐（通过 catalog 检索 tool）
- 流式返回助手回答

## Endpoint

- `POST /api/chat`
- `DELETE /api/chat?id=<chatId>`

## 认证与权限

- 需要登录会话（`session.user`）
- 机器人请求会被拦截（BotID）
- chat 资源按 `chat.userId` 做隔离

## POST /api/chat

### 请求体

```json
{
  "id": "2d3bde16-60f1-44b9-b22e-cf021984be20",
  "message": {
    "id": "9de8d8af-8c1f-423f-8dd9-26dbd06f645d",
    "role": "user",
    "parts": [
      { "type": "text", "text": "Need a breathable running t-shirt under $40" }
    ]
  },
  "selectedChatModel": "openai/gpt-4.1-mini",
  "selectedVisibilityType": "private"
}
```

字段说明：

- `id`：聊天会话 UUID
- `message`：本次用户消息（普通对话流）
- `messages`：tool approval flow 时可传完整消息数组（更宽松 schema）
- `selectedChatModel`：前端选定模型 ID
- `selectedVisibilityType`：`public | private`

`message.parts` 支持：

- 文本：`{ "type": "text", "text": "..." }`
- 图片文件：`{ "type": "file", "mediaType": "image/jpeg|image/png", "name": "...", "url": "https://..." }`

### 推荐行为（业务约束）

1. 如果是购物/选品请求，应先调用 `searchCatalog` tool。
2. 如果请求包含商品图片，应优先调用 `searchCatalogByImage` tool。
3. 只能推荐 tool 返回的商品，禁止虚构 catalog 外商品。
4. 如果无匹配，要明确告知无匹配并给相邻建议。
5. 非购物闲聊应直接回复，不调用商品检索。
6. 当模型是 reasoning/thinking 模型时，tools 被禁用，应提示用户切换非 reasoning 模型。

### 成功响应

- HTTP `200`
- `text/event-stream`（SSE）
- 内容为 AI SDK UI message stream（含 token 增量、工具调用结果、最终消息等）

## 示例场景

### 示例 1：有匹配商品

请求：

```json
{
  "id": "f1ad8fbe-5357-42ff-9472-cdf9f31dd8f6",
  "message": {
    "id": "9ab736b7-b171-40c2-88ba-64295f7f8244",
    "role": "user",
    "parts": [
      { "type": "text", "text": "Recommend running tees under 40 dollars" }
    ]
  },
  "selectedChatModel": "openai/gpt-4.1-mini",
  "selectedVisibilityType": "private"
}
```

期望：

- 先触发 `searchCatalog` tool
- 回复中包含 catalog 商品，例如 `tee-001`, `tee-002`

### 示例 2：无匹配商品

请求关键词：`4K OLED TV`

期望：

- `searchCatalog` 返回空结果
- 助手明确说明未找到 catalog 内匹配项
- 给出可选替代方向（例如运动/服饰类可用品类）

### 示例 3：非购物闲聊

请求关键词：`What can you help me with?`

期望：

- 直接回答能力范围
- 不调用商品检索 tool

### 示例 4：图片搜商品

请求：

```json
{
  "id": "c16fd1af-2ad3-4da0-ae9f-0f748f2ce9f0",
  "message": {
    "id": "edbf01c2-17f3-4e05-99f4-e56d3f94937a",
    "role": "user",
    "parts": [
      {
        "type": "file",
        "mediaType": "image/jpeg",
        "name": "blob-upload.jpg",
        "url": "https://<your-blob-url>"
      },
      { "type": "text", "text": "Find similar products" }
    ]
  },
  "selectedChatModel": "openai/gpt-4.1-mini",
  "selectedVisibilityType": "private"
}
```

期望：

- 触发 `searchCatalogByImage`
- 返回 catalog 内 topK 相似商品（含 similarity 分数）

## DELETE /api/chat

删除当前用户拥有的 chat。

请求：

```http
DELETE /api/chat?id=<chatId>
```

响应：

- `200`：返回被删除的 chat 记录
- `400`：缺失 `id`
- `401`：未登录
- `403`：chat 不属于当前用户

## 错误码

`ChatbotError` 使用统一结构：

```json
{
  "code": "rate_limit:chat",
  "message": "You have exceeded your maximum number of messages for the day. Please try again later.",
  "cause": "optional"
}
```

常见错误：

- `bad_request:api`（400）：请求体不合法或参数缺失
- `unauthorized:chat`（401）：未登录
- `forbidden:chat`（403）：越权访问他人 chat
- `rate_limit:chat`（429）：达到每日消息上限
- `bad_request:activate_gateway`（400）：AI Gateway 账号未激活信用卡
- `offline:chat`（503）：服务端处理失败/上游不可用

## 关联实现

- 接口实现：`app/(chat)/api/chat/route.ts`
- 请求 schema：`app/(chat)/api/chat/schema.ts`
- 业务提示词：`lib/ai/prompts.ts`
- catalog 检索 tool：`lib/ai/tools/search-catalog.ts`
- catalog 查询：`lib/db/queries.ts`
