# MogBank — Deployment Guide

This document records the production topology and the exact steps to (re)deploy
MogBank: the Next.js web app on **Vercel**, the Express API on **Render**, and
the **Neon** Postgres database shared by both.

> The web app moved off Supabase onto Neon. Neon is plain PostgreSQL with no
> PostgREST gateway, so `supabase-js` cannot reach it; `apps/web/src/lib/db.ts`
> reimplements the slice of the PostgREST query builder the routes use and
> compiles each chain to parameterised SQL. Route code was left as it was.

## Architecture

```
                         ┌────────────────────────────┐
   AI agents / browsers ─┤  mogbank.vercel.app (Next)  │  self-sufficient:
                         │  /api/v1/* + /.well-known/*  │  its own API hits
                         └──────────────┬──────────────┘  Neon directly
                                        │ @neondatabase/serverless (HTTP)
                         ┌──────────────▼──────────────┐
                         │     Neon Postgres (18.x)     │  single shared DB
                         │  ep-odd-cherry-axa8rct2      │  schema: db/schema.neon.sql
                         └──────────────▲──────────────┘
                                        │ node-postgres (Session Pooler, SSL)
                         ┌──────────────┴──────────────┐
   AI agents / SDKs ─────┤  mogbank-api.onrender.com    │  dedicated public API
                         │  Express + WS/SSE + x402     │  (REST mirror + streams)
                         └──────────────────────────────┘
```

Both backends are reconciled against **one** schema. `db/schema.neon.sql` is the
live one (generated from `supabase/schema.sql`, minus the RLS policies and
`service_role` grants, which are Supabase-only constructs). The
web app records its ledger on the `transactions` table (via the `ledger_entry`
discriminator); the Express API uses dedicated `ledger_entries` +
`idempotency_keys` + `marketplace_services` + `escrow` tables. The schema is a
superset of both.

## Live status (as of this deploy)

| Component | Status | URL |
|---|---|---|
| Web (Vercel) | ✅ Live | https://mogbank.vercel.app |
| Database (Neon) | ✅ Schema loaded, empty | `ep-odd-cherry-axa8rct2` (us-east-2) |
| API (Render) | ⏳ Still points at Supabase — see §3 | https://mogbank-api.onrender.com |

## 1. Database (Neon)

The schema is **destructive/re-runnable** (drops then recreates all tables).

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.neon.sql
```

Verify the data layer against the live database — this exercises every query
shape the API routes use (embeds, `text[]`, `jsonb`, bigint arithmetic,
`.single()` semantics, RPC) and cleans up after itself:

```bash
cd apps/web && DATABASE_URL="$DATABASE_URL" npm run db:smoke
```

Notes:
- Use the **pooler** host (`…-pooler.…neon.tech`) everywhere. Serverless
  functions open a connection per invocation; the pooler is what makes that
  affordable.
- `db/schema.neon.sql` is generated from `supabase/schema.sql`. If you change
  one, regenerate the other — `supabase/schema.sql` is kept only as the record
  of the original Supabase-era schema and is no longer deployed.

## 2. Web (Vercel)

Project: `qognitionagencys-projects/mogbank` — this is the project that owns
`mogbank.vercel.app`. It must be configured with:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Build / Install / Output | unset (framework defaults) |

Getting either of the first two wrong is what produced the site-wide 404s: with
no root directory and preset "Other", Vercel served the repo root as static
files and never built the app.

Environment variables (Production, Preview, Development):

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooler** connection string (encrypted) |
| `NEXT_PUBLIC_ABOS_VERSION` | `1.0` |
| `NEXT_PUBLIC_PROVIDER` | `MogBank` |
| `NEXT_PUBLIC_X402_ENABLED` | `true` |
| `NEXT_PUBLIC_TESTNET_FAUCET_AMOUNT` | `10000` |

Deploy (from `apps/web`, CLI already authed):

```bash
cd apps/web
vercel --prod --yes
```

The project is also connected to `qognitionagency/mogbank` on GitHub with
production branch `main`, so pushing to `main` deploys as well.

`apps/web/vercel.json` no longer uses legacy `@secret` references — env vars live
in project settings. Its CSP `connect-src` is `'self'` only: the browser never
talks to the database, the API routes do.

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

The Neon connection string (including `npg_TY6msStHW4Uc`) and the old Supabase
service-role key were shared in plaintext during setup. After confirming the
deploy, **rotate them**:
- Neon → Roles → reset the `neondb_owner` password, then update `DATABASE_URL`
  in Vercel (and Render, once §3 is migrated).
- Supabase → the old project's service-role key, if that project still exists.
  It has been removed from the Vercel project's environment either way.

## 6. Branch / PR

Changes are on `deploy/mogbank-reconcile` (origin/main is untouched). Open a PR
to merge into `main` when ready; Render `autoDeploy` will then track whichever
branch the service points at.
