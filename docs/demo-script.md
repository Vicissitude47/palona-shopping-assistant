# Demo Script (10-12 Minutes)

Use this script for take-home walkthrough recording or live demo.

## 0. Setup (30s)
- Show app URL (Vercel Preview or local).
- Mention scope: text recommendation + image recommendation + catalog-only guarantee.

## 1. Product-first UX (1 min)
- Start on storefront view.
- Point out catalog cards and "Ask Assistant" CTA.
- Open and close History drawer to show conversation continuity.

## 2. Text recommendation scenario (2 min)

Prompt:
`Recommend me a running t-shirt under $40`

What to highlight:
- Tool call appears (`searchCatalog`).
- Result cards include price, reason, CTA.
- Products are catalog items only.

## 3. No-match fallback scenario (1 min)

Prompt:
`Recommend a 4K OLED TV`

What to highlight:
- No catalog match fallback message.
- Assistant gives alternative guidance instead of hallucinating products.

## 4. Image recommendation scenario (3 min)

Steps:
1. Upload JPEG/PNG product image.
2. Prompt: `Please recommend based on this image`

What to highlight:
- Tool call appears (`searchCatalogByImage`).
- Top similar products returned with similarity signal.
- Returned products still come only from catalog.

## 5. Reliability and safeguards (1.5 min)
- Mention file constraints (`<=5MB`, JPEG/PNG).
- Mention private Blob + server proxy for secure model access.
- Mention rate limiting and fallback errors (timeout/image access).

## 6. Engineering quality (1.5 min)
- Show `pnpm build` success.
- Mention E2E coverage in `tests/e2e/phase-c-core.test.ts`.
- Mention observability hooks (`chat-metrics`, `IMAGE_SEARCH_DEBUG`).

## 7. Close (30s)
- Summarize:
  - catalog-grounded recommendations,
  - image search via pgvector,
  - deploy-ready docs and checklist.

---

# Submission Checklist

- [ ] README is updated in English.
- [ ] API docs include request/response examples and error codes.
- [ ] Deployment checklist is included.
- [ ] Demo script is included.
- [ ] Latest commit pushed to `main`.

Optional ZIP:
```bash
git archive --format=zip --output shopping-assistant-main.zip main
```
