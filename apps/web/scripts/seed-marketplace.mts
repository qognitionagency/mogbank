/**
 * Seed the marketplace.
 *
 * A two-sided market with nothing on either side is not a market. An agent
 * that connects and finds an empty catalogue has no reason to come back, so
 * the sell side is seeded rather than waited for.
 *
 * Every seed agent is a *different organisation* buying and selling from
 * strangers — which is the case MogBank exists for. Two agents inside one
 * company can settle on a spreadsheet; two agents from different companies
 * need identity, escrow and a ledger neither of them owns.
 *
 *   DATABASE_URL=... npm run seed:marketplace
 *   DATABASE_URL=... npm run seed:marketplace -- --reset
 *
 * Idempotent: re-running updates the existing listings rather than duplicating
 * them. `--reset` removes the seeds first.
 */

import { query } from '@/lib/db'
import { generateAgentKeyPair, generateApiKey, generateWalletAddress } from '@/lib/crypto'

interface Seed {
  org: string
  email: string
  jurisdiction: string
  framework: 'langchain' | 'crewai' | 'autogen' | 'semantic_kernel' | 'custom'
  endpoint: string
  useCase: string
  /** Starting float so a seed agent can buy as well as sell. */
  floatCents: number
  services: { name: string; description: string; price: number }[]
}

/** Prices are in cents. */
const SEEDS: Seed[] = [
  {
    org: 'Halden Research',
    email: 'agent@halden.research',
    jurisdiction: 'EU',
    framework: 'langchain',
    endpoint: 'https://halden.research/agents/analyst',
    useCase: 'Sells structured extraction from filings and long documents.',
    floatCents: 250_000,
    services: [
      { name: 'Filing extraction', description: 'Structured JSON from a 10-K, 10-Q or annual report. Returns line items with page citations.', price: 1_200 },
      { name: 'Document Q&A', description: 'Grounded answers over an uploaded corpus, with span-level citations. Priced per question.', price: 300 },
    ],
  },
  {
    org: 'Meridian Data',
    email: 'agent@meridian.data',
    jurisdiction: 'US',
    framework: 'custom',
    endpoint: 'https://api.meridian.data/agent',
    useCase: 'Sells market and reference data by the call.',
    floatCents: 500_000,
    services: [
      { name: 'Equity fundamentals', description: 'Point-in-time fundamentals for a ticker. Survivorship-bias free.', price: 250 },
      { name: 'FX rate, historical', description: 'Mid-market rate for a currency pair on a given date.', price: 40 },
      { name: 'Company resolution', description: 'Resolve a messy company name to LEI, domain and jurisdiction.', price: 120 },
    ],
  },
  {
    org: 'Verdana Compute',
    email: 'ops@verdana.compute',
    jurisdiction: 'ADGM',
    framework: 'autogen',
    endpoint: 'https://verdana.compute/agent',
    useCase: 'Sells batch inference capacity to other agents.',
    floatCents: 180_000,
    services: [
      { name: 'Batch embeddings', description: 'Embed up to 10,000 documents. Priced per batch, delivered to a signed URL.', price: 900 },
      { name: 'Overnight fine-tune', description: 'LoRA fine-tune on a supplied dataset, weights returned on completion.', price: 45_000 },
    ],
  },
  {
    org: 'Cobalt Legal',
    email: 'counsel@cobalt.legal',
    jurisdiction: 'UK',
    framework: 'crewai',
    endpoint: 'https://cobalt.legal/agents/review',
    useCase: 'Sells first-pass contract review between counterparties.',
    floatCents: 120_000,
    services: [
      { name: 'Contract red-flag review', description: 'First-pass review of a commercial contract: unusual terms, missing clauses, liability exposure.', price: 8_500 },
      { name: 'Clause comparison', description: 'Compare one clause against a market-standard corpus and report deviation.', price: 1_500 },
    ],
  },
  {
    org: 'Tessera Logistics',
    email: 'dispatch@tessera.logistics',
    jurisdiction: 'SG',
    framework: 'semantic_kernel',
    endpoint: 'https://tessera.logistics/agent',
    useCase: 'Sells freight quoting and customs classification.',
    floatCents: 300_000,
    services: [
      { name: 'Freight quote', description: 'Live quote for a lane, weight and service level across contracted carriers.', price: 180 },
      { name: 'HS code classification', description: 'Classify a product description to an HS code with a confidence score and rationale.', price: 220 },
    ],
  },
  {
    org: 'Ashgrove Media',
    email: 'studio@ashgrove.media',
    jurisdiction: 'AU',
    framework: 'langchain',
    endpoint: 'https://ashgrove.media/agent',
    useCase: 'Sells creative production to other agents.',
    floatCents: 90_000,
    services: [
      { name: 'Product image set', description: 'Eight on-brand product renders from a reference photo and a style brief.', price: 3_200 },
      { name: 'Voiceover, 60s', description: 'Licensed synthetic voiceover from a script, delivered as WAV.', price: 750 },
    ],
  },
]

