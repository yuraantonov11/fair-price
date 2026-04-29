# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2026-04-29

### Added
- Baseline explainability in `PriceChart`: delta-vs-baseline chip with hint text plus focused unit coverage.
- Optional personalized-pricing baseline check endpoint flow (`CHECK_BASELINE`) with controller/background integration.
- Shared SPA reinject helper used by `ExtensionController` for more stable anchor recovery and mount placement.
- Telegram alert channel selection with graceful browser fallback when the Telegram path is disabled.

### Changed
- Synced release version metadata to `2.4.0` in `package.json` / `package-lock.json` for the next tagged release.

## [2.3.0] - 2026-04-29

### Changed
- Unified Dnipro-M and Rozetka rendering through the shared Shadow DOM injector so both stores now use the same mount/reinject lifecycle.
- Improved SPA hardening in `ExtensionController`: mount restoration is debounced, detects displaced widgets, and repositions the chart next to the current anchor after store re-renders.
- Added fallback selector helpers in `domUtils` and expanded anchor / title / price resolution in both adapters for more resilient parsing.

### Fixed
- Price dates in the chart now render with Ukrainian locale (`uk-UA`) instead of US format.
- Rozetka no longer uses a divergent direct React render path that could drift from Dnipro-M behavior.

### Added
- Real Playwright smoke regressions for Dnipro-M and Rozetka using extension-loaded Chromium plus routed fixture pages.
- `npm run test:e2e:smoke` for build + extension smoke validation.

## [1.2.3] - 2026-04-24

### Fixed
- DniproM: show price history widget for all prices (removed >300 UAH filter)
- DniproM: insert chart widget after .product-buy-info (directly below price/buy button)


## [1.2.2] - 2026-04-24

### Fixed
- GitHub Release workflow now requests `contents: write`, enabling `softprops/action-gh-release@v2` to create releases and generate notes without `403 Resource not accessible by integration`.
- Firefox release metadata and icons were aligned with AMO validator requirements (string `author`, gecko data collection declaration, and size-specific square icons in manifest).

## [1.2.1] - 2026-04-24

### Changed
- Restored compact redesign rendering across all `PriceChart` states by applying store-scoped theme wrapper consistently.
- Updated Dnipro-M UI injection anchor to place the chart lower, after the product metadata block near rating/reviews and SKU.
- Synced `dniprom` theme tokens with colors used on `dnipro-m.ua` CSS bundles.
- Kept blue color reserved for links in `dniprom` theme; chart/UI accents now use brand red/orange tokens.

### Fixed
- `TS2322` prop mismatch around `store` by aligning `PriceChart` usage in content/injector rendering paths.
- Prevented store theme leakage on reinjection by resetting `currentStore` during UI cleanup.

## [1.2.0] - 2026-04-22

### Added
- Full i18n (English / Ukrainian) using `i18next` + `react-i18next`
- Language switcher (EN / UK) in extension popup, persisted via `browser.storage.sync`
- Language change in popup **instantly** re-renders the content script chart (via `storage.onChanged`)
- `chart test mode` — activate via `?fp_test=1&fp_records=N&fp_scenario=flat|discount|spike|volatile|rising` URL params for UI testing without real data
- `TEST MODE` badge shown in chart when test mode is active
- `single-price` state: dedicated card showing observed price, days held, first-seen date
- `collecting` preview card (2 records): shows min/max observed prices and current-price context
- Spike detection with adaptive threshold (25% stable / 40% volatile products)
- Volatility detection (CV > 25%) with warning badge
- Trend indicator (↑ Rising / ↓ Falling / → Stable) based on recent price movement
- Stats bar: Min · 90d / Median / Max · 90d below the chart
- `docs/store-listing.md` — Chrome Web Store / Firefox AMO submission guide
- `docs/privacy-policy.md` — required for store submission

### Changed
- Score algorithm rewritten: median-anchored formula `score = clamp(50 × (2 − price/median), 0, 100)`
- `HonestyCalculator` now returns `messageKey` + `messageParams` (i18n keys) alongside legacy `message`
- All CI/CD workflows upgraded from Node.js 20 → 24
- Removed unused `alarms` and `declarativeNetRequest` permissions from manifest
- Removed unused `zustand` dependency

### Fixed
- Language preference was not shared between popup and content script (now uses `browser.storage.sync`)
- `usePriceStore.ts` placeholder no longer exports a misleading object



### Added
- Standalone Node.js crawler (`scripts/crawl.mjs`) replacing Edge Function for full-scale daily runs
- Sitemap-based URL discovery for Dnipro-M product pages (`src/utils/sitemapParser.ts`)
- GitHub Actions daily crawl workflow with configurable URL limit for test runs
- `doctor` and `doctor:crawl` preflight scripts for AI-agent autonomous workflow

### Changed
- CI and Release workflows now inject `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from GitHub secrets during build
- Release workflow now runs `ci:check` (typecheck + tests + log audit) before building artifacts
- `crawl.yml` SUPABASE_URL reads from repository variable `vars.SUPABASE_URL` with hardcoded fallback
- `wxt.config.ts` now reads `version` dynamically from `package.json` (single source of truth)

### Fixed
- Logger test isolation (no cross-test console leakage)
- DB migration synced with live Supabase schema

## [1.0.0] - 2026-04-10

### Added
- Initial release: price honesty monitoring for dnipro-m.ua and rozetka.com.ua
- `ExtensionController` orchestrator with SPA re-render support
- `HonestyCalculator` with median-based score, spike detection, and volatility flag
- Price history chart (`PriceChart`) using Recharts
- Dynamic extension icon reflecting honesty score (success / single-price / error)
- Shadow DOM injection for Dnipro-M content UI
- Background script as sole Supabase layer (SAVE_PRODUCT / GET_HISTORY messages)
- Store adapters: `DniproMAdapter`, `RozetkaAdapter`
- Supabase Edge Function `crawl-prices` (backup crawler)
- GitHub Actions CI workflow (typecheck + tests + build + artifact upload)
- Centralized logger (`createLogger`) with `check:logs` enforcement
- `.env.example` with required environment variables documented


