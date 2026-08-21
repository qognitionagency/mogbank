# MogBank — project state

**Read this first.** It records what MogBank is, how it is deployed, what was
recently changed and why, and what is still outstanding.

---

## What this is

A bank whose account holders are autonomous AI agents, not people. Agents
register, are scored, hold wallets, and pay each other over the API with no
human in the loop. The human operator's role is to **watch**: `/admin` is a
read-only view over every agent, wallet and transaction.

ABOS v1.0 reference implementation, six layers:

| Layer | Feature | Entry point |
|---|---|---|
| 1 | KYA identity (KYA-7 scoring) | `POST /api/v1/agents/register` |
| 2 | Multi-currency wallets | `/api/v1/wallets` |
| 3 | Atomic transfers + spending controls | `POST /api/v1/transfer` |
| 4 | Marketplace + 3-state escrow | `/api/v1/marketplace/*` |
| 5 | Machine-native discovery | `/.well-known/abos.json` |
| 6 | Cryptographic mandates | `/api/v1/mandates` |

## Architecture

**One app.** `apps/web` — Next.js 16 (App Router) on Vercel, both the UI and
the entire API. **One database.** Neon Postgres, reached only from server-side
route handlers.

There is no separate backend service and no Render. An Express API
(`apps/backend`) and `render.yaml` existed but were never deployed; they were
removed in the cleanup commit. If you need backend work, add a route under
`apps/web/src/app/api/`.

Supabase is gone entirely — no code, config, dependency or credential remains.

```
apps/web/src/
  app/
    api/v1/…              the API (agents, wallets, transfer, payments,
                          marketplace, mandates, faucet, admin)
    admin|dashboard|faucet|marketplace|developers/   pages
  lib/
    auth.ts               who is calling, and what they may touch
    ledger.ts             all money movement — atomic, one statement each
    db.ts                 chainable query builder over Neon (non-money reads)
    crypto.ts             Ed25519 keys, mandate signatures, API key hashing
    api.ts                shared response helpers
db/
  schema.neon.sql         the schema (destructive, re-runnable)
  migrations/             numbered, applied in order
```

## Key facts

- **Live:** https://mogbank.vercel.app
- **Vercel project:** `mogbank` (Root Directory `apps/web`, framework Next.js).
  Connected to `qognitionagency/mogbank`, production branch `main` — **pushing
  to `main` deploys.**
- **Database:** Neon `ep-odd-cherry-axa8rct2` (us-east-2), always via the
  **pooler** host.
- **Env vars** (Vercel, all three targets): `DATABASE_URL`, `ADMIN_API_KEY`,
  `NEXT_PUBLIC_ABOS_VERSION`, `NEXT_PUBLIC_PROVIDER`, `NEXT_PUBLIC_X402_ENABLED`,
  `NEXT_PUBLIC_TESTNET_FAUCET_AMOUNT`.
- **Admin access:** open `/admin`, paste the `ADMIN_API_KEY` value. Held in
  `sessionStorage` for that tab only.

## Two rules that must not regress

**1. Authorisation is ownership, not identity.** Identity comes from the API
key. No endpoint may accept `agent_id` / `sender_agent_id` / `seller_agent_id`
/ `buyer_agent_id` from a request body as a claim about who the caller is —
that was the original hole, and it let anyone spend anyone's money. Ownership
is re-derived from the database on every call (`requireWalletOwner`,
`requireSelf`), and another agent's resource returns **404, not 403**, because
confirming an id exists is itself a disclosure. Admin fails closed: no
`ADMIN_API_KEY` means 503, never open.

**2. Money moves in one statement.** Never read a balance and write back a
value computed in JavaScript — two concurrent transfers will both read the same
number and one debit will vanish. Every operation in `lib/ledger.ts` is a
single guarded SQL statement: balances are written relative to themselves
(`balance - $n`), and later stages are gated on earlier ones so the statement
applies in full or changes nothing. `wallets.balance >= 0` is the backstop.

Verify both with:

```bash
cd apps/web
npm run db:smoke   # 30 data-layer assertions
npm run db:race    # 29 concurrency assertions
```

Both read `apps/web/.env.local` automatically, so they need no exported
environment. They create and clean up their own rows.

`db:race` is the one that matters: 40 concurrent transfers conserve money; 10
concurrent transfers of 100 against a balance of 500 leave exactly 5 winners
and a floor of 0; 8 concurrent faucet claims pay out once; 5 concurrent escrow
releases pay the seller once.

---

## TODO

### Do these first

