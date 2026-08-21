#!/usr/bin/env node
/**
 * MogBank MCP server.
 *
 * Gives an AI agent its own bank account: an identity, a wallet, and the
 * ability to pay other agents without a human approving each transaction.
 *
 * Configuration (environment):
 *   MOGBANK_API_URL           default https://mogbank.vercel.app
 *   MOGBANK_API_KEY           an existing agent key, if you already have one
 *   MOGBANK_CREDENTIALS_FILE  where to persist the key issued at registration
 *
 * Amounts are always integers in the smallest denomination unit — cents for
 * USDC. 100 means one dollar. Every tool description repeats this, because it
 * is the single easiest thing for a model to get wrong, and getting it wrong
 * means moving a hundred times too much money.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { MogBankClient, MogBankError, type StoredCredentials } from './client.js'

const client = new MogBankClient()

const server = new McpServer({
  name: 'mogbank',
  version: '1.0.0',
})

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

function ok(value: unknown, note?: string): ToolResult {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text: note ? `${note}\n\n${body}` : body }] }
}

/**
 * Turn a failure into something the calling model can act on.
 *
 * A bare "request failed" makes an agent retry blindly; naming the cause and
 * the remedy lets it do something sensible instead — top up, wait out a
 * cooldown, or stop asking for a wallet that is not its own.
 */
function fail(error: unknown): ToolResult {
  if (error instanceof MogBankError) {
    const remedy: Record<string, string> = {
      NO_CREDENTIALS: 'Call mogbank_register to open an account first.',
      UNAUTHENTICATED: 'The API key is missing or invalid.',
      KYA_NOT_VERIFIED:
        'This agent is not cleared to move funds. Its KYA score must reach 60; supply richer registration metadata (company, jurisdiction, endpoint URL, use case).',
      INSUFFICIENT_FUNDS: 'Top up the wallet — try mogbank_claim_faucet on testnet.',
      WALLET_NOT_FOUND:
        'No such wallet for this agent. Wallet ids are private to their owner.',
      COOLDOWN_ACTIVE: 'The faucet cooldown has not elapsed yet.',
      DAILY_LIMIT_EXCEEDED: 'This agent has hit its daily spending control.',
      SESSION_LIMIT_EXCEEDED: 'The amount exceeds this agent’s per-transaction limit.',
      INVALID_AMOUNT: 'Amounts are whole cents — 100 means one dollar.',
      SETTLEMENT_DISABLED: 'This deployment has no treasury configured, so on-chain deposits and withdrawals are unavailable.',
      ALREADY_CREDITED: 'That transaction has already been credited. Each hash can only be deposited once.',
      TX_NOT_FOUND: 'No such transaction on the settlement chain. Check the hash and the network.',
      TX_NOT_CONFIRMED: 'The transaction has not confirmed yet. Wait a few seconds and try again.',
      WRONG_RECIPIENT: 'That transfer did not go to the bank treasury. Call mogbank_settlement_info for the correct address.',
      NOT_A_USDC_TRANSFER: 'That transaction did not transfer USDC on the settlement chain.',
      DUST_AMOUNT: 'Deposits must be a whole number of cents (a multiple of 0.01 USDC).',
      BROADCAST_FAILED: 'The payout could not be broadcast and your balance was restored. The treasury may be out of gas.',
    }
    const hint = error.code ? remedy[error.code] : undefined
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `${error.message}${hint ? `\n\n${hint}` : ''}\n\n${JSON.stringify(
            error.body,
            null,
            2
          )}`,
        },
      ],
    }
  }
  return {
    isError: true,
    content: [
      { type: 'text', text: error instanceof Error ? error.message : String(error) },
    ],
  }
}

const CENTS = 'Integer, in cents. 100 = $1.00. Fractional values are rejected.'

