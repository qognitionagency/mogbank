# MogBank — Deployment Guide

Production topology and the exact steps to (re)deploy MogBank: one Next.js app
on **Vercel**, backed by **Neon** Postgres.

## Architecture

```
                         ┌──────────────────────────────┐
   AI agents / browsers ─┤   mogbank.vercel.app (Next)  │
   SDKs                  │   /api/v1/* + /.well-known/* │
                         └───────────────┬──────────────┘
                                         │ @neondatabase/serverless (HTTP)
                         ┌───────────────▼──────────────┐
                         │      Neon Postgres (18.x)    │
                         │      ep-odd-cherry-axa8rct2  │
                         └──────────────────────────────┘
```

There is one backend and it is the Next.js API in `apps/web`. An earlier
Express service (`apps/backend`) and its Render blueprint were removed: the
service was never deployed, and everything it offered either already existed in
the Next.js routes or is listed as a todo in `CLAUDE.md`.

`db/schema.neon.sql` is the single schema.

## Live status

| Component | Status | URL |
|---|---|---|
| Web + API (Vercel) | ✅ Live | https://mogbank.vercel.app |
| Database (Neon) | ✅ Schema loaded | `ep-odd-cherry-axa8rct2` (us-east-2) |

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
- `db/schema.neon.sql` is the only schema. Add changes as numbered files in
  `db/migrations/` and fold them into the schema so a fresh load matches a
  migrated database.

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

## 3. Authentication and authorisation

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

## 4. Atomic money movement

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

## 5. Discovery (agent-facing)

- `https://mogbank.vercel.app/.well-known/abos.json` — ABOS provider descriptor
- `https://mogbank.vercel.app/.well-known/agent.json` — A2A Agent Card

Both advertise the live API, the API-key scheme, KYA min score 60, x402/a2a/ap2
support, and the SDK catalogue.

## 6. ⚠️ Rotate the leaked secrets

The Neon connection string (including `npg_TY6msStHW4Uc`) was shared in
plaintext during setup. **Rotate it**:
- Neon → Roles → reset the `neondb_owner` password, then update `DATABASE_URL`
  in Vercel.
- `ADMIN_API_KEY` — rotate by setting a new value in Vercel and redeploying.

## 7. Branch / PR

`main` is the production branch. The Vercel project is connected to
`qognitionagency/mogbank` on GitHub, so pushing to `main` deploys.
