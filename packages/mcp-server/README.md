# @mogbank/mcp-server

An MCP server that gives an AI agent its own bank account.

Once connected, the agent can open an account, hold a wallet, pay other agents,
buy services through escrow and read its own ledger — without a human approving
each transaction. Eighteen tools across all six ABOS layers.

> **Testnet.** Balances are play money from a faucet and settlement is
> simulated. Do not treat these as real funds.

## Install

### Claude Code

```bash
claude mcp add mogbank -- npx -y @mogbank/mcp-server
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mogbank": {
      "command": "npx",
      "args": ["-y", "@mogbank/mcp-server"],
      "env": {
        "MOGBANK_CREDENTIALS_FILE": "~/.mogbank/credentials.json"
      }
    }
  }
}
```

Any MCP client works — the server speaks stdio.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MOGBANK_API_URL` | `https://mogbank.vercel.app` | Point at your own deployment. |
| `MOGBANK_API_KEY` | — | An existing agent key. Omit to register a new account. |
| `MOGBANK_CREDENTIALS_FILE` | — | Where to persist the key issued at registration. |

**Set `MOGBANK_CREDENTIALS_FILE`.** The API key, Ed25519 private key and wallet
private key are returned exactly once at registration and are not recoverable.
With this set they are written to that path (mode `600`) and picked up on every
later run; without it, an agent that restarts has lost its account.

## First run

Ask the agent to open an account. It will call `mogbank_register`, which
computes a KYA-7 trust score. **A score of 60 or more is required before the
agent may move money**, so supply real metadata — company, jurisdiction,
endpoint URL, use case. Each raises the score.

Then `mogbank_claim_faucet` for $100 of testnet USDC (once per 24h), and the
agent can transact.

## Tools

**Identity** — `mogbank_register`, `mogbank_whoami`, `mogbank_kya_score`,
`mogbank_credential`

**Wallets** — `mogbank_wallets`, `mogbank_open_wallet`,
`mogbank_transactions`, `mogbank_ledger`, `mogbank_claim_faucet`

**Payments** — `mogbank_transfer` (x402, by wallet id),
`mogbank_pay_agent` (A2A, by agent id)

**Marketplace** — `mogbank_browse_services`, `mogbank_sell_service`,
`mogbank_escrow_buy`, `mogbank_escrow_settle`, `mogbank_my_escrows`

**Other** — `mogbank_mandates`, `mogbank_discover`

## Two things that will bite you

**Amounts are integers in cents.** `100` is one dollar. Fractional values are
rejected rather than rounded, because rounding someone's money silently is
worse than failing. Every tool that takes an amount says so.

**Pass `idempotency_key` when retrying a payment.** Without it, a retry is a
second payment. With it, the bank returns the original result instead of paying
again. Any stable string works — reuse the same one across retries of the same
logical payment.

## Scope

An agent only ever sees its own money. Wallets, ledgers, scores and credentials
belonging to another agent return "not found" — knowing an id grants nothing.
The marketplace listing endpoint is the one public read.

## Development

```bash
npm install
npm run build
MOGBANK_API_URL=http://localhost:3000 node dist/index.js
```

## Licence

CC BY 4.0 — Mog Technologies FZE
