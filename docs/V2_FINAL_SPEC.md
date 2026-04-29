# Final V2 Specification - Fair Price Extension

## 1. Мета документа
Це фінальна специфікація V2, сформована на основі:
- `docs/Аналіз та Монетизація Розширення Chrome.md`
- поточного стану продукту (`v1.2.3`)
- архітектурних обмежень і контрактів із `AGENTS.md`

Ціль V2: зробити розширення стабільною, пояснюваною та монетизованою системою прозорості цін для українського e-commerce.

---

## 2. Вихідна точка (v1.2.3)
### Що вже реалізовано
- MV3 архітектура (WXT, content scripts, background).
- Адаптери магазинів: Dnipro-M, Rozetka.
- Потік даних через Supabase у runtime.
- On-page UI з графіком та базовим score.
- Crawler/Edge backup pipeline.

### Ключові прогалини
1. Алгоритм `Honesty Score` частково реалізований, але не повністю відповідає формулі V2.
2. Низька пояснюваність: бракує явних reason-codes та позначок джерела даних.
3. Слабкий retention: alerts/wishlist не завершені end-to-end.
4. Монетизація не доведена до комплаєнс-практики (explicit consent, прозорість).
5. Недостатньо KPI-телеметрії для керування продуктом і маркетингом.

---

## 3. Продуктові цілі V2
1. **Довіра**: користувач бачить, чому score саме такий.
2. **Точність**: менше хибних спрацювань за рахунок категорійних порогів.
3. **Утримання**: корисність не лише на сторінці товару (alerts).
4. **Комплаєнс**: повна прозорість affiliate-механіки.
5. **Готовність до доходу**: freemium + affiliate у робочому циклі.

---

## 4. Scope V2 (Must / Should / Could)
## 4.1 Must (блокери релізу)
1. **Honesty Score V2**
   - Медіана за 60 днів, мінімум за 30 днів, штраф за pre-inflation spike (14 днів).
   - Повернення `reasonCodes` та технічних метрик.
2. **Категорійна волатильність**
   - Пороги за категоріями (tools/electronics/fashion/fmcg/unknown).
3. **Explainable UI**
   - Бейджі причин score + пояснення в tooltip.
   - Позначки джерела історії (`community`, `system`).
4. **Alerts MVP**
   - Налаштування цільової ціни в popup.
   - Працюючий цикл trigger у background/Supabase.
5. **Комплаєнс UX**
   - Явний toggle згоди на affiliate.
   - Розділ прозорості в popup/settings.
6. **Телеметрія подій**
   - Події активації, утримання, конверсії, помилок.

## 4.2 Should (перша хвиля V2.x)
1. Перевірка персоналізованого ціноутворення через baseline endpoint.
2. Єдиний shared helper для SPA-anchor/reinject.
3. Канал Telegram для alerts.

## 4.3 Could (R&D після запуску)
1. Sentiment модуль відгуків.
2. B2B API/експорт даних.
3. Експерименти з lifetime/paywall-пакетами.

---

## 5. Технічні зміни по модулях
## 5.1 `src/core`
### `HonestyCalculator.ts`
Новий контракт результату:
- `score: number` (`0..100`)
- `verdict: "fair" | "warning" | "risky"`
- `reasonCodes: string[]`
- `metrics: { median60, min30, spike14Pct, penalty }`

Правила розрахунку:
1. Обчислити `median60` з вікна 60 днів.
2. Обчислити `min30` з вікна 30 днів.
3. Детектувати стрибок перед знижкою у 14-денному вікні.
4. Якщо поріг категорії перевищено - накласти штраф.
5. Нормалізувати score у `0..100`.

Рекомендовані reason-codes:
- `SPIKE_14D_DETECTED`
- `PRICE_NEAR_MIN30`
- `HIGH_CATEGORY_VOLATILITY`
- `INSUFFICIENT_HISTORY`

### Новий файл: `src/core/volatility.ts`
- Функція `getCategoryVolatility(category)`.
- Повертає пороги (`spikeThresholdPct`, `warningBandPct`).
- Дефолти для `unknown` обов'язкові.

### `ExtensionController.ts`
- Передавати `store`, `category`, `traceId` у scoring/UI.
- Забезпечити відсутність дублювання інжекту при SPA-оновленнях.

## 5.2 `src/adapters`
- Додати нормалізовані поля:
  - `category?: string`
  - `sourceConfidence?: "dom" | "hydration"`
- Зберегти контракт одиниць: адаптери віддають **копійки**.
- Уніфікувати fallback-ланцюги для anchor-елементів.

## 5.3 `src/entrypoints/background.ts`
- Розширити API-відповідь:
  - `source` для точок історії
  - `reasonCodes` + `metrics` для UI
- Зберегти конверсію: DB копійки -> UI гривні.
- Додати throttle/debounce від повторних SPA-повідомлень.

## 5.4 UI (`src/ui/components/PriceChart.tsx`, popup)
### On-page chart
- Блок "Чому такий score" (чіпи/tooltip).
- Легенда джерел даних (`community/system`).

