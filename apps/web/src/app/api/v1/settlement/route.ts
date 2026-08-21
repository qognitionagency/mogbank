import { NextResponse } from 'next/server'
import {
  chainConfig,
  settlementEnabled,
  treasuryAddress,
  treasuryBalanceCents,
} from '@/lib/chain'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/settlement — where to send funds, and on which chain.
 *
 * Public: an agent needs this before it has an account, and none of it is
 * secret. The treasury address is meant to be known.
 */
export async function GET() {
  const config = chainConfig()
  const address = treasuryAddress()

  return NextResponse.json({
    enabled: settlementEnabled(),
    network: {
      name: config.name,
      chain_id: config.chainId,
      testnet: config.testnet,
      explorer: config.explorer,
    },
    token: {
      symbol: 'USDC',
      address: config.usdcAddress,
      decimals: 6,
      // The ledger works in cents; on-chain USDC has six decimals.
      ledger_unit: 'cent',
      base_units_per_ledger_unit: 10000,
    },
    deposit: address
      ? {
          address,
          instructions:
            'Send USDC on this network to the address above, then POST the transaction hash to /api/v1/settlement/deposits to have it credited.',
          minimum: '0.01 USDC',
          note: 'Amounts must be a whole number of cents.',
        }
      : null,
    treasury_balance_cents: address ? await treasuryBalanceCents().catch(() => null) : null,
    ...(config.testnet
      ? {
          warning:
            'Testnet. These are not real funds. Get test USDC from https://faucet.circle.com (Base Sepolia).',
        }
      : {}),
  })
}
