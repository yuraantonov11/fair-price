# Fair Price — Chrome Web Store / Firefox AMO Listing

## Extension Name
**Fair Price / Чесна Ціна**

## Short Description (max 132 chars)
Automatically monitors prices on Ukrainian online stores and detects fake discounts based on real price history.

## Full Description

**Fair Price** is a browser extension that helps you shop smarter on Ukrainian online stores. It silently tracks product prices in the background and tells you — right on the product page — whether the current price is actually a good deal or a manufactured "discount".

### How it works

Every time you visit a supported product page, the extension:
1. Records the current price to a shared price history database.
2. Retrieves the full price history for that product.
3. Calculates a **Honesty Index** (0–100) using a median-anchored algorithm.
4. Displays a compact chart with history and a verdict directly on the page.

### Honesty Index explained

| Score | Meaning |
|-------|---------|
| 70 + | Genuine discount — price is meaningfully below the usual |
| 50   | Normal price — typical for this product |
| < 35 | Suspicious — price is above the usual range |

Additional signals:
- 🚨 **Spike detected** — price was artificially inflated before the "discount"
- ⚡ **Volatile** — this product naturally has large price swings; evaluate with extra caution
- ↓ / ↑ / → **Trend** — whether prices have been falling, rising, or stable recently

### Supported stores
- **Dnipro-M** (dnipro-m.ua) — power tools and equipment
- **Rozetka** (rozetka.com.ua) — general electronics and goods

### Privacy
Fair Price does **not** collect any personal data. Only product URLs and prices are stored — never user identity, browsing history, or payment information. See our full [Privacy Policy](privacy-policy.md).

### Permissions used
- **storage** — saves your language preference (EN/UK) locally.
- **Host permissions** for dnipro-m.ua, rozetka.com.ua, and supabase.co (price history database).

---

## Category
Shopping

## Language
Ukrainian, English

## Homepage URL
https://github.com/yuraantonov11/fair_price

## Support URL
https://github.com/yuraantonov11/fair_price/issues

---

## Screenshots (required — create before submission)

Recommended sizes: **1280×800** or **640×400** PNG/JPEG.

1. `screenshot-01-good-deal.png` — product page showing score 74, "Good deal" verdict, price chart
2. `screenshot-02-spike.png` — product page showing spike warning and suspicious score
3. `screenshot-03-collecting.png` — preliminary analysis card (2/3 records)
4. `screenshot-04-popup.png` — extension popup with EN/UK language switcher

## Promotional tile (optional)
440×280 PNG — use the FairPrice logo on a dark gradient background.

---

## Chrome Web Store checklist
- [ ] All screenshots added (minimum 1)
- [ ] Promotional tile added (optional but recommended)
- [ ] Privacy policy URL filled in (use GitHub Pages or raw GitHub link to `docs/privacy-policy.md`)
- [ ] Category: Shopping
- [ ] Justify host permissions in the "Single purpose" description field
- [ ] Submit for review (typically 1–3 business days)

## Firefox AMO checklist
- [ ] Source code ZIP uploaded (required for review)
- [ ] Build instructions provided (`npm ci && npm run ci:build`)
- [ ] License: MIT
- [ ] Minimum Firefox version: 109.0 (set in manifest gecko.strict_min_version)

