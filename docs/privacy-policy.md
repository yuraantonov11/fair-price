# Privacy Policy — Fair Price Extension

**Effective date:** 2026-04-22  
**Extension:** Fair Price / Чесна Ціна  
**Developer:** Yurii Antonov (yuraantonov11@gmail.com)

---

## What data we collect

Fair Price collects **only product pricing data** necessary to provide its core functionality:

| Data | Purpose | Storage |
|------|---------|---------|
| Product URL | Identify the product in price history | Supabase cloud database |
| Product name | Display in price history | Supabase cloud database |
| Current price | Build price history for analysis | Supabase cloud database |
| Store domain | Group prices by store | Supabase cloud database |
| Language preference (EN/UK) | Display UI in your chosen language | Browser local storage (on-device only) |

## What we do NOT collect

- No personal information (name, email, account)
- No browsing history beyond supported store product pages
- No payment or financial data
- No location data
- No device identifiers
- No cookies

## How data is used

Price data is used exclusively to:
1. Calculate the Honesty Index shown on product pages.
2. Build aggregate price history charts visible to all extension users.
3. Detect artificial price inflation patterns.

Price data is **not sold**, **not shared** with third parties, and **not used for advertising**.

## Data storage

Price history is stored in a Supabase PostgreSQL database hosted in the EU (Frankfurt region). Data is retained indefinitely to provide long-term price history. Records contain no user identifiers — it is impossible to trace any record back to an individual user.

## Permissions explained

| Permission | Reason |
|-----------|--------|
| `storage` | Save your language preference (EN/UK) locally on your device |
| Host: `*://dnipro-m.ua/*` | Read product prices from Dnipro-M product pages |
| Host: `*://rozetka.com.ua/*` | Read product prices from Rozetka product pages |
| Host: `*://*.supabase.co/*` | Send/retrieve price data to/from the price history database |

No other hosts are accessed. The extension does not make any requests in the background when you are not visiting a supported store.

## Third-party services

The extension uses [Supabase](https://supabase.com) as its backend. Supabase's privacy policy applies to data stored there: https://supabase.com/privacy

## Changes to this policy

If this policy changes materially, the extension version will be incremented and the changelog will note the update.

## Contact

Questions or data deletion requests: yuraantonov11@gmail.com  
GitHub: https://github.com/yuraantonov11/fair_price/issues

