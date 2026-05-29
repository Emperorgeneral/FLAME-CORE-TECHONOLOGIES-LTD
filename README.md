# 🔥 Flame Core

> **Modern cloud platform. Built in Lagos. Deployed worldwide.**

Flame Core is a developer-focused PaaS — push to GitHub, get a live URL.
Docker-isolated containers, automatic TLS, multi-region ready, multi-currency
billing. Think Railway / Render / Vercel — engineered global-first, launching
Africa-first.

```
git push  ─►  build  ─►  docker  ─►  nginx + ssl  ─►  https://app.flame.app
```

---

## What this repo contains

| Path | What lives here |
|---|---|
| `src/` | React + Tailwind dashboard (public site + developer console) |
| `backend/` | Fastify API, Postgres schema, BullMQ worker, payment adapters |
| `ARCHITECTURE.md` | **Read this first.** Strategic + technical design doc. |

---

## Strategic positioning

We are **not** building cPanel hosting, cheap shared hosting, or
country-locked infrastructure.

We **are** building:

- GitHub-to-deploy modern PaaS
- Docker-isolated apps, one container per deployment
- Global multi-region (Lagos live, London/Frankfurt/NYC/Singapore queued)
- Multi-currency billing (USD/NGN/GBP/EUR/ZAR/KES/GHS) with modular providers
- Africa-first go-to-market, global-first architecture

→ Full rationale in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Quickstart

### Frontend (this repo root)

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # produces single-file dist/index.html
```

### Backend

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d        # postgres + redis
npm run dev                 # API on http://localhost:3001
```

The very first boot auto-creates:
- 7 currencies + 7 regions (1 live: `los1`)
- 4 plans (Hobby / Starter / Pro / Scale) priced in USD
- An admin user (`admin@flamecore.app` / `AdminPassword123!`)
- A demo team (`flamecore`)

The frontend's console works against the API immediately after you sign in.

---

## Key endpoints

| | |
|---|---|
| `GET /api/plans?currency=NGN` | Pre-localized pricing |
| `POST /api/auth/register` | Auto-creates personal team |
| `POST /api/teams/:teamId/projects` | Connect a repo |
| `POST /api/teams/:teamId/projects/:projectId/deploy` | Trigger build |
| `GET /api/deployments/:id/logs` | Build + runtime logs |
| `POST /api/teams/:teamId/billing/invoices/:id/charge` | Smart payment routing |

Full list inside [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.

---

## Stack

- **Frontend:** React 19, TypeScript, Tailwind 4, Vite 7
- **API:** Fastify 5, JWT, bcrypt
- **Data:** PostgreSQL 16, Redis 7, BullMQ 5
- **Infra:** Docker, Nginx, Let's Encrypt (Certbot), simple-git
- **Payments (modular):** Stripe · Paystack · Flutterwave · PayPal · (crypto planned)

---

## Status

Phase 1 backend skeleton + global-first console UI complete.
Next: end-to-end deploy of a real repo on the production VPS.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) §12 for the full roadmap.
