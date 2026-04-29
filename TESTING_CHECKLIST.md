# ✅ Перевірка роботи розширення FairPrice

## 📊 Статус Crawl

**Поточний статус:** Запущено у фоні  
**Команда:** `node scripts/crawl.mjs`  
**Статистика:**
- ✅ Товарів записано: **200+** (росте)
- ⏭️ Пропущено: **20**
- ❌ Помилок: **0**
- 📍 Прогрес: **11/126 батчів**
- ⏱️ Час: **~1 хв 6 сек** (очікується ~15 хвилин)

Перевірити статус:
```powershell
Get-ChildItem crawl_*.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName -Tail 20 }
```

---

## 🔍 Поточна статистика БД

```
📦 Всього товарів: 1723
  - Dnipro-M: 999
  - Rozetka: 1
💰 Записів про ціни: 1724
✓ Всі товари доступні
```

---

## 🧪 Тестування розширення

### 1️⃣ Побудувати розширення (Chrome)
```powershell
npm run build
```

### 2️⃣ Завантажити у Chrome (MV3)
1. Відкрити `chrome://extensions`
2. Увімкнути **Developer mode** (праворуч вверху)
3. Натиснути **Load unpacked**
4. Вибрати папку `.wxt/chrome` у проекті
5. Розширення завантажиться

### 3️⃣ Перейти на сторінку товару (Dnipro-M)
```
https://dnipro-m.ua/tovar/akumulyatorna-lancyugova-pila-dms-201bc/
```

### 4️⃣ Що повинно відбутися:
- ✓ **Іконка розширення** змінить колір (значок "успіху")
- ✓ **Графік ціни** появиться на сторінці (дивись UI)
- ✓ **Консоль браузера** покаже логи (F12 → Console)
- ✓ **Popup** розширення (натиснути на іконку) покаже графік

### 5️⃣ Перевірка логів
```powershell
# Відкрити DevTools розширення
chrome://extensions/
# Натиснути на розширення → Details → "Inspect views" → "Service worker"
```

---

## 🔧 Розробка (Hot Reload)

```powershell
npm run dev
# Це запустить Chrome з розширенням + автоперезавантаженням при змінах
```

---

## 📋 Файли для тестування

**Ключові файли розширення:**
- `src/entrypoints/background.ts` — обробка повідомлень, Supabase
- `src/entrypoints/dniprom.content.tsx` — парсинг сторінки, UI injection
- `src/adapters/DniproMAdapter.ts` — витяг ціни з HTML
- `src/ui/components/PriceChart.tsx` — графік ціни
- `src/core/ExtensionController.ts` — оркестрація

**Тестові команди:**
```powershell
npm run typecheck          # Перевірка типів
npm run test               # Unit-тести
npm run test:e2e           # E2E-тести (Playwright)
npm run test:e2e:smoke     # Build + extension smoke для Dnipro-M / Rozetka
npm run ci:check           # Повна перевірка
```

### 6️⃣ Smoke-регресія інʼєкції віджета
- `tests/e2e/smoke.spec.ts` запускає Chrome/Chromium з реально завантаженим extension build
- Dnipro-M: перевіряє інʼєкцію віджета + відновлення після видалення контейнера
- Rozetka: перевіряє інʼєкцію через той самий shared injector path

---

## ⚠️ Можливі проблеми

| Проблема | Рішення |
|----------|---------|
| Іконка не змінює колір | Перевірити `background.ts` → `SET_ICON` |
| Графік не з'являється | Перевірити `dniprom.content.tsx` → `waitForElement` |
| Помилка "URL не знайдений" | Перевірити adapter → `isProductPage()` |
| Supabase connection error | Перевірити `.env.local` → `VITE_SUPABASE_*` |
| RPC помилка | Перевірити migration → `supabase db push` |

---

## 🎯 Наступні кроки

1. ✅ Дочекатись завершення crawl (~15 хвилин)
2. ✅ Перевірити `node scripts/check-db.mjs` — має бути ~2500 товарів
3. 🔨 Побудувати розширення: `npm run build`
4. 🚀 Завантажити у Chrome і тестувати
5. 🐛 Іф помилки — перевірити логи в DevTools

---

**Дата:** 10.04.2026  
**Час запуску crawl:** ~18:56 UTC+3

