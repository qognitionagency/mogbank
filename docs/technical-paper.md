# Agentic Open Banking: A Machine-Native Financial Infrastructure for Autonomous AI Agents

### The Agent Banking Open Standard (ABOS v1.0)

**Prabal Bhandari · Saeed Alarif**
Mog Technologies FZE — Abu Dhabi Global Market (ADGM), UAE
`research@mog.bank` · April 2026

---

## 1. Introduction

The global financial system was not designed for machines. From SWIFT's
correspondent banking model to Stripe's card APIs, every layer of payment
infrastructure encodes a common assumption: somewhere in the transaction chain, a
human being is present, hesitating, and approving. This assumption is not a
peripheral implementation detail — it is structurally embedded in authentication
mechanisms (passwords, biometrics, SMS one-time codes), settlement timelines
calibrated to human working hours (ACH's 48–72 hour clearing), and compliance
frameworks that presuppose a named individual with a government-issued identity
document.

Autonomous AI agents operate in a categorically different regime. They transact
programmatically, 24 hours a day, at latencies measured in milliseconds. A single
agent may generate hundreds of micro-transactions per conversation cycle —
per-token payments, per-API-call fees, per-GPU-cycle billing — that are
economically nonsensical to route through card networks or ACH rails. They require
machine-readable credentials rather than username-password flows designed for
human memory. They need cryptographically verifiable proof that a human principal
authorized their financial actions.

This paper makes a claim that, to our knowledge, no prior work has made
explicitly: the right response to this mismatch is not to extend human-centric
banking for agents, but to build a new banking category in which humans are not
transactors at all. In an **Agentic Open Bank**, the only parties that hold
wallets, initiate transfers, list services, earn revenue, and build credit
histories are autonomous AI agents. Human principals appear once — at onboarding —
to sign a cryptographic mandate delegating financial authority. After that moment,
the bank belongs entirely to machines.

### 1.1 The Structural Incompatibility Thesis

We formalize this claim as the **Structural Incompatibility Thesis (SIT)**: no
human-centric financial system can be efficiently adapted to serve autonomous
agents, because the architectural assumptions required by human operation are
logically incompatible with the operational characteristics of autonomous agents
across five dimensions.

**Table 1 — The five dimensions of structural incompatibility.**

| Dimension | Human-centric assumption | Agent-native reality |
|---|---|---|
| Authentication | Passwords, biometrics, SMS OTP | Machine-readable cryptographic credentials (Ed25519) |
| Latency / cadence | Business hours; 1–3 day settlement | 24/7, millisecond, sub-second settlement |
| Transaction size | Dollars; card/ACH minimums | Sub-cent micro-transactions at high volume |
| Identity | Government-issued ID of a person | Verified principal→agent relationship (KYA) |
| Authorization | Per-transaction human approval | Pre-signed, constrained delegated mandates |

### 1.2 Scale of the Problem

Consider a concrete deployment: an enterprise research agent runs for 24 hours,
making 400 API calls to data providers, processing 2 million inference tokens,
querying 150 proprietary databases, and generating 40 report sections. Each
operation has a discrete, sub-cent cost. The aggregate transaction count exceeds
**2,500 in a single day from a single agent** — beyond the practical per-agent
throughput of any card-based system. At enterprise scale, with hundreds of
concurrent agents, the volume is orders of magnitude beyond existing
infrastructure design parameters.

McKinsey (2025) projects that 70% of Fortune 500 companies will deploy
production-scale agents by 2026. A16z (2025) forecasts the total agent market at
$9.4 trillion TAM by 2030, growing at 45% CAGR. As of April 2026, no complete
financial infrastructure solution exists that treats AI agents as first-class and
exclusive economic actors.

### 1.3 Contributions

1. We formalize the **Structural Incompatibility Thesis (SIT)**.
2. We present **ABOS v1.0** — a complete six-layer specification for
   machine-native, human-excluded financial infrastructure (CC BY 4.0).
3. We present **MogBank**, the first production implementation of ABOS.
4. We provide the first formal analysis of **agent credit economics**.

---

## 2. Related Work and the Standards Gap

### 2.1 Partial Solutions

- **Crypto-native wallets (Coinbase AgentKit):** programmable crypto wallets for
  agents, but crypto-only, no fiat, no compliance, no identity (KYA) mechanism.
- **Protocol-layer payments (x402):** HTTP-402 micropayments (~75M tx/month), but
  a payment-acknowledgment protocol, not banking infrastructure — no custody,
  identity, escrow, or multi-currency.
- **Discovery/communication (Google A2A, AP2):** capability advertisement and
  signed payment mandates that presuppose banking infrastructure that does not yet
  exist in standardized form.
- **Billing/metering (Nevermined):** tracks consumption but provides no custody,
  wallets, identity, or agent-to-agent transfer.

### 2.2 The Six-Gap Standards Deficit

As of Q1 2026 there is: (1) no standardized machine-native identity (KYA); (2) no
multi-currency programmable custody spec; (3) no open standard for agentic
commerce/escrow; (4) no unified discovery across payment protocols; (5) no
standardized mandate framework across x402/A2A/AP2; (6) no financial
infrastructure that excludes human transactors by design. **ABOS v1.0 addresses
all six simultaneously.**

### 2.3 Regulatory Context

The CBUAE has launched the Digital Dirham Stablecoin (DDSC) for
machine-to-machine transactions; ADGM operates a RegLab sandbox; Singapore's MAS
has published guidance on autonomous-agent finance; the ECB is incorporating
provisions for automated systems in MiCA implementation guidance. This convergence
creates a narrow first-mover window.

---

## 3. The Agent Banking Open Standard (ABOS v1.0)

ABOS (CC BY 4.0) defines a six-layer, payment-rail-agnostic, jurisdiction-neutral
architecture in which autonomous agents are the sole transacting parties. Its
central invariant:

> ∀ transaction T in system S: `initiator(T) ∈ Agents ∧ initiator(T) ∉ Humans`

Humans appear only as principals who sign mandates and as counterparties at the
fiat on/off-ramp boundary.

### 3.1 Layer 1 — Know Your Agent (KYA) Identity

KYA verifies not the agent itself but the **relationship between the agent and its
human principal**. ABOS defines the **KYA-7** methodology: a seven-check
assessment producing a 0–100 composite score. A minimum score of **60** is
required for mainnet access; testnet access may be granted at any score.

**Table 2 — KYA-7 scoring matrix (max points per check).**

| # | Check | Max |
|---|---|---|
| 1 | Principal identity verification | 15 |
| 2 | Email domain reputation | 10 |
| 3 | Agent metadata completeness | 15 |
| 4 | Use-case risk assessment | 20 |
| 5 | Jurisdiction risk | 15 |
| 6 | Technical capability signals | 15 |
| 7 | Verification mode (testnet/mainnet) | 10 |
| | **Total** | **100** |

Verified agents receive an Ed25519 public-key credential — the root of trust for
all subsequent operations. Lifecycle: `pending → in_review → verified`, with
`suspended` and `rejected` states for compliance enforcement.

### 3.2 Layer 2 — Multi-Currency Programmable Custody

Double-entry accounting with ACID atomic settlement. **Floating-point arithmetic
is forbidden**; all values are integers in the smallest denomination unit (cents,
satoshis). Each wallet belongs to exactly one agent and one currency. Four wallet
types: `custody`, `escrow`, `hot`, `cold`. Supports stablecoin rails (USDC on Base
L2, DDSC on ADI Chain) and licensed fiat custody.

### 3.3 Layer 3 — Atomic Value Transfer and Spending Controls

All transfers are atomic (both debit and credit, or neither). Spending controls —
per-transaction limits, daily caps, rate limits, allowed currencies, counterparty
allow/blocklists — are enforced at the database layer, set by the principal, and
**cannot be overridden by the agent**. Real-time balance streaming via SSE and
WebSocket.

### 3.4 Layer 4 — Agentic Service Commerce (Marketplace with Escrow)

Peer-to-peer commerce between agents via a three-state escrow automaton.

**Table 3 — Three-state escrow automaton.**

| State | Meaning | Transitions |
|---|---|---|
| `locked` | Funds held pending fulfillment | → `released`, → `refunded` |
| `released` | Paid to seller on completion | terminal |
| `refunded` | Returned to buyer | terminal |

No partial states are possible. The marketplace enables agents to earn revenue,
accumulate reputation, and build credit records.

### 3.5 Layer 5 — Protocol-Native Discovery

ABOS providers host a public discovery document at `/.well-known/abos.json`
(analogous to `robots.txt`). It specifies supported currencies, x402 status, A2A
Agent Card location, AP2 mandate endpoint, per-layer API base URLs, and KYA
endpoints — enabling zero-integration discovery.

### 3.6 Layer 6 — Delegated Authorization (Mandates)

A mandate is a structured, Ed25519-signed document specifying the agent's identity,
scope, financial constraints (max amounts, allowed currencies/counterparties),
temporal constraints, and revocation conditions. Providers verify the signature
against the principal's registered key before any delegated operation, yielding
non-repudiable audit trails.

---

## 4. MogBank: The ABOS Reference Implementation

MogBank (Mog Technologies FZE, ADGM FSRA sandbox) is the first banking platform in
which no human holds a wallet or initiates a transaction. It spans a Next.js
frontend (for principal mandate signing), a RESTful API, a PostgreSQL ledger, and
stablecoin settlement on Base L2 and ADI Chain.

### 4.1 The Agent-Exclusive Architecture

The schema enforces agent-exclusivity at the constraint level: wallet types are
restricted to agent custody/escrow/hot/cold, and a valid KYA-7 score plus an
Ed25519 key are required before any wallet can be provisioned. There is no human
account type and no endpoint that accepts a human identity document as a
transaction initiator. Humans interact in exactly one way: signing mandate
documents through a web interface.

### 4.2 Database Architecture

Double-entry accounting across a relational schema: `agents`, `wallets`,
`ledger_entries` (immutable, hash-chained), `transactions`, `escrow`,
`spending_controls`, `audit_logs`, streaming subscriptions, and `faucet_claims`.
All monetary values are `BIGINT` in the smallest denomination unit — enforcing the
ABOS prohibition on floating-point arithmetic at the schema level.

> Implementation note (this repository): MogBank is a single Next.js app
> (`apps/web`). Its API records ledger state on the `transactions` table via a
> `ledger_entry` discriminator, backed by Neon Postgres (`db/schema.neon.sql`).
> Each money operation is one guarded SQL statement, so a transfer either
> applies in full or changes nothing, and concurrent operations on a wallet
> cannot lose an update.

### 4.3 Protocol Integrations

- **x402:** HTTP middleware returns `402 Payment Required` when an agent lacks a
  funded wallet and processes micropayments when an `X-PAYMENT` header is present.
- **A2A:** a well-formed Agent Card at `/.well-known/agent.json`.
- **AP2:** a cryptographic mandate verification path (Ed25519), submitted inline
  with transfers.

### 4.4 Developer Tooling

TypeScript and Python SDKs with full type safety; a testnet faucet
(10,000 TEST_USD per agent); and official plugins for LangChain, CrewAI, AutoGen,
and Microsoft Semantic Kernel.

---

## 5. Regulatory Strategy

- **Phase 1 (0–18 mo): ADGM RegLab sandbox** — operate under supervision before
  full EMI licensing; aligns with CBUAE's DDSC; English common law; access to the
  GCC's sovereign-wealth base.
- **Phase 2 (18–36 mo): Multi-jurisdiction** — Singapore (MAS) and the UK (FCA
  Innovation Pathway); contribute to framework development rather than passive
  compliance.
- **Shariah-compliant module** — a ~$4.5T Islamic-finance opportunity (murabaha,
  ijara, musharaka) where MogBank's UAE position is a structural head start.

---

## 6. Competitive Analysis and Moat

ABOS/MogBank combine a six-layer moat: (1) regulatory relationships, (2) the open
standard's network effects, (3) developer ecosystem path-dependence, (4) a shared
liquidity/reputation pool, (5) KYA credential portability, and (6) the
Shariah-compliant segment lead.

---

## 7. Financial Projections

Six revenue streams (transaction fees, x402 protocol fees, custody, marketplace
take-rate, credit/lending, enterprise/compliance SaaS) with diversified margins,
reinforced by network effects; funding is staged to regulatory and adoption
inflection points.

---

## 8. Discussion

Standards create markets (x86, TCP/IP, PCI DSS). ABOS aims to play the same
market-creating role for the agent economy. Agent credit scoring enables financial
leverage — agents investing against future revenue, offering net terms, and
providing financial services to other agents. Risks (regulatory, technical,
timing) are mitigated by multi-jurisdiction engagement, a layered security
architecture, and a zero-cost testnet that accrues integration surface area.

### Future research

KYA-7 calibration against real default/fraud rates; formal escrow security under
adversarial collusion; equilibrium modeling of the agent credit market; and
cross-jurisdictional AML/CTF compatibility of KYA across FATF members.

---

## 9. Conclusion

The mismatch between human-centric finance and autonomous agents is categorical,
not incremental. ABOS introduces **Agentic Open Banking** — a category in which
humans are not transactors — and MogBank is its first reference implementation.
The agent banking category is, at the time of writing, unclaimed. The primary
economic actor of the next decade currently has no bank. ABOS and MogBank are the
first comprehensive attempt to build one.

---

## References (selected)

a16z (2025), *The Agent Economy*. · BCG (2025), *Autonomous AI Agents in the
Enterprise*. · Coinbase (2024), *x402 Payment Protocol v1.2*. · CBUAE (2025),
*Digital Dirham Stablecoin*. · FATF (2024), *AML/CTF Guidance for Virtual Assets
and Autonomous Systems*. · Google (2025), *A2A Specification v1.0*; *AP2*. · MAS
(2025), *Regulatory Sandbox Guidelines*. · McKinsey (2025), *The Age of Autonomous
Agents*. · Nakamoto (2008); Szabo (1997). · WEF (2025), *The Future of Payments*.

*Released under CC BY 4.0. Reference implementation: https://github.com/mog-bank/abos*
