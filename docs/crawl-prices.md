# Інструкція: Серверний краулер цін (crawl-prices)

## Навіщо це потрібно

Розширення записує ціну лише тоді, коли **юзер відкриває** сторінку товару.
Це означає, що новий товар не матиме цінової історії, поки хтось його не відвідає.

Краулер вирішує це: він **автоматично обходить весь каталог** Dnipro-M раз на добу
і записує ціни в ту саму Supabase базу. Після кількох запусків — у базі є реальна
цінова динаміка для всіх 2500+ товарів.

```
Sitemap (2503 товари)
  ↓ sitemapParser
URL-список
  ↓ priceScraper (batch 20)
HTML сторінок → ціни
  ↓ record_price RPC
Supabase price_history
  ↓
Розширення → графік + HonestyScore
```

---

## Передумови

### 1. Встановити Supabase CLI

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
```

або через npm:

```powershell
npm install -g supabase
```

Перевірити:

```powershell
supabase --version
```

### 2. Прив'язати проект

```powershell
Set-Location "C:\Users\yuraa\WebstormProjects\fair_price"
supabase login
supabase link --project-ref mdqcjgxpvvknpehuqrhl
```

`mdqcjgxpvvknpehuqrhl` — це ref твого проекту (видно в URL Supabase Dashboard
або в `VITE_SUPABASE_URL`).

---

## Налаштування: секрети Edge Function

Edge Function потребує **Service Role Key** (не anon key) — він має права
на запис в будь-яку таблицю.

### Де взяти Service Role Key

1. Відкрий [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Вибери свій проект → **Settings** → **API**
3. Скопіюй **service_role** key (той, що під написом "This key has admin rights…")

### Встановити секрет

```powershell
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<твій_service_role_key>
```

Перевірити, що секрет встановлено:

```powershell
supabase secrets list
```

> ⚠️ `SUPABASE_URL` і `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
> автоматично доступні в Edge Functions як `Deno.env.get(...)`.
> Не потрібно окремо передавати `SUPABASE_URL`.

---

## База даних: створити RPC `record_price`

Edge Function викликає `supabase.rpc('record_price', {...})`.
Якщо цього RPC ще немає — треба створити в SQL Editor.

Відкрий **Supabase Dashboard → SQL Editor** і виконай:

```sql
-- Таблиця продуктів
CREATE TABLE IF NOT EXISTS products (
  id          BIGSERIAL PRIMARY KEY,
  store_domain TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  UNIQUE (store_domain, external_id)
);

-- Таблиця цінової історії
CREATE TABLE IF NOT EXISTS price_history (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price        BIGINT NOT NULL,              -- в копійках
  regular_price BIGINT,                      -- в копійках, може бути NULL
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  promo_name    TEXT,
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Індекс для швидкого пошуку по товару
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);

-- RPC: upsert продукт + додати запис ціни
CREATE OR REPLACE FUNCTION record_price(
  p_store_domain  TEXT,
  p_external_id   TEXT,
  p_url           TEXT,
  p_name          TEXT,
  p_price         BIGINT,
  p_regular_price BIGINT DEFAULT NULL,
  p_is_available  BOOLEAN DEFAULT TRUE,
  p_promo_name    TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id BIGINT;
  v_last_price BIGINT;
BEGIN
  -- Upsert продукту
  INSERT INTO products (store_domain, external_id, url, name)
  VALUES (p_store_domain, p_external_id, p_url, p_name)
  ON CONFLICT (store_domain, external_id)
  DO UPDATE SET url = EXCLUDED.url, name = EXCLUDED.name
  RETURNING id INTO v_product_id;

  -- Записуємо ціну тільки якщо вона змінилась (або це перший запис)
  SELECT price INTO v_last_price
  FROM price_history
  WHERE product_id = v_product_id
  ORDER BY valid_from DESC
  LIMIT 1;

  IF v_last_price IS DISTINCT FROM p_price THEN
    INSERT INTO price_history (product_id, price, regular_price, is_available, promo_name)
    VALUES (v_product_id, p_price, p_regular_price, p_is_available, p_promo_name);
  END IF;
END;
$$;
```

---

## Деплой Edge Function

```powershell
Set-Location "C:\Users\yuraa\WebstormProjects\fair_price"
supabase functions deploy crawl-prices
```

