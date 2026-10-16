# Збір підтверджених цін

Production використовує Node.js 24+ і `scripts/crawl.mjs`; резервна Edge Function обробляє максимум 20 товарів за запит. Обидва шляхи використовують спільний парсер і серверний `record_price`. Node обходить sitemap Dnipro-M, до 1000 останніх повідомлених URL за 24 години та всі вже відомі товари Rozetka. Для підтвердження він читає сторінку магазину; передану браузером ціну не використовує. Невдале або заблоковане магазином завантаження не перетворюється на підтвердження.

## Підготовка

Застосуйте всі SQL-міграції з `supabase/migrations` у порядку назв, включно з `20261016_runtime_hardening.sql`. Не створюйте окремі старі версії RPC вручну: актуальна сигнатура має `p_category` і `p_source`, а початкова схема використовує UUID, не BIGSERIAL.

У локальному `.env.local` або середовищі CI:

```text
SUPABASE_URL=https://your-active-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only key>
```

Process environment має пріоритет над `.env.local`, а `.env.local` — над `.env`.

```powershell
npm run doctor:crawl
node scripts/crawl.mjs --limit 20
node scripts/crawl.mjs --concurrency 10 --delay 2000 --offset 0
```

Малий smoke теж записує підтверджені дані. Для перевірки без серверних credentials використовуйте `npm run test`.

Після першого застосування міграції щоденних спостережень запустіть повний Node workflow без `limit`. Smoke на 10 URL заповнює лише невелику частину каталогу. Для перевірки покриття читайте кількість рядків у `price_observations`, а не кількість старих `products` чи `price_history`. На сторінках без нового підтвердження віджет показує порожню історію.

## Надійність

- Усі ціни — додатні цілі копійки; парсер приймає структуровані Next.js/JSON-LD дані та валюту UAH.
- Sitemap index обходиться з обмеженням кількості файлів; сторонні домени та redirect відхиляються.
- Timeout охоплює body; тимчасові HTTP/мережеві помилки повторюються обмежено.
- Помилки запису або відсутність збережених товарів дають ненульовий exit code. JSON-summary містить `saved`, `failed`, `skipped`.
- Спільна lease в БД виключає одночасний Node/Edge crawl; release приймає тільки токен власника. Node lease діє до трьох годин, Edge — п’ять хвилин.
- Щоденне підтвердження зберігається навіть при незмінній ціні. Зміна акції чи наявності також зберігається в історії.

## Резервна Edge Function

Задайте випадковий `CRAWL_TRIGGER_SECRET` у Supabase secrets (і GitHub secret для deploy workflow). Він не має потрапляти до VITE-конфігурації чи розширення.

```powershell
supabase functions deploy crawl-prices --no-verify-jwt
```

Платформна JWT-перевірка тут вимкнена, але handler **вимагає серверний секрет** у `x-crawl-secret` до доступу до БД. Дозволено лише POST; без секрету — 401, при активному обході — 409. Запит JSON: `{ "limit": 20, "offset": 0 }`.

Приклад виклику з уже налаштованим середовищем:

```powershell
$headers = @{ 'x-crawl-secret' = $env:CRAWL_TRIGGER_SECRET }
Invoke-RestMethod -Method Post -Uri "$env:SUPABASE_URL/functions/v1/crawl-prices" -Headers $headers -ContentType 'application/json' -Body '{"limit":20}'
```

Не запускайте повний каталог через Edge: він має обмеження часу/compute. Для повного обходу використовуйте Node workflow.

## GitHub Actions

- Variable: `SUPABASE_URL` — адреса активного проєкту без fallback на чужий або старий проєкт.
- Secret: `SUPABASE_SERVICE_ROLE_KEY`.
- Для Edge deployment: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `CRAWL_TRIGGER_SECRET`.
- Daily workflow має власну concurrency group; база додатково захищає між Node та Edge.
- Розклад — щодня о 03:17 UTC. У публічних GitHub-репозиторіях scheduled workflows можуть вимикатися після 60 днів без активності репозиторію; перевіряйте дату останнього запуску, а не лише стан `active`.
- Deploy workflow перевіряє відмову без/з неправильним секретом і робить автентифікований crawl до 10 справжніх товарів.

Ручний Agent Self Check також має `backend_action`: `inspect` показує стан і схему поточного проєкту; `restore` відновлює призупинений проєкт без відкату backup; `migration-plan` показує відсутні міграції; `migrate` застосовує їх через CLI. Maintenance обмежено наявним проєктом, не створює нової БД і не виводить credentials.

При `ENOTFOUND` перевірте активність проєкту та DNS. При помилці RPC або відсутній таблиці застосуйте потрібні міграції й повторіть `npm run doctor:schema`. Не додавайте service-role key до розширення для обходу помилок доступу.