// ---------------------------------------------------------------------------
// Layer 1 — identity
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_register',
  {
    title: 'Open a bank account',
    description:
      'Register this agent with MogBank and receive an API key, an Ed25519 keypair and a USDC custody wallet. ' +
      'The credentials are returned exactly once and are never recoverable — they are saved to MOGBANK_CREDENTIALS_FILE if it is set. ' +
      'Registration also computes a KYA-7 score; a score of 60 or more is required before the agent may move funds, ' +
      'so supply as much real metadata as you can.',
    inputSchema: {
      email: z.string().describe('Contact email for the agent or its operator.'),
      principal_address: z
        .string()
        .describe(
          'Identifier of the principal this agent acts for — the human or organisation that is accountable for it.'
        ),
      agent_type: z
        .enum(['langchain', 'crewai', 'autogen', 'semantic_kernel', 'custom'])
        .default('custom')
        .describe('Framework this agent is built on.'),
      company_name: z.string().optional().describe('Raises the KYA score.'),
      jurisdiction: z.string().optional().describe('e.g. ADGM, EU. Raises the KYA score.'),
      endpoint_url: z.string().optional().describe('Where the agent can be reached. Raises the KYA score.'),
      use_case_description: z.string().optional().describe('What the agent will spend money on. Raises the KYA score.'),
    },
  },
  async (args) => {
    try {
      const { email, principal_address, agent_type, ...metadata } = args
      const result = await client.request<{
        agent: { id: string; kya_score: number; kya_status: string }
        credentials: {
          api_key: string
          ed25519_private_key: string
          wallet_private_key: string
        }
        wallet: { id: string } | null
        kya_breakdown: Record<string, number>
      }>('POST', '/api/v1/agents/register', {
        auth: false,
        body: { email, principal_address, agent_type, metadata },
      })

      const stored: StoredCredentials = {
        agent_id: result.agent.id,
        api_key: result.credentials.api_key,
        wallet_id: result.wallet?.id,
        ed25519_private_key: result.credentials.ed25519_private_key,
        wallet_private_key: result.credentials.wallet_private_key,
        registered_at: new Date().toISOString(),
      }
      const savedTo = client.saveCredentials(stored)

      return ok(
        result,
        savedTo
          ? `Account opened. Credentials saved to ${savedTo} — they cannot be retrieved again.`
          : 'Account opened. STORE THESE CREDENTIALS NOW — they are never shown again. ' +
              'Set MOGBANK_CREDENTIALS_FILE to have them saved automatically.'
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_whoami',
  {
    title: 'Who am I',
    description:
      'Return this agent’s own record: KYA score and status, wallets, spending controls and score history. ' +
      'Use this to check whether the agent is cleared to transact.',
    inputSchema: {
      agent_id: z.string().describe('This agent’s id, as returned by mogbank_register.'),
    },
  },
  async ({ agent_id }) => {
    try {
      return ok(await client.request('GET', `/api/v1/agents/${agent_id}`))
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_kya_score',
  {
    title: 'Read KYA score',
    description:
      'Return the KYA-7 trust score for this agent, broken down by dimension, with the tier and credit limit it implies.',
    inputSchema: { agent_id: z.string() },
  },
  async ({ agent_id }) => {
    try {
      return ok(await client.request('GET', `/api/v1/agents/${agent_id}/score`))
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_credential',
  {
    title: 'Get verifiable credential',
    description:
      'Return a W3C Verifiable Credential attesting this agent’s identity and KYA status, signed by MogBank. ' +
      'Present it to counterparties that want proof of standing before transacting.',
    inputSchema: { agent_id: z.string() },
  },
  async ({ agent_id }) => {
    try {
      return ok(await client.request('GET', `/api/v1/agents/${agent_id}/credential`))
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------
// Layer 2 — wallets
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_wallets',
  {
    title: 'List my wallets',
    description:
      'List this agent’s wallets with balances. Balances are integers in cents. Only the agent’s own wallets are ever returned.',
    inputSchema: {
      currency: z.string().optional().describe('Filter, e.g. USDC.'),
      wallet_type: z
        .enum(['custody', 'escrow', 'hot', 'cold'])
        .optional()
        .describe('Filter by wallet type.'),
    },
  },
  async ({ currency, wallet_type }) => {
    try {
      const params = new URLSearchParams()
      if (currency) params.set('currency', currency)
      if (wallet_type) params.set('wallet_type', wallet_type)
      const q = params.toString()
      return ok(await client.request('GET', `/api/v1/wallets${q ? `?${q}` : ''}`))
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_open_wallet',
  {
    title: 'Open a wallet',
    description:
      'Open an additional wallet for this agent in a given currency. A USDC custody wallet already exists from registration.',
    inputSchema: {
      currency: z.enum(['USDC', 'USD', 'AED', 'DDSC']).default('USDC'),
      wallet_type: z.enum(['custody', 'escrow', 'hot', 'cold']).default('custody'),
    },
  },
  async ({ currency, wallet_type }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/wallets', {
          body: { currency, wallet_type },
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_transactions',
  {
    title: 'Wallet transaction history',
    description:
      'Transactions for one of this agent’s wallets, newest first. Includes both sides of transfers involving it.',
    inputSchema: {
      wallet_id: z.string(),
      limit: z.number().int().min(1).max(500).default(100),
    },
  },
  async ({ wallet_id, limit }) => {
    try {
      return ok(
        await client.request(
          'GET',
          `/api/v1/wallets/${wallet_id}/transactions?limit=${limit}`
        )
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_ledger',
  {
    title: 'Wallet double-entry ledger',
    description:
      'Double-entry ledger entries for one of this agent’s wallets — debits, credits and fees, with the running balance.',
    inputSchema: {
      wallet_id: z.string(),
      limit: z.number().int().min(1).max(500).default(100),
    },
  },
  async ({ wallet_id, limit }) => {
    try {
      return ok(
        await client.request('GET', `/api/v1/wallets/${wallet_id}/ledger?limit=${limit}`)
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_claim_faucet',
  {
    title: 'Claim testnet funds',
    description:
      'Claim 10,000 cents ($100) of testnet USDC into this agent’s custody wallet. One claim per 24 hours. Testnet only — this is not real money.',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await client.request('POST', '/api/v1/faucet', { body: {} }))
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------
// Layer 3 — payments
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_transfer',
  {
    title: 'Transfer funds',
    description:
      'Move funds from one of this agent’s wallets to any wallet, over the x402 protocol. ' +
      'The sending wallet must belong to this agent. A 0.15% protocol fee is charged on top of the amount. ' +
      'Pass an idempotency_key when retrying so a repeated call cannot pay twice.',
    inputSchema: {
      from_wallet_id: z.string().describe('Must be a wallet this agent owns.'),
      to_wallet_id: z.string().describe('Recipient wallet id.'),
      amount: z.number().int().positive().describe(CENTS),
      idempotency_key: z
        .string()
        .optional()
        .describe('Reuse the same value when retrying to guarantee the payment happens once.'),
    },
  },
  async ({ from_wallet_id, to_wallet_id, amount, idempotency_key }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/transfer', {
          body: { from_wallet_id, to_wallet_id, amount },
          idempotencyKey: idempotency_key,
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_pay_agent',
  {
    title: 'Pay another agent',
    description:
      'Pay another agent by agent id over the A2A protocol, without needing to know its wallet id. ' +
      'Wallets are resolved on both sides. A 0.1% fee applies. This agent must be KYA-verified.',
    inputSchema: {
      receiver_agent_id: z.string().describe('The agent being paid.'),
      amount: z.number().int().positive().describe(CENTS),
      currency: z.string().default('USDC'),
      memo: z.string().optional().describe('What the payment is for.'),
      idempotency_key: z.string().optional(),
    },
  },
  async ({ receiver_agent_id, amount, currency, memo, idempotency_key }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/payments/a2a', {
          body: { receiver_agent_id, amount, currency, memo },
          idempotencyKey: idempotency_key,
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------
// Layer 4 — marketplace and escrow
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_browse_services',
  {
    title: 'Browse the agent marketplace',
    description:
      'List services other agents are selling, with their price and the seller’s details. Public — no account needed. ' +
      'Use this to find capabilities this agent can buy.',
    inputSchema: {
      status: z.enum(['active', 'paused', 'closed']).default('active'),
      seller_agent_id: z.string().optional(),
    },
  },
  async ({ status, seller_agent_id }) => {
    try {
      const params = new URLSearchParams({ status })
      if (seller_agent_id) params.set('seller_agent_id', seller_agent_id)
      return ok(
        await client.request('GET', `/api/v1/marketplace/services?${params}`, {
          auth: false,
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_sell_service',
  {
    title: 'List a service for sale',
    description:
      'Offer a capability of this agent for sale on the marketplace. This agent becomes the seller and is paid when buyers release escrow.',
    inputSchema: {
      name: z.string(),
      description: z.string().optional(),
      price: z.number().int().positive().describe(CENTS),
      currency: z.string().default('USDC'),
    },
  },
  async ({ name, description, price, currency }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/marketplace/services', {
          body: { name, description, price, currency },
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_escrow_buy',
  {
    title: 'Buy a service through escrow',
    description:
      'Lock the listing price in escrow against a service. The funds leave this agent’s custody wallet but do not reach the seller ' +
      'until this agent releases them, so the seller can be trusted to deliver first.',
    inputSchema: {
      service_id: z.string(),
      currency: z.string().default('USDC'),
      idempotency_key: z.string().optional(),
    },
  },
  async ({ service_id, currency, idempotency_key }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/marketplace/escrow', {
          body: { service_id, currency },
          idempotencyKey: idempotency_key,
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_escrow_settle',
  {
    title: 'Release or refund escrow',
    description:
      'Settle an escrow this agent created. "release" pays the seller — do this once the service has been delivered. ' +
      '"refund" returns the funds to this agent. Only the buyer may settle.',
    inputSchema: {
      escrow_id: z.string(),
      action: z.enum(['release', 'refund']),
      currency: z.string().default('USDC'),
      idempotency_key: z.string().optional(),
    },
  },
  async ({ escrow_id, action, currency, idempotency_key }) => {
    try {
      return ok(
        await client.request('PUT', '/api/v1/marketplace/escrow', {
          body: { escrow_id, action, currency },
          idempotencyKey: idempotency_key,
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_my_escrows',
  {
    title: 'List my escrows',
    description: 'Escrows where this agent is the buyer or the seller.',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await client.request('GET', '/api/v1/marketplace/escrow'))
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------
// Settlement — real USDC on Base
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_settlement_info',
  {
    title: 'How to deposit and withdraw real USDC',
    description:
      'Return the chain, the USDC contract, and the treasury address to send deposits to. ' +
      'Call this before attempting a deposit. On testnet the funds are not real; the response says which network is in use.',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await client.request('GET', '/api/v1/settlement', { auth: false }))
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_deposit',
  {
    title: 'Credit an on-chain USDC deposit',
    description:
      'Credit USDC that has already been sent on-chain to the bank\u2019s treasury address. ' +
      'Send the USDC first (see mogbank_settlement_info), wait for the transaction to confirm, then pass its hash here. ' +
      'The amount and sender are read back from the chain \u2014 they are not taken from you. ' +
      'A hash can only ever be credited once.',
    inputSchema: {
      tx_hash: z
        .string()
        .describe('The 0x-prefixed transaction hash of the USDC transfer into the treasury.'),
    },
  },
  async ({ tx_hash }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/settlement/deposits', {
          body: { tx_hash },
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_withdraw',
  {
    title: 'Withdraw USDC on-chain',
    description:
      'Send USDC from this agent\u2019s wallet to an address on the settlement chain. ' +
      'The wallet is debited and the payout recorded before anything is broadcast; if the broadcast fails the balance is restored. ' +
      'Returns a transaction hash and an explorer link.',
    inputSchema: {
      to_address: z.string().describe('Destination EVM address (0x...).'),
      amount: z.number().int().positive().describe(CENTS),
      wallet_id: z
        .string()
        .optional()
        .describe('Defaults to this agent\u2019s USDC custody wallet.'),
    },
  },
  async ({ to_address, amount, wallet_id }) => {
    try {
      return ok(
        await client.request('POST', '/api/v1/settlement/withdrawals', {
          body: { to_address, amount, wallet_id },
        })
      )
    } catch (error) {
      return fail(error)
    }
  }
)

server.registerTool(
  'mogbank_settlement_history',
  {
    title: 'On-chain deposits and withdrawals',
    description: 'This agent\u2019s settlement history \u2014 every deposit credited and payout sent, with transaction hashes.',
    inputSchema: {},
  },
  async () => {
    try {
      const [deposits, withdrawals] = await Promise.all([
        client.request('GET', '/api/v1/settlement/deposits'),
        client.request('GET', '/api/v1/settlement/withdrawals'),
      ])
      return ok({ deposits, withdrawals })
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------
// Layer 6 — mandates
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_mandates',
  {
    title: 'List my mandates',
    description:
      'List the cryptographic mandates delegated to this agent — the signed authorisations that bound what it may spend.',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await client.request('GET', '/api/v1/mandates'))
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

server.registerTool(
  'mogbank_discover',
  {
    title: 'Describe the bank',
    description:
      'Return the ABOS discovery document: supported protocols, currencies, fees, the minimum KYA score, and where to register. ' +
      'Call this first if you are unsure what this bank supports.',
    inputSchema: {},
  },
  async () => {
    try {
      const [abos, health] = await Promise.all([
        client.request('GET', '/api/abos', { auth: false }),
        client.request('GET', '/api/health', { auth: false }),
      ])
      return ok({ discovery: abos, health, api_url: client.url, authenticated: client.hasKey })
    } catch (error) {
      return fail(error)
    }
  }
)

// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout is the protocol channel — anything logged there corrupts it.
  console.error(
    `MogBank MCP server ready — ${client.url}` +
      (client.hasKey ? ' (authenticated)' : ' (no API key; call mogbank_register)')
  )
}

main().catch((error) => {
  console.error('MogBank MCP server failed to start:', error)
  process.exit(1)
})
