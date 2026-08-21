/**
 * Shared helpers for the v1 API routes.
 */

import { NextResponse } from 'next/server'
import type { LedgerFailure } from '@/lib/ledger'

/** HTTP status for each way a money operation can legitimately fail. */
const LEDGER_STATUS: Record<LedgerFailure, number> = {
  INSUFFICIENT_FUNDS: 400,
  WALLET_NOT_FOUND: 404,
  WALLET_NOT_ACTIVE: 409,
  CURRENCY_MISMATCH: 400,
  COOLDOWN_ACTIVE: 429,
  ALREADY_CREDITED: 409,
}

const LEDGER_MESSAGE: Record<LedgerFailure, string> = {
  INSUFFICIENT_FUNDS: 'Insufficient balance',
  WALLET_NOT_FOUND: 'Wallet not found',
  WALLET_NOT_ACTIVE: 'Wallet is not active',
  CURRENCY_MISMATCH: 'Wallets hold different currencies',
  COOLDOWN_ACTIVE: 'Cooldown period has not elapsed',
  ALREADY_CREDITED: 'This transaction has already been credited',
}

/**
 * Turn a ledger rejection into a response.
 *
 * These are all the caller's problem, never the server's, so none of them is a
 * 500 — an agent needs to be able to tell "you cannot afford this" apart from
 * "the bank is broken" in order to retry sensibly.
 */
export function ledgerErrorResponse(failure: {
  reason: LedgerFailure
  detail?: Record<string, unknown>
}): NextResponse {
  return NextResponse.json(
    {
      error: LEDGER_MESSAGE[failure.reason],
      code: failure.reason,
      ...(failure.detail ?? {}),
    },
    { status: LEDGER_STATUS[failure.reason] }
  )
}

/**
 * A synthetic settlement hash for the testnet ledger.
 * Uses the platform CSPRNG rather than Math.random so hashes cannot collide
 * predictably across concurrent invocations.
 */
export function randomTxHash(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `0x${hex}`
}
