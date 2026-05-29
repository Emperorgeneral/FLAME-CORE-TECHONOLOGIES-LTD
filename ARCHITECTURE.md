# Flame Core — Platform Architecture

> **Positioning:** A modern, developer-focused cloud platform.
> **Strategy:** Global-first infrastructure, Africa-first market entry.
>
> We're building Railway/Render/Vercel-class hosting — not cPanel,
> not budget shared hosting, not Nigeria-only infrastructure.
> Lagos is our launch region. The architecture supports the world.

---

## 1. Strategic principles

These rules govern every architectural decision:

| Principle | Concretely means |
|---|---|
| **Global-first infrastructure** | No NGN-only logic. No `*.flame.ng` URLs. No hardcoded country. |
| **Africa-first marketing** | Copy, brand, and case studies lean African. Code does not. |
| **Multi-tenant from day one** | Every resource belongs to a `team`, not a `user`. Solo users get an auto-created personal team. |
| **Multi-currency from day one** | Prices stored in USD; localized at read time. Accounting in USD. |
| **Multi-region ready** | Every resource has a `region`. Today only `los1` is live; the schema and dispatch logic don't change when we add more. |
| **Modular payment providers** | Provider-agnostic interface; adding Stripe/Paystack/Flutterwave/PayPal is one file each. |
| **Lightweight infrastructure** | Docker + Nginx + Postgres + Redis + BullMQ + Certbot. No K8s, no orchestrator, no CyberPanel — yet. |
| **Developer experience** | GitHub → deploy. CLI. Real logs. Predictable URLs. |

---

## 2. What we ARE / are NOT building

| ✅ We are building | ❌ We are NOT building |
|---|---|
| GitHub-to-deploy modern PaaS | Traditional cPanel hosting |
| Docker-based isolated apps | Cheap shared hosting |
| Multi-region cloud (one live today) | Nigeria-only hosting |
| Per-team isolation, audit logs | Single-server cPanel clone |
| Auto SSL + custom domains | Manual Apache configuration |
| Usage-based, multi-currency billing | Hand-managed invoicing |

---

## 3. System topology (current)

```
                              ┌──────────────────────────┐
                              │  Browser / CLI           │
                              │  - React dashboard       │
                              │  - flame CLI (npx)       │
                              └─────────────┬────────────┘
                                            │ HTTPS (JWT)
                              ┌─────────────▼────────────┐
                              │  Nginx (existing)        │
                              │  - terminates TLS        │
                              │  - reverse proxy → API   │
                              │  - reverse proxy → apps  │
                              └──┬────────────────────┬──┘
                                 │                    │
                  ┌──────────────▼──────┐  ┌──────────▼────────────┐
                  │ Flame Core API      │  │ Customer containers   │
                  │ (Fastify, Node 20)  │  │ - flame-<id>          │
                  │ - team-scoped       │  │ - port-mapped         │
                  │ - region-aware      │  │ - isolated networks   │
                  └──┬───────────┬──────┘  └───────────────────────┘
                     │           │                  ▲
                     │           │                  │ docker run
                     │           │                  │
        ┌────────────▼──┐  ┌─────▼─────┐   ┌────────┴────────┐
        │ PostgreSQL    │  │ Redis     │   │ BullMQ worker   │
        │ - users       │  │ - cache   │   │ - clone         │
        │ - teams       │  │ - queue   │   │ - build         │
        │ - projects    │  └───────────┘   │ - provision     │
        │ - deployments │                  │ - nginx + SSL   │
        │ - invoices    │                  └─────────────────┘
        │ - audit_logs  │
        └───────────────┘
```

**No CyberPanel. No cPanel. No K8s. No new Nginx install.** The platform
slots in next to the existing services on the VPS.

---

## 4. Data model (global-first)

All tables live in PostgreSQL and were designed so the schema **never has to
change** when we go multi-region or add new currencies/providers.

### Core tables

- **`currencies`** — `USD, NGN, GBP, EUR, ZAR, KES, GHS, …`. `fx_rate_to_usd` refreshed by a job.
- **`regions`** — `los1` (live), `lhr1`/`fra1` (soon), `nyc1`/`sin1`/`jnb1`/`nbo1` (planned). Each has a `status`, `capacity_pct`, and an `endpoint` (for future multi-VPS dispatch).
- **`users`** — includes `preferred_currency`, `preferred_region`, `locale`, `timezone`, plus GitHub/Google OAuth IDs.
- **`teams`** — every resource hangs off a team. Solo users get one auto-created personal team. Each team has a `billing_currency` and a `plan_id`.
- **`team_members`** — `owner | admin | member | viewer`.
- **`projects`** — team-scoped. Tracks `source` (`github | gitlab | bitbucket | cli | git_url`), `repo_url`, `primary_region`, `framework`, `autodeploy_enabled`, `webhook_secret`.
- **`deployments`** — region-tagged, with a status machine: `queued → cloning → building → pushing → provisioning → ready | failed | cancelled | stopped`. Tracks `commit_*`, `internal_port`, `container_id`, `deployment_url`, `build_logs`, `runtime_logs`, timings.
- **`domains`** — system + custom. Tracks `verification_method`, `ssl_status`, `ssl_provider` (`letsencrypt | cloudflare | custom`), `ssl_expires_at`.
- **`environment_variables`** — per-project, per-scope (`production | preview | development | all`). Stored encrypted.
- **`payment_methods`** — provider-agnostic (`provider` column + opaque IDs).
- **`invoices`** — `amount_minor` + `currency` AND `amount_usd_minor` + `fx_rate_at_issue` so accounting is currency-stable forever.
- **`api_keys`** — per-team, scoped permissions.
- **`webhooks`** — outbound webhooks for `deployment.*`, `invoice.*` events.
- **`audit_logs`** — every state-changing action.

