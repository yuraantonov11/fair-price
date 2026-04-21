# AGENTS.md

## Project Purpose
- Browser extension (WXT + React) that analyzes price honesty on product pages.
- Main runtime: content script parses product -> background stores/reads Supabase -> content script renders chart + sets icon.
- Supported stores now: Dnipro-M and Rozetka (`wxt.config.ts`, `src/entrypoints/*.content.tsx`).

## Core Architecture You Must Respect
- `src/core/ExtensionController.ts` is the orchestrator: product detection, `SAVE_PRODUCT`, `GET_HISTORY`, score calculation, icon updates, reinjection on SPA re-renders.
- `src/entrypoints/background.ts` is the only layer that talks to Supabase for extension runtime.
- Store parsing lives in adapters (`src/adapters/*`) behind strict interface `src/adapters/IPriceAdapter.ts`.
- Dnipro-M content UI uses Shadow DOM injector (`src/ui/injector.tsx`); Rozetka mounts directly.
- Crawler pipeline is Node-first in production (`scripts/crawl.mjs`), Edge Function is backup (`supabase/functions/crawl-prices/index.ts`).

## Data Contracts (Critical)
- Adapters and crawler send prices in kopecks (integer).
- History returned to UI/calculator is converted to UAH in background (`item.price / 100`).
- Keep this unit split unchanged unless you update all layers together.
- DB schema source of truth: `supabase/migrations/20260410_init.sql`.

## Logging and Diagnostics Rules
- In `src/`, use only `createLogger` from `src/utils/logger.ts`.
- Do not add raw `console.*` in `src/` (`npm run check:logs` enforces this).
- Include stable context in logs (`store`, `traceId`, `url`) for cross-layer debugging.

## AI Agent Autonomous Workflow
- 1) Install deps: `npm run setup`
- 2) Preflight extension env: `npm run doctor`
- 3) Run fast validation: `npm run verify:agent`
- 4) If crawler touched: `npm run doctor:crawl` then `npm run verify:agent:crawl`
- 5) For release-grade artifacts: `npm run verify:full`

## Environment Setup
- Copy `.env.example` -> `.env` and fill at least:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- For crawler writes also set:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - optional `SUPABASE_URL` (otherwise fallback to `VITE_SUPABASE_URL`)
- Dev browser auto-opens `WXT_START_URL` (default Dnipro-M product URL).

## Development and Debug Commands
- Chrome dev: `npm run dev`
- Firefox dev: `npm run dev:firefox`
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e` (install once with `npm run test:e2e:install`)
- CI-equivalent checks: `npm run ci:check`

## Deploy and Automation
- CI build/tests: `.github/workflows/ci.yml`
- Release by tag `v*` (canonical): `.github/workflows/release.yml`
- Daily crawler job: `.github/workflows/crawl.yml` (requires GitHub secret `SUPABASE_SERVICE_ROLE_KEY`).
- Manual AI self-check: `.github/workflows/agent-self-check.yml` (workflow_dispatch, optional crawler smoke)
- Legacy manual build-only workflow: `.github/workflows/build-release.yml` (no tag trigger)
- Crawler function deploy: `npx supabase functions deploy crawl-prices --no-verify-jwt`

## Known Limits / Important Notes
- Edge Function full crawl can hit Supabase compute limits; use `scripts/crawl.mjs` for full runs.
- `src/store/usePriceStore.ts` is placeholder and not part of critical runtime path.
- `supabase/functions/verify-price` is currently empty (planned feature).