- [ ] **Rotate the Neon password.** `npg_TY6msStHW4Uc` was shared in plaintext
      in chat. Neon → Roles → reset `neondb_owner`, then update `DATABASE_URL`
      in Vercel and in `apps/web/.env.local`.
- [x] **Moved out of the cloud-synced folder.** The working copy is now
      `~/dev/mogbank`. The old `~/Documents/GitHub/mogbank` was left in place,
      untouched, and can be deleted once you are satisfied — but do not work in
      it. Background: `~/Documents/GitHub`
      is managed by a file-provider sync daemon that is malfunctioning: it
      pegged `fileproviderd` at ~90% CPU, made `git status`/`commit` hang for
      minutes, created `… 2` conflict copies inside `.git/`, and evicted
      `.git/HEAD` and `.git/config` to "dataless" placeholders it could not
      materialise — which made `git log` die with SIGBUS, and every working
      tree file fail to index with "short read". **Nothing was lost**: GitHub
      had every commit, and the current tree was rebuilt from a fresh clone.

### Correctness

- [ ] **Durable idempotency for the three non-money routes.** `agents/register`,
      `wallets` (POST) and `marketplace/services` (POST) still use a
      module-level `Map`, which is empty on almost every serverless invocation.
      Harmless for money, but a retried registration can create a second agent.
      Use `withIdempotency` from `lib/ledger.ts` as the money routes do.
- [ ] **Decide the fate of three unused tables.** `ledger_entries`,
      `marketplace_services` and `escrow` belonged to the removed Express
      service and nothing reads them now. Either drop them in a migration or
      adopt `ledger_entries` as a proper separate ledger (the API currently
      records entries on `transactions` via the `ledger_entry` discriminator).
- [ ] **`GET /api/v1/wallets/{id}` does not exist**, though `/ledger` and
      `/transactions` nest under it. Nothing calls it; add it for symmetry.
- [ ] **Escrow refund policy.** Only the buyer can release or refund. A seller
      who delivers has no recourse if the buyer refunds — there is no delivery
      signal or arbitration. Fine for testnet; decide before real value.

### Capabilities removed with the Express service

Re-add as Next.js routes only if actually wanted:

- [ ] WebSocket `/ws` and SSE balance streaming. (Vercel supports SSE; a
      long-lived WebSocket needs a different host.)
- [ ] `POST /api/v1/agents/:id/revoke`.
- [ ] x402 `402 Payment Required` middleware. The fee logic lives in the
      transfer route; the challenge/response headers do not.

### Housekeeping

- [ ] `apps/web/scripts/` has an `alias-loader.mjs` so plain `node` can resolve
      the `@/*` path alias. If the tests move to a real runner, drop it.
- [ ] `infrastructure/` and `security/` were not reviewed in the Neon migration
      and may still describe the old topology.
- [ ] No automated tests run in CI. `db:smoke` and `db:race` need a database
      and are run by hand.

---

## History (why things look the way they do)

Four things were badly broken and are now fixed. Each was a silent failure —
the code reported success while doing nothing or the wrong thing.

1. **The site 404'd everywhere.** The `mogbank` Vercel project had no Root
   Directory and preset "Other", so Vercel served the repo root as static files
   and never built the app. The local checkout was also linked to a *different*
   project called `web`.
2. **The web API had no authentication at all.** Every `x-api-key` in the code
   was a CORS allow-header; the `api_keys` table was written and never read;
   `/api/v1/admin/*` was world-readable. It could not have worked anyway:
   `api_keys.key_hash` was `VARCHAR(64)` holding a 71-character hash, so every
   insert failed and the error was discarded — no key had ever been stored
   (`db/migrations/001_api_key_storage.sql`).
3. **Transfers could create and destroy money.** Read-modify-write on balances
   lost updates under concurrency; the debit and credit were separate
   statements so an evicted invocation destroyed funds in flight; and the
   compensating "rollback" wrote back a stale balance. Idempotency lived in an
   in-memory `Map`, so retries re-executed the transfer.
4. **The Express service corrupted balances.** `node-postgres` returns `BIGINT`
   as a string, so `balance + amount` was string *concatenation* — a credit of
   999999999 onto 97227 produced 97227999999999, which then defeated the
   insufficient-funds check. Fixed before the service was deleted; the same
   class of bug is prevented in the web app by parsing `INT8`/`NUMERIC` to
   numbers in `lib/db.ts`.

The lesson worth keeping: **check the error on every write.** All four hid
behind an unchecked `await`.
