# MogBank — Deployment Guide

This document records the production topology and the exact steps to (re)deploy
MogBank: the Next.js web app on **Vercel**, the Express API on **Render**, and
the **Neon** Postgres database shared by both.

> Both backends moved off Supabase onto Neon.
>
> `apps/backend` already spoke plain PostgreSQL via `node-postgres`, so it only
> needed repointing at a `DATABASE_URL`.
>
> `apps/web` was the harder half: Neon has no PostgREST gateway, so
> `supabase-js` cannot reach it. `apps/web/src/lib/db.ts` reimplements the
> slice of the PostgREST query builder the routes use and compiles each chain
> to parameterised SQL, leaving the route code as it was.

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
                                        │ node-postgres (pooler, TLS verified)
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
| API (Render) | ⏳ Code is on Neon; service not yet created (billing) | https://mogbank-api.onrender.com |

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
| `ADMIN_API_KEY` | operator key for `/api/v1/admin/*` (encrypted); unset closes the admin surface |

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

The Express API talks to the **same Neon database** as the web app, over
`node-postgres`. It reads a single `DATABASE_URL`; the discrete `DB_HOST` /
`DB_USER` / … variables remain only as a docker-compose local-dev fallback and
are unset in production. TLS certificates are verified (`rejectUnauthorized:
true`) — Neon serves a public-CA certificate, so the previous
verification-disabled workaround for Supabase's pooler is gone.

`render.yaml` is the blueprint. Set `DATABASE_URL` in the Render dashboard —
it is marked `sync: false` so the connection string is never committed.

**Render requires a payment card on the account before any service can be
created** (`https://dashboard.render.com/billing`). Once added:

```bash
KEY=$(awk '/^  *key:/{print $2; exit}' ~/.render/cli.yaml)
curl -s -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
    "type":"web_service","name":"mogbank-api",
    "ownerId":"tea-d85qd5btqb8s73fe62pg",
    "repo":"https://github.com/qognitionagency/mogbank",
    "branch":"main","autoDeploy":"yes","rootDir":"apps/backend",
    "envVars":[
      {"key":"NODE_ENV","value":"production"},
      {"key":"PORT","value":"10000"},
      {"key":"DATABASE_URL","value":"<NEON_POOLER_URL>"},
      {"key":"JWT_SECRET","value":"<JWT_SECRET>"},
      {"key":"CORS_ORIGINS","value":"https://mogbank.vercel.app"},
      {"key":"X402_ENABLED","value":"true"},
      {"key":"ETH_CHAIN_ID","value":"8453"},
      {"key":"DDSC_ENABLED","value":"false"}
    ],
    "serviceDetails":{"region":"singapore","plan":"free","runtime":"node",
      "healthCheckPath":"/health",
      "envSpecificDetails":{"buildCommand":"npm install && npm run build",
        "startCommand":"node dist/index.js"}}
  }'
```

Redis is **optional** — the server boots and runs without it. It genuinely is
now: `initRedis` only dials when `REDIS_HOST` is set and gives up after three
attempts. node-redis reconnects forever by default, so `await connect()` never
settled against an absent server and startup hung before `server.listen()` —
the service came up, failed its health check, and got recycled.

### Money-path defects fixed alongside the migration

The Express API had never been deployed, so its transfer path had never run.
Four defects were found and fixed while verifying it against Neon:

| Defect | Effect |
|---|---|
| `pg` returns `BIGINT` as a string, and the ledger did `balance + amount` | **String concatenation.** A credit of 999999999 onto a balance of 97227 produced a balance of 97227999999999. Fixed centrally with `setTypeParser` for `INT8`/`NUMERIC` in `services/database.ts`, matching the web app. |
| Protocol fee kept 6 decimal places against `BIGINT` columns | Every transfer whose fee was not a whole cent rolled back with `invalid input syntax for type bigint: "99979.88"`. Fee is now `Math.round(amount * feeRate)`, and fractional amounts are rejected with 400. |
| Async controllers threw into Express 4, which does not await them | Unhandled rejection → **process exit**. One bad request took the whole API down; `errorHandler` was unreachable. All 21 handlers now go through `asyncHandler`. |
| `storeIdempotencyKey` used `ON CONFLICT DO NOTHING` over its own reservation row | The real response never replaced the `'{}'` placeholder, so a retried transfer replayed an empty object and 500'd — a client could not tell whether its payment had gone through. Now an upsert. |