Успішний деплой виглядає так:
```
✓ Deploying Function crawl-prices ...
  Deployed Function crawl-prices ...done
```

---

## Тестовий запуск вручну

```powershell
supabase functions invoke crawl-prices --body '{}'
```

Або з лімітом URL для перевірки (поки без опції, але можна передати):
```powershell
supabase functions invoke crawl-prices --body '{"limit": 5}'
```

Очікуваний вивід у терміналі:
```json
{
  "saved": 18,
  "failed": 0,
  "skipped": 2,
  "totalUrls": 2503,
  "durationSeconds": "47.2"
}
```

Логи краулера в реальному часі (під час запуску):
```powershell
supabase functions logs crawl-prices --tail
```

---

## Налаштування автоматичного запуску (cron)

### Варіант A — GitHub Actions (рекомендовано, безкоштовно)

Додай файл `.github/workflows/crawl.yml`:

```yaml
name: Crawl Prices

on:
  schedule:
    - cron: '0 3 * * *'   # щодня о 03:00 UTC (05:00 Київ)
  workflow_dispatch:        # ручний запуск через UI

jobs:
  crawl:
    runs-on: ubuntu-latest
    steps:
      - name: Invoke crawl-prices function
        run: |
          curl -X POST \
            "https://mdqcjgxpvvknpehuqrhl.supabase.co/functions/v1/crawl-prices" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

Додай секрет у GitHub: **Repository Settings → Secrets → Actions → New secret**
- Name: `SUPABASE_SERVICE_ROLE_KEY`
- Value: твій service_role key

### Варіант B — pg_cron у Supabase Dashboard

1. Dashboard → **Database → Extensions** → увімкни `pg_cron`
2. **SQL Editor**:

```sql
SELECT cron.schedule(
  'crawl-prices-daily',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      'https://mdqcjgxpvvknpehuqrhl.supabase.co/functions/v1/crawl-prices',
      '{}',
      jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    );
  $$
);
```

---

## Перевірка результату

Після запуску перевір у Supabase **Table Editor → price_history**, чи з'явились нові записи:

```sql
-- Скільки товарів в базі
SELECT COUNT(*) FROM products WHERE store_domain = 'dnipro-m.ua';

-- Останні записані ціни
SELECT p.url, p.name, ph.price / 100.0 AS price_uah, ph.valid_from
FROM price_history ph
JOIN products p ON p.id = ph.product_id
WHERE p.store_domain = 'dnipro-m.ua'
ORDER BY ph.valid_from DESC
LIMIT 20;

-- Товари з найбільшою кількістю змін ціни
SELECT p.name, COUNT(ph.id) AS price_changes
FROM price_history ph
JOIN products p ON p.id = ph.product_id
GROUP BY p.id, p.name
ORDER BY price_changes DESC
LIMIT 10;
```

---

## Структура файлів краулера

```
supabase/functions/crawl-prices/
  index.ts              ← Edge Function (Deno)

src/utils/
  sitemapParser.ts      ← парсинг sitemap XML
  priceScraper.ts       ← HTTP-скрапінг ціни зі сторінки

tests/unit/
  sitemapParser.test.ts ← 4 unit-тести
  priceScraper.test.ts  ← 4 unit-тести
```

---

## Параметри краулера (налаштовуються в `index.ts`)

| Константа | Значення | Пояснення |
|---|---|---|
| `BATCH_SIZE` | 20 | Скільки сторінок одночасно |
| `DELAY_BETWEEN_BATCHES` | 2000 мс | Пауза між батчами |
| `REQUEST_TIMEOUT` | 10000 мс | Ліміт часу на одну сторінку |
| `SITEMAP_URL` | dnipro-m.ua/sitemap_uk.xml | URL sitemap |

---

## Troubleshooting

| Проблема | Рішення |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY not set` | `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` |
| `record_price function not found` | Виконай SQL з розділу "База даних" вище |
| Краулер повертає `saved: 0` | Перевір логи `supabase functions logs crawl-prices --tail` |
| Timeout при деплої | `supabase functions deploy crawl-prices --no-verify-jwt` |
| Dnipro-M блокує запити | Збільш `DELAY_BETWEEN_BATCHES` до 5000 мс |

