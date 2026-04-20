# 🎬 START HERE - Починай звідсюди!

Короткий маршрут для людей, AI-агентів і DevOps.

## 👨‍💻 Я розробник

### Крок 1: Setup (5-10 хв)
```powershell
git clone https://github.com/yourusername/fair_price.git
cd fair_price
npm run setup
Copy-Item .env.example .env
```

> Локально можна використовувати і `.env.local` (він має пріоритет над `.env`).

### Крок 2: Preflight і верифікація
```powershell
npm run doctor
npm run verify
# або повний AI-friendly цикл
npm run verify:agent
```

### Крок 3: Запуск і діагностика
```powershell
npm run dev
npm run test:extension
```

## 🤖 Я AI Agent

1. Прочитай **[AGENTS.md](AGENTS.md)**
2. Виконай:
   - `npm run setup`
   - `npm run doctor`
   - `npm run verify:agent`
3. За потреби crawler smoke:
   - `npm run verify:agent:crawl`

Для ручного CI self-check використовуй workflow:
- `.github/workflows/agent-self-check.yml`

## 🚀 Я DevOps

Ключові workflow:
- Canonical tag release: `.github/workflows/release.yml`
- Manual AI self-check: `.github/workflows/agent-self-check.yml`
- Legacy manual build-only artifacts: `.github/workflows/build-release.yml`
- CI: `.github/workflows/ci.yml`
- Crawler schedule/smoke: `.github/workflows/crawl.yml`

Перевір змінні/секрети:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (для crawler)

## 👤 Я користувач

Почни з **[README.md](README.md)**.

---

**Останнє оновлення: 2026-04-20**
