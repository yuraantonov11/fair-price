# Чесна Ціна / Fair Price

Браузерне розширення WXT + React для Dnipro-M та Rozetka: історія підтверджених цін, попередній аналіз і оцінка поточної ціни.

## Запуск

Потрібні **Node.js 24+** та активний проєкт Supabase.

```powershell
npm run setup
Copy-Item .env.example .env
# Заповніть VITE_SUPABASE_URL та VITE_SUPABASE_ANON_KEY.
npm run doctor
npm run doctor:schema
npm run dev
```

Якщо `.env` уже існує, збережіть його налаштування. Файл залишається локальним і не відстежується Git. `npm ci` генерує типи `.wxt` через `wxt prepare`.

- Chrome: `npm run dev`.
- Firefox: `npm run dev:firefox`; за потреби задайте `WXT_FIREFOX_BINARY`.
- Початкова сторінка: `WXT_START_URL`.
- Логи: `VITE_LOG_LEVEL=debug|info|warn|error|silent`; у `src/` використовується лише `createLogger`.
- `VITE_*` потрапляють у розширення. **Service-role та trigger secret мають залишатися тільки на сервері.**

## Помилка «Не вдалося завантажити історію»

Цей стан відрізняється від успішної відповіді без записів. Віджет зберігає поточну розпізнану ціну, не робить висновку про її чесність і пропонує повторити запит.

1. Запустіть `npm run doctor`: перевіряються формат конфігурації, DNS та API без запису до БД.
2. `ENOTFOUND` означає, що налаштоване ім’я backend не резолвиться. Звірте URL і стан проєкту в Supabase Dashboard; потім перебудуйте та перезавантажте розширення.
3. Запустіть `npm run doctor:schema`: перевіряються `price_observations` і параметри `record_price`.
4. `SCHEMA_MISMATCH` вимагає актуальних міграцій; `ACCESS_DENIED` — перевірки ключа та прав. Обидва випадки не повторюються автоматично.
5. Для мережевої помилки читання виконуються максимум дві повторні спроби. Точний код і повідомлення є в background/content логах зі спільним `traceId`.

`window.clarity` / `gtm.js` та повідомлення Tracking Prevention належать сайту або браузеру; вони самі по собі не встановлюють причину відмови Fair Price.

Для перевірки коду без мережевого probe: `npm run doctor:offline`. Цей режим не підтверджує доступність чи схему виробничого backend.

## Архітектура та одиниці

- `src/entrypoints/dniprom.content.tsx`, `rozetka.content.tsx` запускають адаптери та контролер.
- `src/adapters/*` парсять товар; адаптери повертають **цілі копійки**.
- `src/core/ExtensionController.ts` керує SPA-навігацією, запитами та віджетом. Застарілі асинхронні результати відкидаються.
- `src/entrypoints/background.ts` — єдиний runtime-шар доступу до Supabase; ціни тут переводяться в **гривні**.
- `src/ui/injector.tsx` керує Shadow DOM, React root та очищенням при навігації.
- Node crawler — основний збирач: каталог Dnipro-M, до 1000 останніх повідомлених URL за добу та відомі товари Rozetka; Edge Function — автентифікований резервний обхід до 20 товарів за запит.
- Чистий парсер Node/Edge: `supabase/functions/_shared/crawler.ts`. Тести імпортують виробничу реалізацію.

Браузерні звіти зберігаються як **неперевірені** в `community_price_reports` і не змінюють підтверджені ціни. Лише server/service-role збір наповнює щоденні `price_observations`; саме вони використовуються для оцінки. `price_history` зберігає зміни ціни/акції/наявності та час останнього підтвердження.

Медіана використовує підтверджені UTC-дні за 60 днів, мінімум — спостереження за 30 днів. Для повної оцінки потрібно щонайменше три різні підтверджені дні та свіже спостереження у 30-денному вікні. Одна давня точка не доводить стабільність ціни.

## Міграції та порядок оновлення

Застосовуйте всі міграції послідовно, перевіривши їх на тестовому проєкті:

