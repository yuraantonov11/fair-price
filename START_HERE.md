# 🎬 START HERE - Починай звідсюди!

Це файл, якщо ти тільки що клонував репозиторій і не знаєш з чого почати.

## 👤 Я користувач (хочу встановити розширення)

Читай в цій послідовності:
1. **[README.md](README.md)** - Що це за розширення?
2. **[docs/SETUP.md](docs/SETUP.md)** - Як встановити?
3. Встанови розширення в Chrome/Firefox
4. Готово! 🎉

**Час:** 15 хвилин

---

## 👨‍💻 Я розробник (хочу розвивати проект)

### Крок 1: Налаштування (10 хвилин)
```powershell
# 1a. Клонуй репозиторій (якщо ще не зробив)
git clone https://github.com/yourusername/fair_price.git
cd fair_price

# 1b. Встанови залежності
npm run setup

# 1c. Скопіюй конфігурацію
Copy-Item .env.example .env

# 1d. Редагуй .env - заповни Supabase ключи
# VITE_SUPABASE_URL=https://...
# VITE_SUPABASE_ANON_KEY=eyJ...
notepad .env
```

### Крок 2: Запуск (5 хвилин)
```powershell
# Запусти dev сервер
npm run dev

# Браузер відкривається автоматично на сторінці товару!
# DevTools (F12) показує логи розширення
```

### Крок 3: Розуміння проекту (30 хвилин)
- Прочитай **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**
- Розглянь **[AGENTS.md](AGENTS.md)** для архітектури
- При потребі - [docs/SETUP.md](docs/SETUP.md)

### Крок 4: Розробка
```powershell
# Редагуй файли в src/
# Розширення перезавантажується автоматично (HMR)

# Запусти тести
npm run test

# Перевір типи
npm run typecheck
```

**Час:** ~1 година на освоєння

---

## 🤖 Я AI Agent (розуміння кодової бази)

Читай в цій послідовності:
1. **[AGENTS.md](AGENTS.md)** (30 хвилин) - Основна архітектура
2. **[docs/IMPLEMENTATION_SUMMARY.md](docs/IMPLEMENTATION_SUMMARY.md)** (10 хвилин) - Що було реалізовано
3. **[README.md](README.md)** (5 хвилин) - Context

Тепер ти розумієш проект! Можеш писати код 🚀

**Час:** ~45 хвилин на розуміння

---

## 🚀 Я DevOps (налаштування CI/CD)

Читай:
1. **[docs/GITHUB_ACTIONS_SETUP.md](docs/GITHUB_ACTIONS_SETUP.md)** - Налаштування
2. **[docs/GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md)** - Релізи
3. **[docs/crawl-prices.md](docs/crawl-prices.md)** - Краулер

Дії:
1. Додай secrets в GitHub Settings
2. Перевір workflows в `.github/workflows/`
3. Для перевірки релізного пайплайну використовуй тег формату `v*`, наприклад `git tag v2.3.1`

**Час:** 30 хвилин

---

## 📍 Навіші кроки перейти по документам

Якщо ти в розгубленості - читай **[docs/INDEX.md](docs/INDEX.md)** 🗺️

Це повна навігація по всіх документам проекту.

---

## ❓ Типові питання

**Q: Де налаштовується логування?**
A: `VITE_LOG_LEVEL` в `.env`

**Q: Як дебугити помилку `Failed to fetch`?**
A: Прочитай [docs/SETUP.md#типові-проблеми](docs/SETUP.md)

**Q: Як додати новий магазин?**
A: Читай [AGENTS.md#learning-path](AGENTS.md#learning-path-for-new-contributors)

**Q: Як робити реліз?**
A: [docs/GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md)

**Q: Як запустити тести?**
A: `npm run test` або `npm run test:watch`

---

## ✅ Чек-лист для розробника

- [ ] Клонував репозиторій
- [ ] Запустив `npm run setup`
- [ ] Скопіював `.env.example` → `.env`
- [ ] Заповнив SUPABASE ключи
- [ ] Запустив `npm run dev`
- [ ] Бачу розширення на сторінці товару
- [ ] Відкрив DevTools (F12) і бачу логи
- [ ] Запустив `npm run test` - все пройдено ✅
- [ ] Прочитав `docs/DEVELOPMENT.md`
- [ ] Готов розпочати розробку! 🚀

---

## 📞 Потрібна допомога?

| Ситуація | Рішення |
|----------|---------|
| Не знаю з чого почати | Читай цей файл 👆 |
| Не знаю як налаштовувати | → [docs/SETUP.md](docs/SETUP.md) |
| Ошибка при запуску | → [docs/SETUP.md#troubleshooting](docs/SETUP.md) |
| Хочу розуміти архітектуру | → [AGENTS.md](AGENTS.md) |
| Хочу знайти якийсь документ | → [docs/INDEX.md](docs/INDEX.md) |

---

## 🎯 Вибери свій шлях

```
Я розробник?
  → npm run dev
  → Читай docs/DEVELOPMENT.md

Я AI?
  → Читай AGENTS.md
  → Розумій архітектуру

Я DevOps?
  → Читай docs/GITHUB_ACTIONS_SETUP.md
  → Налаштовуй CI/CD

Я користувач?
  → Читай README.md
  → Встанови розширення
```

---

**Вибери свій шлях вище і потипай до того готового матеріалу! 👉**

*Останнє оновлення: 2026-04-10*