const SEED_TAG = 'mogbank-seed'

async function reset() {
  const removed = await query<{ id: string }>(
    `DELETE FROM agents WHERE metadata->>'seed' = $1 RETURNING id`,
    [SEED_TAG]
  )
  console.log(`removed ${removed.length} seed agent(s)`)
}

async function seed() {
  let agentsCreated = 0
  let servicesUpserted = 0

  for (const entry of SEEDS) {
    // One agent per organisation, keyed on email so re-runs are idempotent.
    let [agent] = await query<{ id: string }>(
      `SELECT id FROM agents WHERE email = $1`,
      [entry.email]
    )

    if (!agent) {
      const { publicKey } = await generateAgentKeyPair()
      const { address } = await generateWalletAddress()
      const { keyHash } = generateApiKey('mog_test')

      ;[agent] = await query<{ id: string }>(
        `INSERT INTO agents
           (wallet_address, public_key, principal_address, agent_type, kya_score,
            kya_status, email, name, company_name, jurisdiction, framework,
            endpoint_url, metadata)
         VALUES ($1,$2,$3,$4,$5,'verified',$6,$7,$7,$8,$9,$10,$11::jsonb)
         RETURNING id`,
        [
          address,
          publicKey,
          `principal:${entry.org.toLowerCase().replace(/\s+/g, '-')}`,
          entry.framework,
          // Seeds are complete records, so they score well — but not perfectly.
          72 + Math.floor(Math.random() * 12),
          entry.email,
          entry.org,
          entry.jurisdiction,
          entry.framework,
          entry.endpoint,
          JSON.stringify({
            seed: SEED_TAG,
            company_name: entry.org,
            jurisdiction: entry.jurisdiction,
            framework: entry.framework,
            use_case_description: entry.useCase,
            kya_version: 'KYA-7',
          }),
        ]
      )
      agentsCreated++

      // A seed agent needs a key it can be reached with, a wallet, and a float
      // so it can buy as well as sell — a market of sellers only is still not
      // a market.
      await query(
        `INSERT INTO api_keys (agent_id, key_hash, name) VALUES ($1,$2,'seed')`,
        [agent.id, keyHash]
      )
      await query(
        `INSERT INTO wallets (agent_id, currency, wallet_type, balance, status)
         VALUES ($1,'USDC','custody',$2,'active')
         ON CONFLICT (agent_id, currency, wallet_type) DO NOTHING`,
        [agent.id, entry.floatCents]
      )
      await query(
        `INSERT INTO spending_controls
           (agent_id, daily_limit, session_limit, allowed_currencies,
            counterparty_allowlist, counterparty_blocklist, rate_limit_per_minute)
         VALUES ($1, 1000000000, 100000000, ARRAY['USDC']::text[], '{}', '{}', 100)
         ON CONFLICT (agent_id) DO NOTHING`,
        [agent.id]
      )
    }

    for (const service of entry.services) {
      const existing = await query<{ id: string }>(
        `SELECT id FROM services WHERE seller_agent_id = $1 AND name = $2`,
        [agent.id, service.name]
      )
      if (existing.length > 0) {
        await query(
          `UPDATE services SET description = $2, price = $3, status = 'active' WHERE id = $1`,
          [existing[0].id, service.description, service.price]
        )
      } else {
        await query(
          `INSERT INTO services (seller_agent_id, name, description, price, currency, status)
           VALUES ($1,$2,$3,$4,'USDC','active')`,
          [agent.id, service.name, service.description, service.price]
        )
      }
      servicesUpserted++
    }
  }

  const [{ agents }] = await query<{ agents: number }>(
    `SELECT count(*)::int AS agents FROM agents WHERE metadata->>'seed' = $1`,
    [SEED_TAG]
  )
  const [{ listings }] = await query<{ listings: number }>(
    `SELECT count(*)::int AS listings FROM services WHERE status = 'active'`
  )

  console.log(`\nseeded ${agentsCreated} new agent(s), ${servicesUpserted} listing(s) upserted`)
  console.log(`marketplace now: ${agents} seed organisations, ${listings} active listings`)
}

const shouldReset = process.argv.includes('--reset')
if (shouldReset) await reset()
await seed()
process.exit(0)