### Why team-scoped

Solo today, teams tomorrow. By making **everything** team-scoped from day one,
we never need a painful "let's add multi-tenancy" migration. URLs become
`/api/teams/:teamId/projects/...` which is also nicer for the UI (org switcher).

### Why USD as base

Even when 95 % of customers pay in NGN, accounting in a single base currency:

- avoids drift when FX rates change between invoice and payment
- makes MRR/ARR reporting trivial
- means we can route to any provider in any currency without re-pricing

---

## 5. Region architecture

```
Single-VPS today (all roles on one box):
  los1 → Nginx + Postgres + Redis + API + Worker + Containers

Multi-VPS tomorrow (same code, different env):
  control plane (Nigeria)         data planes (per region)
  ┌─────────────────┐             ┌──────────────────────┐
  │ Postgres        │◄────────────┤ los1: API + worker   │
  │ Redis (queue)   │             │       Nginx + Docker │
  │ Admin/dashboard │             ├──────────────────────┤
  │                 │◄────────────┤ lhr1: API + worker   │
  │                 │             │       Nginx + Docker │
  └─────────────────┘             ├──────────────────────┤
                                  │ fra1: API + worker   │
                                  │       Nginx + Docker │
                                  └──────────────────────┘
```

Code-level enablers already in place:

