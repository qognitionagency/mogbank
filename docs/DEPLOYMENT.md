# MogBank — Deployment Guide

This document records the production topology and the exact steps to (re)deploy
MogBank: the Next.js web app on **Vercel**, the Express API on **Render**, and
the **Supabase** Postgres database shared by both.

## Architecture

```
                         ┌────────────────────────────┐
   AI agents / browsers ─┤  mogbank.vercel.app (Next)  │  self-sufficient:
                         │  /api/v1/* + /.well-known/*  │  its own API hits
                         └──────────────┬──────────────┘  Supabase directly
                                        │ supabase-js (service role)
                         ┌──────────────▼──────────────┐
                         │   Supabase Postgres (17.x)   │  single shared DB
                         │   project: mureitfujzcabl…   │  schema: supabase/schema.sql
                         └──────────────▲──────────────┘
                                        │ node-postgres (Session Pooler, SSL)
                         ┌──────────────┴──────────────┐
   AI agents / SDKs ─────┤  mogbank-api.onrender.com    │  dedicated public API
                         │  Express + WS/SSE + x402     │  (REST mirror + streams)
                         └──────────────────────────────┘
```

Both backends are reconciled against **one** schema (`supabase/schema.sql`). The
web app records its ledger on the `transactions` table (via the `ledger_entry`
discriminator); the Express API uses dedicated `ledger_entries` +
`idempotency_keys` + `marketplace_services` + `escrow` tables. The schema is a
superset of both.

## Live status (as of this deploy)

| Component | Status | URL |
|---|---|---|
| Web (Vercel) | ✅ Live | https://mogbank.vercel.app |
| Database (Supabase) | ✅ Schema loaded + seeded (55 agents, 250 tx) | project `mureitfujzcablshzizv` |
| API (Render) | ⏳ Blocked on Render billing (see below) | https://mogbank-api.onrender.com |

## 1. Database (Supabase)

The schema is **destructive/re-runnable** (drops then recreates all tables).
There is no `psql`/`supabase` CLI requirement — load it with Node + `pg`:

```bash
# from repo root; pg is available under apps/backend/node_modules
NODE_PATH="apps/backend/node_modules" \
  DB_HOST="db.mureitfujzcablshzizv.supabase.co" \
  DB_PASSWORD='<DB_PASSWORD>' \
  node scripts/db-load.js

# optional demo data
NODE_PATH="apps/web/node_modules" \
  SUPABASE_URL="https://mureitfujzcablshzizv.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>" \
  node scripts/seed.js
```

Notes:
- The **direct** host `db.<ref>.supabase.co` is IPv6-only. It works from most
  laptops but **not from Render** (no outbound IPv6). Render must use the
  **Session Pooler** (IPv4): `aws-1-ap-south-1.pooler.supabase.com`, user
  `postgres.mureitfujzcablshzizv`, port `5432`, `sslmode=require`.

## 2. Web (Vercel)

Project: `qognitionagencys-projects/web` (root directory = `apps/web`).

Environment variables (Production):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mureitfujzcablshzizv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_…` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_…` key (sensitive) |

Deploy (from `apps/web`, CLI already authed):

```bash
cd apps/web
vercel --prod --yes
vercel alias set <deployment-url> mogbank.vercel.app
```

`apps/web/vercel.json` no longer uses legacy `@secret` references — env vars live
in project settings.

## 3. API (Render)

`render.yaml` is a blueprint, but the service can also be created via the API.
**Render requires a payment card on the account before any service can be
created** (`https://dashboard.render.com/billing`). Once added, create it:

```bash
KEY=$(awk '/^  *key:/{print $2; exit}' ~/.render/cli.yaml)
curl -s -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
    "type":"web_service","name":"mogbank-api",
    "ownerId":"tea-d85qd5btqb8s73fe62pg",
    "repo":"https://github.com/qognitionagency/mogbank",
    "branch":"deploy/mogbank-reconcile","autoDeploy":"yes","rootDir":"",
    "envVars":[
      {"key":"NODE_ENV","value":"production"},
      {"key":"PORT","value":"3001"},
      {"key":"DB_HOST","value":"aws-1-ap-south-1.pooler.supabase.com"},
      {"key":"DB_PORT","value":"5432"},
      {"key":"DB_NAME","value":"postgres"},
      {"key":"DB_USER","value":"postgres.mureitfujzcablshzizv"},
      {"key":"DB_PASSWORD","value":"<DB_PASSWORD>"},
      {"key":"DB_SSL","value":"true"},
      {"key":"CORS_ORIGINS","value":"https://mogbank.vercel.app"},
      {"key":"X402_ENABLED","value":"true"},
      {"key":"ETH_CHAIN_ID","value":"8453"},
      {"key":"DDSC_ENABLED","value":"false"}
    ],
    "serviceDetails":{"region":"singapore","plan":"starter","runtime":"docker",
      "healthCheckPath":"/health",
      "envSpecificDetails":{"dockerfilePath":"./apps/backend/Dockerfile","dockerContext":"."}}
  }'
```

Redis is **optional** — the server boots and runs without it.

Verify: `curl https://mogbank-api.onrender.com/health` → `{"status":"ok",...}`.

## 4. Discovery (agent-facing)

- `https://mogbank.vercel.app/.well-known/abos.json` — ABOS provider descriptor
- `https://mogbank.vercel.app/.well-known/agent.json` — A2A Agent Card

Both advertise the live web API and the dedicated Render API, KYA min score 60,
x402/a2a/ap2 support, and the SDK/skill catalog.

## 5. ⚠️ Rotate the leaked secrets

The database password and service-role/secret keys were shared in plaintext
during setup. After confirming the deploy, **rotate them** in Supabase:
- Settings → Database → Reset database password (then update Vercel + Render env)
- Settings → API → roll the `service_role`/secret key (then update Vercel + Render)

## 6. Branch / PR

Changes are on `deploy/mogbank-reconcile` (origin/main is untouched). Open a PR
to merge into `main` when ready; Render `autoDeploy` will then track whichever
branch the service points at.
