# Privacy Policy — Fair Price

Effective date: 2026-10-16. Developer: Yurii Antonov (yuraantonov11@gmail.com).

## Product information

On supported Dnipro-M and Rozetka product pages, Fair Price reads the product URL, identifier, name, current/regular price, availability, promotion and category. The background script sends a product report to the configured Supabase project and requests confirmed price history. Query parameters and fragments are excluded from product identity.

Browser reports are unverified and stored separately from server-confirmed observations. Trusted daily observations are collected by a server crawler and used for the displayed analysis. Product reports and price history contain no extension-generated user identifier. The service provider receives normal network metadata such as the requesting IP address as part of serving requests; provider logs are subject to its configuration and policy.

## Preferences and optional features

Language is stored using browser.storage.sync and may be synchronized by your browser account. Consent preferences are stored in browser.storage.local. Affiliate preferences default to off. No affiliate link rewriting is implemented in this release.

Price alerts are unavailable in this release. Their runtime endpoints are disabled and client access to the legacy alerts table is revoked by the hardening migration. Previous records, if any, remain restricted to the backend operator; contact the developer for deletion.

Telemetry event ingestion is disabled. An optional baseline endpoint is disabled by default; it requires both explicit stored consent and a configured endpoint. If enabled, it receives the product URL, store and external product identifier. A future public opt-in flow must identify its provider before enabling it for users.

## Feedback

Feedback is sent only when you submit it. It includes the selected feedback type, your comment, and the active page origin/path (without query or fragment). Do not include passwords or payment details in comments. Failed submissions are shown as failures.

## Network and storage

The extension accesses supported stores and its configured Supabase backend. It uses system fonts and does not request Google Fonts. Opening the privacy policy or issue link navigates to GitHub after your action. The optional baseline endpoint described above is a separate configurable destination.

Supabase stores price reports, observations and submitted feedback in the region chosen for the configured project. Product history is retained for historical analysis; no automatic retention schedule is currently implemented. The developer can delete stored feedback or legacy alert records on request. Supabase is the infrastructure provider; see https://supabase.com/privacy.

The extension does not read store account credentials, payment details, cookies, or unrelated page content. Its normal automatic product-reporting flow runs on supported product pages; server crawls run independently of your browser.

## Permissions

`storage` saves preferences. Store host permissions allow content scripts to read product information. Backend host permission allows sending reports and loading history. Firefox declares browsing activity and website content because URLs and product information are transmitted. No browser notification permission is requested while alerts are deferred.

## Contact

Questions and deletion requests: yuraantonov11@gmail.com. Material policy changes will be reflected in this document and release notes.