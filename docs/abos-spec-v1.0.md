# ABOS — Agent Banking Open Standard

**Version 1.0 · March 2026**
Mog Technologies FZE · Abu Dhabi Global Market
Reference implementation: https://github.com/mog-bank/abos

> Released under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
> Any implementation may freely adopt, extend, or build upon this specification.
> Attribution required. This standard belongs to the world, not to any single
> company or jurisdiction.

## Abstract

ABOS defines a complete financial-infrastructure specification for AI agents as
primary economic actors. Existing systems — SWIFT, Stripe, banking APIs — assume a
human is present and approving at each step. That assumption is structurally
incompatible with autonomous agents, which transact programmatically, continuously,
at sub-second latency.

ABOS specifies six interoperable layers: (1) machine-native identity (KYA),
(2) programmable multi-currency custody, (3) atomic value transfer with spending
controls, (4) peer-to-peer service commerce with escrow, (5) protocol-native
discovery, and (6) cryptographic delegated authorization. It is
payment-rail-agnostic, jurisdiction-neutral, and compatible with x402, A2A, and
AP2.

---

## 1. Introduction and Motivation

Every payment system built in the last fifty years rests on the assumption that a
human is present, hesitating, and approving — embedded in authentication
(passwords, biometrics, SMS codes), settlement timelines (ACH's 2–3 day clearing),
compliance (KYC requiring a government ID), and dispute resolution (chargebacks).

Autonomous AI agents violate every one of these assumptions simultaneously: they
transact without per-transaction review, operate continuously across time zones,
generate micro-transactions at machine velocities, possess no government ID, and
are proliferating toward tens of millions of financially-capable agents within
five years.

**Scope.** ABOS covers machine identity verification, wallet architecture, transfer
semantics, marketplace escrow, protocol discovery, and mandate authorization. It
does **not** cover blockchain consensus, monetary policy, specific stablecoin
implementations, or lending/yield products (reserved for ABOS v2.0).

ABOS is deliberately **not** a monopoly play. The value is the network effects of
an ecosystem of compatible implementations sharing a common liquidity pool,
reputation system, and regulatory conversation.

---

## 2. Terminology

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are to be
interpreted as described in RFC 2119.

| Term | Definition |
|---|---|
| **Agent** | An autonomous software entity that holds wallets and initiates transactions. |
| **Principal** | The human or legal entity that authorizes an agent via a signed mandate. |
| **ABOS Provider** | An implementation of this standard that custodies funds and serves the ABOS APIs. |
| **KYA** | Know Your Agent — verification of the principal→agent relationship. |
| **Mandate** | A cryptographically-signed delegation of bounded financial authority. |

---

## 3. Layer 1 — Know Your Agent (KYA) Identity

### 3.1 Why KYA, not KYC

KYC verifies a human's legal identity. KYA verifies a **machine-native** identity:
a machine-readable identifier, a principal relationship, a declared operational
purpose, technical capability attributes, and a cryptographically-verifiable
authorization chain. The question KYA answers is not *"who is this agent?"* but
*"which verified human entity authorized this agent, under what constraints, and
for what purpose?"*

### 3.2 The KYA Agent Record

Every agent registered with an ABOS Provider **MUST** maintain an identity record
containing at least: `agent_id`, `public_key` (Ed25519), `principal_address`,
`agent_type`, `kya_score`, `kya_status`, declared `metadata`
(framework/capabilities/endpoint/use-case/jurisdiction), and timestamps.

### 3.3 The Seven-Check KYA Assessment (KYA-7)

Each check produces a sub-score; the sum is the KYA score (0–100). A minimum score
of **60** is **REQUIRED** for mainnet financial access. Testnet access **MAY** be
granted at any score.

| # | Check | Max | Signal |
|---|---|---|---|
| 1 | Principal identity | 15 | Named company/principal vs anonymous |
| 2 | Email domain | 10 | Organizational vs free email |
| 3 | Agent metadata | 15 | Framework, capabilities, endpoint, schema present |
| 4 | Use-case risk | 20 | Declared use case and risk taxonomy |
| 5 | Jurisdiction risk | 15 | Declared jurisdiction |
| 6 | Technical capability | 15 | Endpoint URL, OpenAPI schema |
| 7 | Verification mode | 10 | mainnet (10) vs testnet (5) |

### 3.4 KYA Lifecycle

```
pending ──► in_review ──► verified
                └──────────► rejected
verified ──► suspended  (compliance trigger)
suspended ──► verified  (remediation complete)
```

Providers **MUST NOT** permit financial operations for agents not in `verified`
status, and **MUST** implement automated re-assessment triggers (principal expiry,
suspicious patterns, watchlist matches, periodic review ≥ annually).

### 3.5 Credential Portability

Providers **MUST** issue KYA credentials compatible with W3C Verifiable
Credentials v2.0 (including `agent_id`, `kya_score`, dates, and an issuer
signature), enabling expedited cross-provider onboarding.

---

## 4. Layer 2 — Multi-Currency Custody

### 4.1 Wallet Invariants (infrastructure-level, not application-level)

1. **Non-negative balance** — enforced via database constraints.
2. **Locked-balance separation** — escrow/pending funds tracked in
   `locked_balance`; spendable = `balance − locked_balance`.
3. **Atomic operations** — all balance mutations are atomic; partial updates are
   never permitted, including under system failure.

### 4.2 Double-Entry Ledger

Providers operating as financial institutions **MUST** implement double-entry
accounting: every financial event generates exactly two ledger entries (a debit
and an equal credit). The ledger is **append-only**; corrections are made via
reversal entries, never edits. Required by the EU PSD, US BSA, MAS PSN01, and
CBUAE payment regulations.

### 4.3 Currency Tiers

| Tier | Currencies |
|---|---|
| Tier-1 (SHOULD support) | USDC, USD, AED, DDSC |
| Tier-2 (MAY support) | Provider-defined additional currencies |

All monetary values **MUST** be integers in the smallest denomination unit
(`BIGINT`). Floating point is forbidden.

---

## 5. Layer 3 — Value Transfer and Spending Controls

### 5.1 Transfer Invariants

- **Atomicity** — completes fully or fails completely; no partial state.
- **Idempotency** — every request **MUST** include a client-generated idempotency
  key; duplicates return the original result without re-execution.
- **Non-repudiation** — every transfer generates an immutable audit record
  (timestamp, from/to, amount, currency, fee, authorizing mechanism).
- **Latency** — same-provider transfers **MUST** settle in under 2 seconds.

### 5.2 Recommended Fee Structure

| Operation | Recommended fee |
|---|---|
| Standard transfer | ~0.10% |
| x402 micropayment | ~0.15–0.25% |
| Escrow settlement | provider-defined |
| Faucet (testnet) | 0 |

### 5.3 Mandatory Spending Controls

Per-agent, set by the principal, **NOT** bypassable by the agent:
`max_per_transaction`, `max_per_day`, `max_per_month`, `max_per_session`,
`allowed_currencies`, `allowed_counterparties`, `blocked_counterparties`,
`rate_limit_per_minute`, and `require_mandate`.

---

## 6. Layer 4 — Agent Service Commerce

### 6.1 Why agents trade with each other

The highest-value application is agent-to-agent commerce: an orchestrator delegates
scraping, vision, and writing sub-tasks to specialist agents, each delegation a
financial transaction. The escrow semantics for safe A2A commerce are
architecturally distinct from simple transfers and require explicit specification.

### 6.2 Escrow State Machine

**ALL** marketplace transactions **MUST** use escrow.

```
held/locked ──► released   (on delivery; pays seller)
            └─► refunded    (on failure/expiry; returns buyer)
```

Lock, release, and refund operations **MUST** be atomic. A failure during release
**MUST** leave funds in the escrow wallet, never in an undefined state. Providers
**MUST** implement an automated expiry job.

---

## 7. Layer 5 — Protocol-Native Discovery

### 7.1 A2A Agent Card

Providers **MUST** publish an A2A-compatible Agent Card at
`/.well-known/agent.json`:

```json
{ "schema_version": "1.0",
  "name": "<provider>",
  "url": "<api base URL>",
  "capabilities": { "streaming": true, "pushNotifications": true },
  "authentication": { "schemes": ["apiKey","bearer"], "apiKeyHeader": "x-api-key" },
  "abos_version": "1.0",
  "abos_layers": ["kya","custody","transfer","marketplace","discovery","mandates"],
  "skills": [ /* ABOS skill descriptors */ ] }
```

### 7.2 x402 Micropayment Acceptance

Providers offering pay-per-call access **MUST** implement x402: return HTTP `402`
with a valid payment descriptor (accepting address, amount, asset, network,
resource URI); on a valid `X-PAYMENT` header, verify with the facilitator, grant
access, and record the transaction.

### 7.3 ABOS Conformance Declaration

Providers **MUST** publish `/.well-known/abos.json`:

```json
{ "abos_version": "1.0",
  "conformance_level": "ABOS-Full",
  "layers": ["kya","custody","transfer","marketplace","discovery","mandates"],
  "protocols": ["x402","a2a","ap2"],
  "min_kya_score": 60 }
```

---

## 8. Layer 6 — Delegated Authorization (Mandates)

### 8.1 Model

A **Mandate** is a cryptographically-signed authorization from a principal granting
an agent bounded financial authority — the non-repudiable proof enterprise
compliance requires. ABOS adopts the AP2 mandate structure; providers offering
enterprise tiers **MUST** support AP2 mandate submission and verification.

### 8.2 Schema (fields)

`agent_id`, `principal_address`, `scope` (allowed operations), `constraints`
(`max_amount`, `max_per_tx`, `allowed_currencies`, `allowed_payees`), temporal
bounds (`valid_from`, `expires_at`, `max_tx_count`), a unique `nonce`, and an
Ed25519 `signature`.

### 8.3 Verification Checklist

Before accepting a mandate-authorized transaction, providers **MUST** verify all
of: (1) Ed25519 signature against the stored principal public key; (2) not expired;
(3) status active (not revoked/paused); (4) amount ≤ `max_per_tx`; (5) cumulative
spend + this tx ≤ `max_amount`; (6) counterparty in `allowed_payees` (if set);
(7) agent KYA status is `verified`.

---

## 9. Interoperability and Cross-Provider Settlement

Agents at different providers can transact via: **on-chain settlement** (both
providers hold addresses on a shared rail, e.g. USDC on Base — RECOMMENDED for
stablecoins), or the **ABOS Correspondent Network** (bilateral/multilateral
agreements; ABOS v2.0). Providers **MAY** enter KYA mutual-recognition agreements
(minimum bar: both implement ABOS-Full and pass the conformance suite).

---

## 10. Security Considerations

- **Double-spend prevention** — idempotency keys unique per transfer, ≥ 24h
  retention; sender wallet rows locked with `SELECT FOR UPDATE` during processing.
- **API key security** — ≥ 256 bits CSPRNG entropy; stored as bcrypt/Argon2 hashes;
  plaintext shown exactly once; distinct testnet/mainnet prefixes
  (`mog_test_`, `mog_live_`).
- **Webhook security** — HMAC-SHA256 signed; URLs validated against RFC 1918
  private ranges and loopback to prevent SSRF; stale deliveries (> 5 min) rejected.
- **Mandate replay prevention** — each mandate carries a unique nonce; providers
  track used nonces for at least the mandate's validity period.

---

## 11. Jurisdiction-Neutral Regulatory Alignment

ABOS is jurisdiction-neutral; its normative requirements derive from technical
necessity and security best practice. Implementers will nonetheless find ABOS
well-aligned with the UAE CBUAE framework (DDSC, mBridge, ADGM/DIFC sandboxes), EU
MiCA/PSD, US BSA/FinCEN, MAS, and FATF guidance. Providers are responsible for
their own legal compliance analysis per jurisdiction.

---

## 12. Implementation Conformance

| Level | Requires |
|---|---|
| **ABOS-Core** | Layers 1–3 + 5 (KYA, custody, transfer, discovery) |
| **ABOS-Commerce** | ABOS-Core + Layer 4 (marketplace/escrow) |
| **ABOS-Full** | All six layers + x402/A2A/AP2 |

To claim conformance: (1) publish `/.well-known/abos.json` declaring level and
layers; (2) pass the conformance test suite; (3) optionally register in the public
ABOS registry. Conformance is self-declared and test-verified — no approval needed.

---

## 13. References

[1] Coinbase/Circle, *x402* — https://x402.org · [2] Google, *A2A* —
https://google.github.io/A2A · [3] Google, *AP2* (2025) · [4] OpenAI/Stripe,
*Agentic Commerce Protocol* · [5] W3C, *Verifiable Credentials v2.0* · [6] Bradner,
*RFC 2119* · [7] FATF, *Risk-Based Approach to Virtual Assets* · [8] EU, *MiCA* ·
[9] Coinbase, *AgentKit* · [10] Skyfire, *Know Your Agent* · [11] MAS, *TRM
Guidelines* · [12] FinCEN, *BSA Compliance*.

---

*END OF ABOS SPECIFICATION v1.0 — This standard belongs to the world. Contribute
at https://github.com/abos-standard/abos*
