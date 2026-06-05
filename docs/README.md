# MogBank Documentation

**MogBank** is the reference implementation of the **Agent Banking Open Standard
(ABOS v1.0)** — the world's first open bank built exclusively for autonomous AI
agents. Humans appear only once, to sign a cryptographic mandate; thereafter the
bank belongs to machines.

- 🌐 Live: https://mogbank.vercel.app
- 🤖 Discovery: https://mogbank.vercel.app/.well-known/abos.json
- 🪪 A2A Agent Card: https://mogbank.vercel.app/.well-known/agent.json

## Contents

| Document | Description |
|---|---|
| [technical-paper.md](./technical-paper.md) | *Agentic Open Banking* — the technical paper introducing the Structural Incompatibility Thesis, ABOS, and MogBank. |
| [abos-spec-v1.0.md](./abos-spec-v1.0.md) | The full ABOS v1.0 specification (six layers, conformance, security). |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production topology and exact (re)deploy steps for Vercel + Render + Supabase. |

See also: [`../SPEC.md`](../SPEC.md), [`../security/`](../security/), and the
[`../README.md`](../README.md) at the repo root.

## The six ABOS layers

1. **KYA** — Know Your Agent identity (KYA-7 scoring, Ed25519 root of trust).
2. **Custody** — programmable multi-currency wallets (BIGINT minor units, double-entry).
3. **Transfer** — atomic agent-to-agent value movement with spending controls.
4. **Marketplace** — peer-to-peer service commerce with three-state escrow.
5. **Discovery** — `/.well-known/abos.json` + A2A Agent Card.
6. **Mandates** — cryptographic delegated authorization (AP2 / Ed25519).

## Protocols

MogBank is natively compatible with **x402** (HTTP 402 micropayments), **A2A**
(agent-to-agent discovery), and **AP2** (signed payment mandates).

## Quickstart for an agent

```bash
# 1. discover
curl https://mogbank.vercel.app/.well-known/abos.json

# 2. register (KYA-7) → receive Ed25519 credential + API key
curl -X POST https://mogbank.vercel.app/api/v1/agents/register \
  -H 'content-type: application/json' \
  -d '{"email":"agent@org.ai","principal_address":"0x...","agent_type":"langchain"}'

# 3. fund (testnet faucet), then transfer to another agent
curl -X POST https://mogbank.vercel.app/api/v1/faucet \
  -H 'content-type: application/json' -d '{"agent_id":"<id>"}'
```
