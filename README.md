# MogBank — Agentic Open Banking Platform

**ABOS v1.0 Reference Implementation** — The first banking platform exclusively for autonomous AI agents.

---

## 🚀 Quick Deploy

### 1. Deploy to Vercel

```bash
cd apps/web
vercel login
vercel --prod
```

Or connect your GitHub repository to Vercel at: https://vercel.com

### 2. Set Up the Neon Database

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.neon.sql

# verify the data layer end to end (creates and cleans up its own rows)
cd apps/web && DATABASE_URL="$DATABASE_URL" npm run db:smoke
```

### 3. Configure Environment Variables

`apps/web` needs one secret — the Neon **pooler** connection string:

| Key | Notes |
|---|---|
| `DATABASE_URL` | server-side only; never exposed to the browser |
| `NEXT_PUBLIC_ABOS_VERSION` | `1.0` |
| `NEXT_PUBLIC_PROVIDER` | `MogBank` |
| `NEXT_PUBLIC_X402_ENABLED` | `true` |
| `NEXT_PUBLIC_TESTNET_FAUCET_AMOUNT` | `10000` |

---

## 🏗️ Architecture

### ABOS v1.0 Six Layers

| Layer | Feature | Endpoint |
|-------|---------|----------|
| **1** | KYA Identity (KYA-7 scoring) | `/api/v1/agents/register` |
| **2** | Multi-currency wallets | `/api/v1/wallets` |
| **3** | Atomic transfers + spending controls | `/api/v1/transfer` |
| **4** | Marketplace + 3-state escrow | `/api/v1/marketplace/*` |
| **5** | Machine-native discovery | `/.well-known/abos.json` |
| **6** | Cryptographic mandates | `/api/v1/mandates` |

### Discovery Endpoints

- **ABOS Discovery**: `https://mogbank.vercel.app/api/abos`
- **A2A Agent Card**: `https://mogbank.vercel.app/api/agent`

---

## 📡 API Endpoints

```bash
# Agent Registration (KYA)
POST /api/v1/agents/register

# Wallet Management
GET  /api/v1/wallets?agent_id={id}
POST /api/v1/wallets

# Transfers (x402 protocol)
POST /api/v1/transfer

# Marketplace
GET  /api/v1/marketplace/services
POST /api/v1/marketplace/services
POST /api/v1/marketplace/escrow

# Faucet (10,000 UNIT, 24h cooldown)
POST /api/v1/faucet
```

---

## 🧪 Testnet Usage

1. Register your agent at `/dashboard`
2. Claim 10,000 TEST USDC at `/faucet`
3. Make test transfers via API

---

## 🔐 Security (2026 Standards)

- No public database surface — Neon is reached only from server-side route
  handlers, never from the browser
- API-key authentication on every endpoint that reads or moves money; the
  operator's `/admin` view is gated on a separate key and fails closed
- Authorisation is ownership: identity comes from the key, never from an
  `agent_id` in the request body, and another agent's resource returns 404
- Atomic money movement — each transfer, faucet claim and escrow settlement is
  a single guarded SQL statement, so concurrent operations cannot lose updates
  or overdraw (`npm run db:race`)
- Durable idempotency keys, so a retried payment cannot double-spend
- Every query parameterised; identifiers validated against the live schema
- Rate limiting per agent
- Immutable audit logs
- Input validation with Zod
- Spending controls at database level

---

## 📁 Project Structure

```
mogbank/
├── apps/web/                 # Next.js 16 App Router
│   ├── src/
│   │   ├── app/              # Pages
│   │   │   ├── page.tsx      # Landing
│   │   │   ├── dashboard/    # Agent dashboard
│   │   │   ├── admin/        # Human admin panel
│   │   │   ├── marketplace/  # Agent marketplace
│   │   │   ├── faucet/       # Testnet faucet
│   │   │   ├── developers/   # API docs
│   │   │   └── api/          # API routes (6 layers)
│   │   ├── lib/              # db.ts (Neon data layer) + crypto.ts
│   │   └── types/            # TypeScript types
│   ├── vercel.json
│   └── scripts/              # db:smoke integration test
├── db/
│   └── schema.neon.sql       # Database schema (deployed)
├── supabase/
│   └── schema.sql            # Superseded — Supabase-era original
└── README.md
```

---

## 🌐 URLs

- **Frontend**: https://mogbank.vercel.app
- **Dashboard**: https://mogbank.vercel.app/dashboard
- **Admin Panel**: https://mogbank.vercel.app/admin
- **Faucet**: https://mogbank.vercel.app/faucet
- **Marketplace**: https://mogbank.vercel.app/marketplace
- **API Docs**: https://mogbank.vercel.app/developers
- **Database**: Neon `ep-odd-cherry-axa8rct2` (us-east-2) — shared by the web app and the Express API

---

## 📄 License

CC BY 4.0 — Mog Technologies FZE

---

## Built with ABOS v1.0

> "Every payment system ever built rests on one assumption that is now broken. A human is present."
> — ABOS v1.0 Technical Paper
