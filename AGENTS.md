# AGENTS.md

## Project Snapshot
- Browser extension for price-honesty analysis on Ukrainian stores, built with WXT + React (`wxt.config.ts`, `src/entrypoints/*`).
- Current supported domains: Rozetka and Dnipro-M (`wxt.config.ts` host permissions).
- Core runtime model: content script parses page → background persists/reads Supabase → content script renders chart + icon state.

## Architecture and Data Flow
- Each store has its own content entrypoint and adapter (`src/entrypoints/rozetka.content.tsx`, `src/entrypoints/dniprom.content.tsx`, `src/adapters/*`).
- `ExtensionController` orchestrates page processing and SPA recovery (`src/core/ExtensionController.ts`):
  - checks `isProductPage()`;
  - sends `SAVE_PRODUCT` then `GET_HISTORY` via `MessageRouter`;
  - computes score with `HonestyCalculator`;
  - sets browser action icon via `SET_ICON`;
  - injects/reinjects UI when site frameworks re-render DOM.
- Background service worker is the only Supabase caller (`src/entrypoints/background.ts`), handling `SAVE_PRODUCT`, `GET_HISTORY`, `SET_ICON`, `SEND_FEEDBACK`.
- Price units are mixed by layer: adapters send `ProductData.price` in **kopecks** (integer); history returned from background is converted to UAH for UI/calculation (`background.ts` map at `item.price / 100`). **Preserve this contract when editing.**
- **Server-side crawling pipeline** (`scripts/crawl.mjs` — primary; `supabase/functions/crawl-prices/index.ts` — Edge Function backup):
  - Fetches sitemap → extracts `/tovar/` URLs → scrapes each page → writes via `record_price` RPC.
  - `scripts/crawl.mjs` runs in Node.js (GitHub Actions), reads `.env` / `.env.local` automatically.
  - Edge Function version hits Supabase 150s wall-clock limit on free plan for full crawls; use Node.js script for production.
  - Price unit contract: crawler sends kopecks (integer) to `record_price`, same as browser adapters.

## Database Schema (Live — Supabase project `mdqcjgxpvvknpehuqrhl`)

```
products
  id           UUID PK  (gen_random_uuid)
  store_domain TEXT
  external_id  TEXT
  url          TEXT UNIQUE  ← upsert key for record_price ON CONFLICT
  name         TEXT
  updated_at   TIMESTAMPTZ

price_history
  id             UUID PK
  product_id     UUID FK → products.id
  price          INTEGER  ← kopecks
  regular_price  INTEGER  ← kopecks, nullable
  promo_name     TEXT     ← nullable
  is_available   BOOLEAN
  valid_from     TIMESTAMPTZ

user_requests
  id, type, url, comment, created_at
```

- RPC `record_price(p_store_domain, p_external_id, p_url, p_name, p_price INTEGER, ...)` — `SECURITY DEFINER`, writes via anon key.
- Migration source of truth: `supabase/migrations/20260410_init.sql` (idempotent, safe to re-run).
- Apply to new project: `npx supabase db push`.

## Key Conventions in This Repo
- Adapter contract is strict and centralized in `src/adapters/IPriceAdapter.ts`; new stores should implement all methods even if catalog parsing is stubbed.
- Prefer resilient parsing order used in `RozetkaAdapter`: JSON-LD first, then DOM fallback + `waitForElement`.
- SPA hardening is expected: URL-change detection + DOM reinjection (`MutationObserver` in `ExtensionController`, `waitForElement` in `src/utils/domUtils.ts`).
- Dnipro-M extraction favors Next.js hydration (`src/utils/hydrationParser.ts`) with DOM fallback.
- UI injection patterns differ by store:
  - Dnipro-M uses Shadow DOM injector (`src/ui/injector.tsx`) for style isolation.
  - Rozetka entrypoint currently mounts React directly with cached root on container.
- Server-side parsing mirrors adapter strategy: `__NEXT_DATA__` first → JSON-LD → regex fallback (`src/utils/priceScraper.ts`).
- Sitemap parser is DOM-free (regex-based) for edge/Deno compatibility (`src/utils/sitemapParser.ts`).
- Logging uses centralized `createLogger` from `src/utils/logger.ts` — **no direct `console.*` in `src/`** (enforced by `npm run check:logs`).

## External Integrations and Boundaries
- Supabase client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`src/utils/supabaseClient.ts`).
- Background uses RPC `record_price` and queries `price_history` joined via `products!inner(url)`.
- Browser APIs used directly (`browser.runtime`, `browser.action`, `browser.tabs`) across popup/background/content.
- Crawler (`scripts/crawl.mjs`) uses `SUPABASE_SERVICE_ROLE_KEY` — reads from `.env.local` locally, from GitHub Secrets in CI.

## Developer Workflow
- Install: `npm run setup`
- Local preflight: `npm run doctor`
- Dev (Chrome MV3): `npm run dev` → opens https://dnipro-m.ua/tovar/… automatically
- Dev (Firefox): `npm run dev:firefox`
- Build: `npm run build` / `npm run build:firefox`
- Package zip: `npm run zip` / `npm run zip:firefox`
- Unit tests: `npm run test`; CI full check: `npm run ci:check`
- Agent-ready verification: `npm run verify:agent` (or `npm run verify:full`)
- Extension diagnostics: `npm run test:extension`
- **Crawl (test 20 URLs):** `npm run crawl:test`
- **Crawl (N URLs):** `npm run crawl -- 100`
- **Crawl (all 2503):** `npm run crawl`
- Deploy Edge Function: `npx supabase functions deploy crawl-prices`
- Apply migrations: `npx supabase db push`

## CI / Release Conventions
- Canonical tag release workflow: `.github/workflows/release.yml`.
- Manual AI validation workflow: `.github/workflows/agent-self-check.yml`.
- `.github/workflows/build-release.yml` is legacy manual build-only artifacts workflow (no publishing).

## Current Gaps to Keep in Mind
- `src/store/usePriceStore.ts` is a placeholder; runtime flow does not depend on Zustand yet.
- Crawler daily schedule runs via `.github/workflows/crawl.yml` (GitHub Actions cron); needs `SUPABASE_SERVICE_ROLE_KEY` in GitHub Secrets.
- `supabase/functions/verify-price` is empty (planned feature).
