# Shopping Assistant (Palona Take-Home)

AI-powered shopping assistant with:
- text-based catalog recommendations,
- image-based similar-product search,
- strict "catalog-only" recommendation guarantees.

This repository is the take-home assignment deliverable and reflects Phase A-D completion scope.

## 1. Product Scope

### Core user journeys
- Ask for product recommendations in natural language (budget/category/style constraints).
- Upload a product image and get visually similar products from the internal catalog.
- Continue normal assistant chat for non-shopping requests.

### Hard business rule
- The assistant must only return products that exist in the internal `Product` catalog table.

## 2. Architecture

### Request flow
1. UI sends `POST /api/chat`.
2. API validates payload with Zod, checks auth, bot filter, and rate limits.
3. Messages are normalized for model safety (image attachments are converted to proxy URLs/instructions).
4. `streamText` runs with tools enabled for non-reasoning models.
5. Tool calls query catalog data (text search or pgvector similarity).
6. Streaming assistant response and messages are persisted in Postgres.

### Main modules
- Chat API: `app/(chat)/api/chat/route.ts`
- Chat request schema: `app/(chat)/api/chat/schema.ts`
- Text search tool: `lib/ai/tools/search-catalog.ts`
- Image search tool: `lib/ai/tools/search-catalog-by-image.ts`
- Image embedding pipeline: `lib/ai/image-embeddings.ts`
- DB queries: `lib/db/queries.ts`
- Catalog seed source: `lib/commerce/catalog.ts`

## 3. Design Decisions

### 3.1 Catalog-only recommendations
- Tooling is the single source of product truth.
- Assistant prompt explicitly forbids invented products.
- Tool responses include card-ready fields (`price`, `reason`, `cta`).

### 3.2 Minimal online vector layer (Neon + pgvector)
- `Product` remains the canonical entity table.
- `product_image_embeddings` is a lightweight retrieval index.
- Embeddings are upserted by an idempotent offline script.

### 3.3 Private Blob safety
- User uploads are stored as private blobs.
- `/api/files/blob` proxies blob reads server-side.
- Model/provider never directly receives private storage credentials.

### 3.4 Incremental delivery approach
- Intentionally avoided heavy infra (custom retrieval service, multi-agent planner/executor, etc.).
- Focused on practical improvements per phase with reproducible validation.

## 4. Data Model (Relevant Tables)

- `Product`: catalog source of truth.
- `product_image_embeddings`: `product_id`, `embedding`, `model`, `updated_at`.
- `Chat`, `Message_v2`, `Vote`, `Stream`: chat lifecycle persistence.

Migration for image retrieval:
- `lib/db/migrations/0012_product_image_embeddings.sql`

## 5. Local Setup

## Prerequisites
- Node.js 20+
- pnpm 9+
- Postgres (Neon/Postgres URL)
- Vercel Blob store

## Install
```bash
pnpm install
```

## Environment
Copy `.env.example` to `.env.local` and configure:
- `AUTH_SECRET`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`
- `AI_GATEWAY_API_KEY` (required for non-Vercel environments)
- `REDIS_URL` (optional but recommended for production-like behavior)
- `MAX_MESSAGES_PER_DAY`
- `IP_MAX_MESSAGES_PER_DAY`
- `IMAGE_SEARCH_DEBUG`

## Database
```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed:image
```

## Run / Build
```bash
pnpm dev
pnpm build
```

On Windows PowerShell, use `pnpm.cmd` if needed.

## 6. Validation Summary

## Build
- `pnpm build` passes (includes migration + Next production build).

## Core scenarios covered
- Text recommendation returns only catalog products.
- Image upload + image recommendation path returns catalog-only matches.
- Image-only message submit path works without empty text schema failures.

## Basic E2E tests
- `tests/e2e/phase-c-core.test.ts` covers:
  - image-only submit payload behavior,
  - upload error fallback message,
  - blob proxy request validation.

## 7. API Documentation

- Primary: `docs/api-chat.md`

Includes:
- request/response samples,
- tool behavior constraints,
- error code mapping,
- related image upload/proxy endpoints.

## 8. Deployment (Vercel)

Detailed checklist:
- `docs/deployment-vercel.md`

Includes:
- required env vars and validation checklist,
- Neon/Blob/Gateway expectations,
- post-deploy smoke test sequence.

## 9. Known Limitations

- Retrieval is catalog-limited by design (no external product graph).
- Image similarity quality depends on caption + embedding quality.
- No advanced reranking/retrieval fusion yet.
- No explicit confidence threshold tuning UI.
- Observability is lightweight (structured logs + request timing snapshots).

## 10. Roadmap

### Near-term
- Add stronger ranking signals (price fit + semantic rerank + click feedback).
- Expand test matrix for tool failure/fallback and streaming edge cases.
- Add richer metrics export (p95 latency, per-tool failure rate dashboards).

### Mid-term
- Hybrid retrieval (text + image fusion).
- Better cold-start and synonym handling for category terms.
- A/B test prompt/tool policies for conversion quality.

## 11. Demo Script & Submission

- Demo script: `docs/demo-script.md`
- Suggested submission artifacts:
  - GitHub repository URL (preferred), or
  - ZIP from latest main branch.

For ZIP export:
```bash
git archive --format=zip --output shopping-assistant-main.zip main
```