- Every deployment row has a `region` column.
- The BullMQ worker reads `REGION_CODE` from env and only processes jobs for its region.
- `regionService.getDispatchEndpoint(code)` returns the per-region API URL when set (single-VPS: null, multi-VPS: the regional node's URL).
- `regionService.suggestRegion(countryCode)` picks the nearest live region for a new user based on geography.

---

## 6. Payment provider system

The most important piece for African market entry **and** global expansion.

### Adapter contract — `backend/src/payments/types.ts`

```ts
interface PaymentProviderAdapter {
  name: PaymentProvider
  supportedCurrencies: CurrencyCode[]
  charge(req: ChargeRequest): Promise<ChargeResult>
  refund(req: RefundRequest): Promise<RefundResult>
  verifyWebhook(rawBody, signature): Promise<WebhookVerification>
}
```

### Live adapters

| Provider | Supports | Best for |
|---|---|---|
| **Paystack** | NGN, GHS, KES, ZAR, USD | African card + bank + USSD + mobile money |
| **Flutterwave** | NGN, GHS, KES, ZAR, USD, GBP, EUR | African + intl. card |
| **Stripe** | USD, GBP, EUR, ZAR | US / EU / UK |
| **PayPal** | USD, GBP, EUR | Global fallback |
| **bank_transfer** | any | Manual, for enterprise |
| **crypto** | (planned) | Future |

### Routing — `backend/src/payments/registry.ts`

`paymentRegistry.pickFor(currency, countryCode)` returns the best provider:

1. African country → Paystack → Flutterwave → Stripe → PayPal
2. Otherwise → Stripe → Paystack → Flutterwave → PayPal

A provider is only considered if it's both configured (env vars present) **and** supports the requested currency. Adding a new provider is exactly two files: a new class in `/providers/` + one line in the registry constructor.

### Currency flow

```
plan.price_usd_monthly = 8.00
team.billing_currency  = NGN
                ↓ currencyService.convertUsdToMinor(8, 'NGN')
invoice.amount_minor       = 1,280,000  (₦12,800.00)
invoice.amount_usd_minor   = 800        ($8.00)
invoice.fx_rate_at_issue   = 1600
                ↓ billingService.chargeInvoice(...)
paymentRegistry.pickFor('NGN', 'NG') = Paystack
                ↓
Paystack returns checkout URL → user pays in Naira
                ↓
webhook verified → invoice.status = 'paid'
```

---

## 7. Deployment pipeline

When a developer clicks Deploy or pushes to GitHub:

```
1.  API creates deployment row (status = queued)
       deployment_url = <shortid>.flame.app
       region         = project.primary_region
       internal_port  = randomised (TODO: real allocator)

2.  enqueueDeployment(payload) → BullMQ → Redis
3.  Worker (matching REGION_CODE) picks up the job

   ─── pipeline ───
   ✓ git clone <repo> → /var/deployments/flame/<id>
   ✓ detect framework (Next, Express, Python, Go, Rust, Bun, Docker, …)
   ✓ generate Dockerfile if none provided
   ✓ docker build -t flame-<id>
   ✓ load env vars from DB (decrypt secrets)
   ✓ docker run -d -p <port>:3000 flame-<id>
   ✓ write Nginx site config → /etc/nginx/sites-available/
   ✓ symlink to sites-enabled, nginx -t, systemctl reload nginx
   ✓ certbot --nginx -d <deployment_url>   (Let's Encrypt)
   ✓ mark deployment ready

4.  Customer hits https://<shortid>.flame.app → live.
```

### Safety with existing services

- We only **add** Nginx site configs under `/etc/nginx/sites-available/`,
  never touch existing ones. Each filename is prefixed `flame-<id>`.
- Postgres is shared with existing databases — we just own the `flamecore` schema.
- Docker images are namespaced `flame-*` so we never collide.

---

## 8. API surface (selected)

| Verb | Path | Notes |
|---|---|---|
| GET  | `/api/health` | Public liveness probe + region/currency counts |
| GET  | `/api/currencies` | All active currencies + FX rates |
| GET  | `/api/regions` | All regions (live + soon + planned) |
| GET  | `/api/plans?currency=NGN` | Plans pre-localized to a currency |
| POST | `/api/auth/register` | Auto-creates personal team |
| POST | `/api/auth/login` | Returns user + team list + JWT |
| PATCH | `/api/auth/preferences` | Currency, region, locale, timezone |
| GET  | `/api/teams/:teamId/projects` | All team-scoped |
| POST | `/api/teams/:teamId/projects` | Create project from repo URL |
| POST | `/api/teams/:teamId/projects/:projectId/deploy` | Trigger deploy |
| GET  | `/api/teams/:teamId/projects/:projectId/env` | List env vars |
| POST | `/api/teams/:teamId/projects/:projectId/env` | Set env var |
| GET  | `/api/deployments/:id/logs` | Build + runtime logs |
| POST | `/api/deployments/:id/redeploy` | Clone & re-run pipeline |
| GET  | `/api/billing/options?currency=NGN&country=NG` | Available providers |
| POST | `/api/teams/:teamId/billing/invoices` | Issue invoice |
| POST | `/api/teams/:teamId/billing/invoices/:id/charge` | Smart provider routing |
| POST | `/api/billing/webhooks/:provider` | Inbound provider callbacks |
| GET  | `/api/admin/stats` | MRR (USD), users, deployments, regions |
| GET  | `/api/admin/revenue` | Breakdown by currency & provider |

---

## 9. Frontend product direction

The dashboard is positioned as a **developer console**, not a hosting control panel:

- Top nav: Platform · Pricing · **Regions** · Docs · Changelog
- Currency switcher in the status bar (USD by default; persisted)
- Hero: "Ship code. Not infrastructure." with a live build-log card
- Pricing page renders prices via `/api/plans?currency=...` — no client-side conversion
- Console tabs: **Deployments · Logs · Environment · Domains · Settings**
- Settings tab includes a region selector (live regions enabled, others greyed out with status badges)

The aesthetic — dark terminal + flame accent — stays. Copy is now framed as **modern African cloud platform**, not "Nigerian web hosting".

---

## 10. What this unlocks (without code changes)

Because of the new architecture, **the following ship-day features are already "free"**:

- Switch a customer's billing from NGN to USD: change one column.
- Add a Kenyan customer: they auto-default to `KES` + `los1` (nearest live region).
- Add a London region: insert one row in `regions` + spin up a worker with `REGION_CODE=lhr1`.
- Add Mercado Pago: drop one file in `payments/providers/` + add it to the registry.
- Switch a project to a different region: update `projects.primary_region` and redeploy.
- Multi-developer teams: invite via `team_members`, all existing endpoints already team-scoped.

---

## 11. What we deliberately did NOT do

These were explicitly rejected to keep the platform shippable:

- ❌ Kubernetes / Nomad / Swarm
- ❌ Multi-server orchestration (out of scope for MVP)
- ❌ CyberPanel / cPanel / DirectAdmin
- ❌ A new Nginx install (we reuse the existing one)
- ❌ Microservices split (single API service, single worker)
- ❌ Per-region databases (one Postgres for now; sharding later)

These are documented as future work — never as never.

---

## 12. Roadmap recap

**MVP (now):** one region, one VPS, one Postgres, one Redis. GitHub→Docker→Nginx→SSL pipeline working end-to-end.

**Phase 2:** GitHub OAuth + webhook autodeploy, preview environments per branch, real env-var encryption (AES-GCM + KMS), CLI (`npx @flamecore/cli`), real-time log streaming over SSE/WebSocket, Paystack + Stripe live.

**Phase 3:** Second region (lhr1 or fra1) running on a separate VPS. Per-region BullMQ queues. Cross-region failover. Usage-metered billing (CPU-seconds, egress GB).

**Phase 4:** Autoscaling per service, private networking between a team's services, web terminal, audit log streaming, SOC 2 prep.

---

**Status:** Phase 1 backend skeleton + console frontend complete.
**Next:** wire BullMQ to the real Docker engine, run the first end-to-end deploy on the VPS.
