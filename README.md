# Чесна Ціна (Fair Price) Extension

Розширення для браузера, яке допомагає перевіряти чесність ціни (наприклад, розрахунок ціни за одиницю товару).

## Структура проекту (WXT + Vite)

Проект використовує фреймворк [WXT](https://wxt.dev/) для сучасної розробки розширень, React 19 та TailwindCSS 4.

### Основні директорії:
- `wxt.config.ts`: Конфігурація проекту та маніфесту.
- `src/entrypoints/`: Точки входу розширення (Popup, Background, Content Scripts).
  - `popup/`: UI спливаючого вікна (React).
  - `background.js`: Service worker.
  - `content.ts`: Скрипт, що ін'єктується на веб-сторінки.
- `src/core/`: Бізнес-логіка (адаптери магазинів, розрахунок чесності).
- `src/ui/`: Компоненти інтерфейсу (Shadow DOM ін'єктор).

## Швидкий старт (людина + AI агент)

1.  **Встановіть залежності**:
    ```bash
    npm run setup
    ```
    *Примітка: Переконайтеся, що ви використовуєте Node.js LTS версії (v20+ рекомендується для React 19).*

2. **Підготуйте змінні оточення**:
   ```powershell
   Copy-Item .env.example .env
   ```
   Заповніть `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`.

3. **Перевірте preflight**:
   ```bash
   npm run doctor
   ```

4.  **Запустіть режим розробки**:
    ```bash
    npm run dev
    ```
    Ця команда:
    - Збере проект.
    - Відкриє окремий екземпляр Chrome з автоматично завантаженим розширенням.
    - Забезпечить HMR (миттєве оновлення при зміні коду).

    *Якщо браузер не відкрився автоматично, перевірте консоль на наявність помилок.*

### Налаштування середовища

1. Скопіюйте змінні оточення з шаблону:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Заповніть `VITE_SUPABASE_URL` та `VITE_SUPABASE_ANON_KEY`.
   - Домен Supabase уже дозволений у `host_permissions` (`*://*.supabase.co/*`).
3. Для Firefox (опційно) задайте `WXT_FIREFOX_BINARY`, якщо шлях відрізняється від дефолтного в `wxt.config.ts`.
4. За потреби змініть `WXT_START_URL` (за замовчуванням відкривається сторінка Dnipro-M товару при `npm run dev`).
5. Для керування шумом логів задайте `VITE_LOG_LEVEL` (`debug` | `info` | `warn` | `error` | `silent`).
6. Для crawler-режиму додайте `SUPABASE_SERVICE_ROLE_KEY` (і за бажанням `SUPABASE_URL`).

### Автономна перевірка для AI агента

```bash
npm run verify:agent
```

Це виконує: preflight (`doctor`) -> typecheck -> unit tests -> log policy check -> build.

Для crawler-інтеграції:

```bash
npm run verify:agent:crawl
```

### Швидка перевірка середовища

```bash
npm run doctor
npm run verify:agent
```

### Дебаг

- Dev для Chrome: `npm run dev`
- Dev для Firefox: `npm run dev:firefox`
- Для VS Code/JetBrains Gateway додані запускні конфіги в `.vscode/launch.json` і задачі в `.vscode/tasks.json`.
- Логи уніфіковані форматом: `[FairPrice][<scope>][<LEVEL>] message {context}`.
- Для Supabase дивіться `code` у логу (`SUPABASE_CONFIG_ERROR`, `SUPABASE_SAVE_FAILED`, `SUPABASE_HISTORY_FAILED`) і стартовий probe в background.

### Тестування

- Unit-тести (Vitest):
  ```bash
  npm run test
  ```
- Повна перевірка локально (як перед PR):
  ```bash
  npm run verify
  ```
- Перевірка, що в коді немає `console.*` поза `src/utils/logger.ts`:
  ```bash
  npm run check:logs
  ```
- Watch-режим unit-тестів:
  ```bash
  npm run test:watch
  ```
- E2E (Playwright):
  ```bash
  npm run test:e2e:install
  npm run test:e2e
  ```
- Діагностика Supabase інтеграції розширення:
  ```bash
  npm run test:extension
  ```
- Повна перевірка:
  ```bash
  npm run verify
  # або
  npm run verify:full
  ```

### CI / релізи / AI self-check

- Workflow: `.github/workflows/ci.yml`
- Canonical tag release workflow: `.github/workflows/release.yml` (запуск по тегу `v*`)
- Manual AI self-check: `.github/workflows/agent-self-check.yml`
- Daily crawl workflow: `.github/workflows/crawl.yml`
- Manual AI self-check workflow: `.github/workflows/agent-self-check.yml`
- Legacy manual build-only workflow: `.github/workflows/build-release.yml`
- CI запускає:
  - `npm run ci:check` (typecheck + unit tests)
  - `npm run ci:build` (build + zip для Chrome/Firefox)
- Після виконання workflow артефакти доступні як `extension-output`.
- `release.yml` публікує `.output/**/*.zip` у GitHub Release.

5.  **Збірка для публікації**:
    ```bash
    npm run build
    ```
    Готове розширення (zip-архів та розпакована папка) з'явиться у директорії `.output/`.

### Встановлення в браузер (вручну)

Якщо ви хочете встановити зібрану версію:
1. Виконайте `npm run build`.
2. Відкрийте `chrome://extensions/`.
3. Увімкніть "Developer mode" (Режим розробника).
4. Натисніть "Load unpacked" (Завантажити розпаковане).
5. Виберіть папку `.output/chrome-mv3` (або відповідну для вашого браузера).

### Серверний краулер цін

Автоматично обходить весь каталог Dnipro-M (2500+ товарів) і заповнює базу
даними без участі юзера.

- Edge Function: `supabase/functions/crawl-prices/index.ts`
- Детальна інструкція: [`docs/crawl-prices.md`](docs/crawl-prices.md)
- SQL-схема бази: `supabase/migrations/20260410_init.sql`
- Cron workflow: `.github/workflows/crawl.yml`

Швидкий старт:

```powershell
# 1. Деплой функції
npx supabase functions deploy crawl-prices

# 2. Встановити Service Role Key (беретcя з Supabase Dashboard → Settings → API)
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>

# 3. Тестовий запуск
npx supabase functions invoke crawl-prices --body '{}'
```

## Додавання нових магазинів

Щоб додати підтримку нового магазину:
1.  Створіть новий клас адаптера в `src/core/adapters/`, наслідуючись від `IPriceAdapter`.
2.  Додайте його в масив `adapters` у файлі `src/entrypoints/content.js`.

## Ліцензія

MIT
