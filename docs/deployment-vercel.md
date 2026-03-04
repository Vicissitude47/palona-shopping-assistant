# Vercel Deployment & Environment Validation

This checklist is intended for final Phase D delivery.

## 1. Prerequisites

- GitHub repository connected to Vercel.
- Neon Postgres project ready.
- Vercel Blob store created.
- Optional Redis store (recommended for production-like rate limiting/resumable streams).

## 2. Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

## Required
- `AUTH_SECRET`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`

## Required outside Vercel OIDC path
- `AI_GATEWAY_API_KEY`
  - On Vercel, AI Gateway can use OIDC/system credentials.
  - Keep key configured for portability and local fallback.

## Recommended
- `REDIS_URL`
- `MAX_MESSAGES_PER_DAY` (default `200`)
- `IP_MAX_MESSAGES_PER_DAY` (default `200`)
- `IMAGE_SEARCH_DEBUG` (`0` in normal usage, `1` for troubleshooting)

## 3. Database Initialization

Run once against your target database:
```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed:image
```

Notes:
- `db:seed` syncs `Product` records.
- `db:seed:image` writes/upserts embeddings into `product_image_embeddings`.

## 4. Pre-Deploy Validation (Local)

```bash
pnpm build
```

Optional:
```bash
pnpm exec playwright test tests/e2e/phase-c-core.test.ts --project=e2e
```

## 5. Post-Deploy Smoke Tests (Preview/Production)

1. Open app and create a new chat.
2. Send text request:
   - `Recommend me a running t-shirt under $40`
   - Verify returned items are from catalog only.
3. Upload JPEG/PNG image and ask:
   - `Please recommend based on this image`
   - Verify image tool returns similar catalog cards.
4. Send non-shopping query:
   - `What can you help me with?`
   - Verify direct chat response.
5. Confirm history panel open/close UX and new storefront layout.

## 6. Environment Validation Quick Matrix

- Missing `POSTGRES_URL` -> DB operations fail.
- Missing `BLOB_READ_WRITE_TOKEN` -> image upload fails.
- Missing `AI_GATEWAY_API_KEY` in non-Vercel env -> gateway auth errors.
- Missing `REDIS_URL` -> app still works, but resumable streams/IP rate-limit checks are reduced.

## 7. Troubleshooting

## Image upload fails
- Check blob token and file constraints (<=5MB, JPEG/PNG).

## Image recommendation says it cannot access image
- Ensure uploaded URL is from Vercel Blob.
- Confirm proxy endpoint `/api/files/blob` is reachable.
- Temporarily set `IMAGE_SEARCH_DEBUG=1` and inspect logs.

## Rate limit reached too early
- Review `MAX_MESSAGES_PER_DAY` and `IP_MAX_MESSAGES_PER_DAY` values.

## 8. Release Recommendation

- Use Preview deployment for QA sign-off.
- Promote same commit SHA to Production after smoke tests pass.
