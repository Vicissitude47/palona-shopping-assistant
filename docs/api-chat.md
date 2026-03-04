# API Documentation: Chat & Image Retrieval

## 1. Overview

This project uses `POST /api/chat` as the main assistant endpoint.

The endpoint supports:
- normal assistant conversation,
- catalog-constrained text recommendations (`searchCatalog` tool),
- image-based similar product retrieval (`searchCatalogByImage` tool),
- streaming responses over SSE.

## 2. Authentication and Access Control

- Auth is required (`session.user` must exist).
- Bot traffic is rejected (BotID check).
- Chat records are user-scoped (`chat.userId` ownership enforcement).

## 3. `POST /api/chat`

## Content type
- `application/json`

## Request schema (simplified)

```json
{
  "id": "uuid",
  "message": {
    "id": "uuid",
    "role": "user",
    "parts": [
      { "type": "text", "text": "Recommend breathable running tees under $40" }
    ]
  },
  "selectedChatModel": "openai/gpt-4.1-mini",
  "selectedVisibilityType": "private"
}
```

Fields:
- `id`: chat UUID.
- `message`: latest user message (normal flow).
- `messages`: full message list (tool-approval continuation flow).
- `selectedChatModel`: requested model id (server resolves unsupported values to default).
- `selectedVisibilityType`: `public | private`.

## Message part types

### Text
```json
{ "type": "text", "text": "..." }
```
- `text` length: `1..2000`.

### File (image)
```json
{
  "type": "file",
  "mediaType": "image/jpeg",
  "name": "shoe.jpg",
  "url": "https://<blob-url>"
}
```
- Allowed media types: `image/jpeg`, `image/png`.

## Behavioral constraints

1. For shopping text requests, model should call `searchCatalog`.
2. For image shopping requests, model should call `searchCatalogByImage`.
3. Returned products must come from internal catalog tables only.
4. If no match exists, assistant should clearly say so and suggest alternatives.
5. Non-shopping chat should be answered directly without product tools.

## Response

- Status: `200`
- Type: `text/event-stream`
- Format: AI SDK UI message stream events.

Example (conceptual):
```text
event: message
data: {"type":"tool-searchCatalog","state":"output-available", ...}

event: message
data: {"type":"text-delta","text":"Here are great options under $40..."}
```

## Example A: Text recommendation

Request:
```json
{
  "id": "f1ad8fbe-5357-42ff-9472-cdf9f31dd8f6",
  "message": {
    "id": "9ab736b7-b171-40c2-88ba-64295f7f8244",
    "role": "user",
    "parts": [
      { "type": "text", "text": "Recommend running t-shirts under $40" }
    ]
  },
  "selectedChatModel": "openai/gpt-4.1-mini",
  "selectedVisibilityType": "private"
}
```

Expected behavior:
- Triggers `searchCatalog`.
- Returns catalog items only (e.g., tee products).

## Example B: Image recommendation

Request:
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
        "name": "uploaded.jpg",
        "url": "https://<private-blob-url>"
      },
      { "type": "text", "text": "Find similar products" }
    ]
  },
  "selectedChatModel": "openai/gpt-4.1-mini",
  "selectedVisibilityType": "private"
}
```

Expected behavior:
- Triggers `searchCatalogByImage`.
- Returns top-K similar catalog items with `similarity`, `reason`, and CTA.

## 4. `DELETE /api/chat?id=<chatId>`

Deletes a chat owned by current user.

Request:
```http
DELETE /api/chat?id=2d3bde16-60f1-44b9-b22e-cf021984be20
```

Success:
- `200 OK` with deleted chat payload.

Common failures:
- `400` missing `id`
- `401` unauthenticated
- `403` chat not owned by requester

## 5. Related Image Endpoints

## `POST /api/files/upload`

Uploads image to Vercel Blob (private access).

Constraints:
- auth required,
- max size: 5 MB,
- MIME: JPEG/PNG only.

Success sample:
```json
{
  "url": "https://<private-blob-url>",
  "pathname": "image-abc.jpeg",
  "contentType": "image/jpeg"
}
```

Failure sample:
```json
{ "error": "File size should be less than 5MB" }
```

## `GET /api/files/blob?url=<blob-url>`

Server-side proxy for blob reads.

Validation:
- `url` required,
- URL must be Vercel Blob hostname (`*.blob.vercel-storage.com`).

Success:
- `200` image stream with correct `content-type`.

Failure:
- `400` missing/invalid URL or unsupported host,
- `404` blob not found.

## 6. Tool Output Shapes

## `searchCatalog` output (simplified)
```json
{
  "query": "running t-shirt",
  "total": 3,
  "products": [
    {
      "id": "tee-001",
      "name": "SwiftDry Performance T-Shirt",
      "category": "t-shirt",
      "price": 29,
      "currency": "USD",
      "imageUrl": "https://...",
      "reason": "Matches: running | Budget range any - $40",
      "ctaLabel": "View Product",
      "ctaUrl": "https://..."
    }
  ]
}
```

## `searchCatalogByImage` output (simplified)
```json
{
  "imageUrl": "https://...",
  "embeddingModel": "openai/text-embedding-3-small",
  "total": 3,
  "products": [
    {
      "id": "shoe-001",
      "name": "AeroRun Road Shoes",
      "similarity": 0.83,
      "reason": "Strong visual match"
    }
  ]
}
```

## 7. Error Codes

Errors use:
```json
{
  "code": "rate_limit:chat",
  "message": "You have exceeded your maximum number of messages for the day. Please try again later.",
  "cause": "optional"
}
```

Common codes:
- `bad_request:api` (`400`): invalid request schema/parameters.
- `unauthorized:chat` (`401`): missing auth session.
- `forbidden:chat` (`403`): accessing another user's chat.
- `rate_limit:chat` (`429`): daily user/IP quota exceeded.
- `bad_request:activate_gateway` (`400`): AI Gateway requires billing setup.
- `offline:chat` (`503`): upstream/service failure.

## 8. Observability Notes

- Request timing/failure snapshots are recorded in chat API metrics.
- Image search pipeline emits structured debug logs when `IMAGE_SEARCH_DEBUG=1`.

## 9. Source References

- Chat route: `app/(chat)/api/chat/route.ts`
- Chat schema: `app/(chat)/api/chat/schema.ts`
- Upload route: `app/(chat)/api/files/upload/route.ts`
- Blob proxy route: `app/(chat)/api/files/blob/route.ts`
- Errors: `lib/errors.ts`