1. `supabase/migrations/20260410_init.sql` — початкова схема.
2. `supabase/migrations/20260420_v2.sql` — поля V2.
3. `supabase/migrations/20261016_runtime_hardening.sql` — ізоляція звітів, щоденні підтвердження, права й crawler lease.

Спочатку оновіть БД, потім crawler/Edge і розширення. Нова міграція виконується транзакційно. Старі записи зберігаються для аудиту; вони не перетворюються автоматично на довірені щоденні підтвердження. Після переходу нове підтверджене вікно накопичує crawler.

Перед публікацією після цієї міграції запустіть повний `Crawl Prices` без `limit` і перевірте покриття `price_observations`. Кілька успішних smoke-товарів не означають, що історія доступна для всього каталогу. Після першого обходу буде одне підтвердження на товар; оцінка накопичується за різні дні.

Сповіщення та приймання телеметрії відкладено: runtime повертає `FEATURE_DISABLED`, приватні таблиці закриті для клієнтів. Партнерські налаштування вимкнені за замовчуванням. Google Fonts не завантажується; використовуються системні шрифти. Деталі — [privacy policy](docs/privacy-policy.md).

## Перевірки

```powershell
npm run ci:check          # TypeScript + unit/SQL tests + logging policy
npm run test:e2e          # Збірка для тестів + локальний HTTP mock + Playwright
npm run verify:full       # Перевірки + Chrome/Firefox build і ZIP
npm audit
```

SQL-тести запускають справжні міграції в PGlite з ізольованими Supabase-ролями. Вони не замінюють `doctor:schema` на розгорнутому проєкті. Необов’язкове `uuid-ossp` пропускається лише в embedded-тестах; схема використовує вбудований `gen_random_uuid`.

E2E використовують тільки `.output-e2e` і mock `127.0.0.1:38765`. Виробничий Supabase не викликається. Тести перевіряють помилки, повторне завантаження, порожню історію, відновлення mount і SPA-перегони.

`npm run verify:agent` включає online `doctor`. `npm run verify:agent:crawl` включає реальний crawler smoke і потребує серверних credentials; він записує дані. Офлайн-тести crawler входять до `npm run test`.

`npm run test:extension` перевіряє надсилання справжньої ціни публічним ключем і читання підтверджених спостережень. Задайте `LIVE_PRODUCT_URL` для товару, який уже обробив crawler. Скрипт не створює вигаданих тестових товарів.

## Збірка та встановлення

```powershell
npm run build
npm run build:firefox
npm run zip
npm run zip:firefox
```

`build` створює розпаковане розширення; ZIP створюється командами `zip`. Для Chrome відкрийте `chrome://extensions`, увімкніть Developer mode і завантажте `.output/chrome-mv3`. Firefox-збірка міститься в `.output/firefox-mv2`.

## Crawler та автоматизація

Інструкція: [docs/crawl-prices.md](docs/crawl-prices.md). GitHub Actions:

- `ci.yml` / `release.yml`: перевірки, ізольовані E2E та артефакти Chrome/Firefox; canonical release — тег `v*`.
- `crawl.yml`: щоденний Node crawl; потрібні variable `SUPABASE_URL` та secret `SUPABASE_SERVICE_ROLE_KEY`.
- `deploy-crawler.yml`: резервна Edge Function; потрібні також Supabase deployment secrets і `CRAWL_TRIGGER_SECRET`.
- `agent-self-check.yml`: офлайн-перевірка коду, опційний справжній crawler smoke.

## Додавання магазину

Створіть адаптер у `src/adapters/` за `IPriceAdapter`, content entrypoint у `src/entrypoints/`, додайте дозволені URL у конфігурацію, runtime- та SQL-валідацію і тести. Не змінюйте контракт копійки/гривні.

Тестовий режим графіка: `?fp_test=1&fp_records=3&fp_scenario=flat&fp_price=1999`. У цьому режимі показується `TEST MODE`, дані не надсилаються в backend.

## Ліцензія

MIT
