# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-21

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