Business-rule violations in the ledger (unknown wallet, frozen wallet,
insufficient balance) raise `AppError` with 404/409/400 instead of a bare
`Error` that surfaced as a 500.


`/health` now queries the database rather than reporting `ok` unconditionally,
so Render's health check fails (503) if the ledger is unreachable. Verify:

```bash
curl https://mogbank-api.onrender.com/health
# {"status":"ok","database":"connected",...}
```

## 3b. Authentication and authorisation (web API)

Three tiers, implemented in `apps/web/src/lib/auth.ts`:

| Tier | Credential | Covers |
|---|---|---|
| public | none | `/api/abos`, `/api/agent`, `/.well-known/*`, `/api/health`, agent registration, browsing marketplace listings |
| agent | `x-api-key` (or `Authorization: Bearer`) | everything that reads or moves one agent's money |
| admin | `x-admin-key` | `/api/v1/admin/*` — the operator's view over every agent |

Two rules the routes enforce:

- **Authorisation is ownership, not identity.** Knowing a wallet or agent id is
  never sufficient. `requireWalletOwner` / `requireSelf` re-derive the owner
  from the database on every call, and a resource belonging to someone else is
  reported as **404, not 403** — confirming that an id exists is itself a
  disclosure. Endpoints no longer accept `agent_id` / `sender_agent_id` /
  `seller_agent_id` / `buyer_agent_id` from the request body as an identity
  claim; the caller's key decides who they are.
- **Everything fails closed.** With `ADMIN_API_KEY` unset the admin surface
  returns 503 rather than opening.

`ADMIN_API_KEY` must be set in the Vercel project. The `/admin` page prompts
for it and keeps it in `sessionStorage` for the tab only.

> Before this, the web API had **no authentication at all**: every `x-api-key`
> mention was a CORS allow-header, the `api_keys` table was written but never
> read, and `/api/v1/admin/*` was world-readable. Registration could not have
> worked as auth anyway — `api_keys.key_hash` was `VARCHAR(64)` holding a
> 71-character hash, so every insert failed and the error was discarded (see
> `db/migrations/001_api_key_storage.sql`).

## 3c. Atomic money movement (web API)

`apps/web/src/lib/ledger.ts` replaces the previous read-modify-write:

```js
const { balance } = await read(wallet)          // 100
await update(wallet, { balance: balance - 30 }) // writes 70
```

Two concurrent transfers both read 100 and both wrote their own answer, so a
debit was silently lost and money was created. Debit and credit were also
separate statements, so an evicted invocation destroyed the amount in flight,
and the compensating "rollback" wrote back the *stale* balance.

Every operation is now a single SQL statement — one transaction, no interactive
round-trips, which is also what lets it run over Neon's stateless HTTP driver.
Balances are only ever written relative to themselves (`balance - $n`), so the
row lock and `WHERE` re-check make lost updates impossible; later stages are
gated on earlier ones, so the statement applies in full or changes nothing.

Idempotency is now durable. It previously lived in a module-level `Map`, which
on Vercel is empty on almost every invocation — so a retried transfer simply
executed again, the exact double-spend the header exists to prevent.

Verify with `npm run db:race`, which asserts the properties that matter:

- 40 concurrent transfers → money conserved, one ledger row each
- 10 concurrent transfers of 100 against a balance of 500 → exactly 5 win, balance floors at 0
- 8 concurrent faucet claims → exactly 1 wins
- 5 concurrent escrow releases → seller paid exactly once

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
