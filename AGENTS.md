# AGENTS.md

## Project Snapshot
- Browser extension for price-honesty analysis on Ukrainian stores, built with WXT + React (`wxt.config.ts`, `src/entrypoints/*`).
- Current supported domains are explicit and hardcoded: Rozetka and Dnipro-M (`wxt.config.ts` host permissions).
- Core runtime model: content script parses page -> background persists/reads Supabase -> content script renders chart + icon state.

## Architecture and Data Flow
- Each store has its own content entrypoint and adapter (`src/entrypoints/rozetka.content.tsx`, `src/entrypoints/dniprom.content.tsx`, `src/adapters/*`).
- `ExtensionController` orchestrates page processing and SPA recovery (`src/core/ExtensionController.ts`):
  - checks `isProductPage()`;
  - sends `SAVE_PRODUCT` then `GET_HISTORY` via `MessageRouter`;
  - computes score with `HonestyCalculator`;
  - sets browser action icon via `SET_ICON`;
  - injects/reinjects UI when site frameworks re-render DOM.
- Background service worker is the only Supabase caller (`src/entrypoints/background.ts`), handling `SAVE_PRODUCT`, `GET_HISTORY`, `SET_ICON`, `SEND_FEEDBACK`.
- Price units are mixed by layer: adapters send `ProductData.price` in kopecks; history returned from background is converted to UAH for UI/calculation (`background.ts` map at `item.price / 100`). Preserve this contract when editing.

## Key Conventions in This Repo
- Adapter contract is strict and centralized in `src/adapters/IPriceAdapter.ts`; new stores should implement all methods even if catalog parsing is stubbed.
- Prefer resilient parsing order used in `RozetkaAdapter`: JSON-LD first, then DOM fallback + `waitForElement`.
- SPA hardening is expected: URL-change detection + DOM reinjection (`MutationObserver` in `ExtensionController`, `waitForElement` in `src/utils/domUtils.ts`).
- Dnipro-M extraction favors Next.js hydration (`src/utils/hydrationParser.ts`) with DOM fallback.
- UI injection patterns differ by store:
  - Dnipro-M uses Shadow DOM injector (`src/ui/injector.tsx`) for style isolation.
  - Rozetka entrypoint currently mounts React directly with cached root on container.

## External Integrations and Boundaries
- Supabase client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`src/utils/supabaseClient.ts`).
- Background expects Supabase RPC `record_price` and table `price_history` with related `products.url` (`src/entrypoints/background.ts`).
- Browser APIs used directly (`browser.runtime`, `browser.action`, `browser.tabs`) across popup/background/content.

## Developer Workflow (Observed)
- Install: `npm install`
- Dev (Chrome MV3): `npm run dev`
- Dev (Firefox): `npm run dev:firefox` (uses binary path from `wxt.config.ts`; Windows-specific path is configured)
- Build: `npm run build` / `npm run build:firefox`
- Package zip: `npm run zip` / `npm run zip:firefox`
- Repomix export: `npm run repomix` -> `docs/repomix.md`

## Current Gaps to Keep in Mind
- No implemented tests yet (`tests/unit`, `tests/e2e` are empty).
- `src/store/usePriceStore.ts` is a placeholder; runtime flow does not depend on Zustand yet.
- `supabase/functions/verify-price` and `supabase/migrations` are currently empty; database contract lives in background code assumptions.