### Popup
- Нова вкладка Alerts (CRUD цільових цін).
- Налаштування прозорості та consent на affiliate.

## 5.5 Crawler + Edge
### `scripts/crawl.mjs`
- Режим `TOP-N hourly` для пріоритетних товарів.

### `supabase/functions/crawl-prices/index.ts`
- Підтримка пріоритетних батчів і запису `source=system`.

---

## 6. Зміни в БД (Supabase)
Потрібна нова міграція V2:
1. `price_history`
   - Додати `source text` з check-обмеженням (`community`, `system`), default `community`.
2. `products`
   - Додати `category text null`.
3. `price_alerts`
   - `id uuid pk`
   - `user_key text`
   - `product_id uuid`
   - `target_price integer` (копійки)
   - `channel text` (`browser`, `telegram`)
   - `is_active boolean default true`
   - `created_at timestamptz`
4. `audit_events`
   - Мінімальна таблиця продуктової телеметрії.

Індекси:
- `price_history(product_id, created_at desc)`
- `price_alerts(user_key, is_active)`
- `products(shop_id, sku)`

---

## 7. Монетизація V2
## 7.1 Базові принципи
- Без прихованої підміни посилань.
- Affiliate-логіка лише після явної дії користувача.
- Видима користь для користувача (економія/кешбек/пояснення).

## 7.2 Freemium модель
### Free
- Базовий Honesty Score.
- Історія 60 днів.
- До 5 активних alerts.

### Pro
- Глибша історія.
- Необмежені alerts.
- Пріоритетні перевірки.
- Розширена аналітика.

## 7.3 Канали доходу
1. Affiliate CPA/CPS (основний на старті).
2. Pro підписка (середньостроково).
3. B2B Data-as-a-Service (після стабілізації V2).

---

## 8. KPI та вимірювання
## Product KPI
- Activation: перший успішний score у першій сесії.
- D1/D7 retention.
- Частка користувачів, що створили хоча б 1 alert.
- Alert-to-return conversion.

## Quality KPI
- Покриття explainability (% аналізів із reason-codes).
- Частка скарг на хибний score.
- Успішність парсингу по магазинах.

## Monetization KPI
- Consent opt-in rate.
- CTR affiliate-кнопок.
- Revenue per active user.

## Engineering KPI
- Error rate в message flow content/background.
- Time-to-inject після появи блоку ціни.
- Стабільність CI (`typecheck`, unit, e2e, build).

---

## 9. Дорожня карта (6-8 тижнів)
## Sprint 1 (тижні 1-2)
- `HonestyCalculator` V2 + `volatility.ts`.
- Unit/contract тести на edge-cases.
- Міграції БД (чернетка + review).

## Sprint 2 (тижні 3-4)
- Explainable UI у `PriceChart`.
- Розширення контрактів `background -> content UI`.
- Alerts CRUD у popup.

## Sprint 3 (тижні 5-6)
- Trigger pipeline alerts (background + Edge).
- Consent/disclosure UX.
- KPI-події + базові запити дашборду.

## Sprint 4 (тижні 7-8)
- Hardening для SPA-anchor/reinject.
- E2E регресії для Dnipro-M/Rozetka.
- Фінальний QA, release notes, rollout.

---

## 10. Ризики та мітигації
1. **Часті зміни DOM магазинів**
   - Мітигація: store-specific fallback + retry budget.
2. **Недовіра до score**
   - Мітигація: reason-codes + видимі метрики.
3. **Ризик відхилення в store review**
   - Мітигація: explicit consent і прозорий disclosure.
4. **Зростання вартості інфраструктури**
   - Мітигація: TOP-N crawl, retention політики, індекси.
5. **Низький retention**
   - Мітигація: alerts-first onboarding і повторні touchpoints.

---

## 11. Definition of Done (V2 GA)
V2 вважається готовою лише якщо:
1. Scoring V2 увімкнено в прод-потоці та повертає `reasonCodes`.
2. Категорійна волатильність впливає на результат і покрита тестами.
3. `PriceChart` відображає reason-codes і `source` бейджі.
4. Alerts MVP проходить повний цикл: create -> persist -> trigger path.
5. Consent/disclosure UX реалізовано і технічно enforced.
6. Проходять `typecheck`, unit, e2e smoke, build.
7. Підготовлено migration notes та release notes.

---

## 12. Що НЕ входить у V2 GA
- Повноцінна ML sentiment-модель у production.
- Self-serve B2B кабінет з повним доступом до DaaS.
- Вихід за межі українського ринку.

Ці блоки плануються у V2.x / V3.

---

## 13. Ready-to-create Issues
1. `feat(core): implement honesty-v2 scoring with reason codes and metrics`
2. `feat(core): add category volatility map and scoring integration`
3. `feat(ui): add explainability chips and source legend to price chart`
4. `feat(alerts): popup alerts CRUD and supabase schema`
5. `feat(compliance): affiliate consent flow and transparency text`
6. `test: add contract tests for units and scoring edge cases`
7. `test(e2e): add dniprom/rozetka reinject and low-price regressions`
8. `ops: add KPI telemetry events and dashboard queries`


