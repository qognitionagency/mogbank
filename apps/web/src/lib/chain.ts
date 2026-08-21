/**
 * On-chain settlement — real USDC on Base.
 *
 * MogBank is a custodial ledger. Agent-to-agent payments stay off-chain: they
 * are instant, atomic and free, and putting a $0.003 API call on a blockchain
 * would cost more in gas than the payment is worth. The chain is used where it
 * actually matters — at the boundary, where value enters and leaves:
 *
 *   deposit    an agent sends USDC to the bank's address, then submits the
 *              transaction hash. The bank verifies it on-chain and credits the
 *              internal ledger.
 *   withdrawal the bank sends USDC from its treasury to an address the agent
 *              names, and debits the internal ledger.
 *
 * That split is how custodial exchanges work, and it is the only version that
 * is both fast enough for agents and settled in something real.
 *
 * DECIMALS. The ledger stores cents (2dp). USDC on-chain has 6 decimals. One
 * cent is therefore 10,000 base units. Every conversion goes through the two
 * helpers below — never inline the factor, and never use floating point: these
 * are exact integer conversions on `bigint`.
 */

import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  isAddress,
  type ContractRunner,
} from 'ethers'

// ---------------------------------------------------------------------------
// Networks
// ---------------------------------------------------------------------------

export interface ChainConfig {
  chainId: number
  name: string
  rpcUrl: string
  /** Circle's canonical USDC for this chain. */
  usdcAddress: string
  explorer: string
  /** False for anything carrying real value. */
  testnet: boolean
}

const NETWORKS: Record<string, ChainConfig> = {
  'base-sepolia': {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    explorer: 'https://sepolia.basescan.org',
    testnet: true,
  },
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org',
    testnet: false,
  },
}

/**
 * Defaults to Base Sepolia. Moving to mainnet is an explicit act — set
 * `SETTLEMENT_NETWORK=base` — because it is the moment the bank starts holding
 * value someone can lose.
 */
export function chainConfig(): ChainConfig {
  const key = (process.env.SETTLEMENT_NETWORK ?? 'base-sepolia').toLowerCase()
  const network = NETWORKS[key]
  if (!network) {
    throw new Error(
      `Unknown SETTLEMENT_NETWORK "${key}". Expected one of: ${Object.keys(NETWORKS).join(', ')}`
    )
  }
  return {
    ...network,
    rpcUrl: process.env.SETTLEMENT_RPC_URL || network.rpcUrl,
  }
}

export const USDC_DECIMALS = 6
/** Ledger cents -> USDC base units. 1 cent = 10,000 base units. */
const CENTS_TO_BASE = 10_000n

export function centsToBaseUnits(cents: number): bigint {
  if (!Number.isInteger(cents)) {
    throw new Error('Ledger amounts are whole cents')
  }
  return BigInt(cents) * CENTS_TO_BASE
}

/**
 * USDC base units -> ledger cents.
 *
 * Returns null when the amount is not a whole number of cents. A deposit of
 * 1,500 base units (0.0015 USDC) cannot be represented, and silently rounding
 * it either creates or destroys value — so the caller is told to reject it
 * instead.
 */
export function baseUnitsToCents(base: bigint): number | null {
  if (base % CENTS_TO_BASE !== 0n) return null
  return Number(base / CENTS_TO_BASE)
}

export function formatUsdc(base: bigint): string {
  return formatUnits(base, USDC_DECIMALS)
}

// ---------------------------------------------------------------------------
// Provider / treasury
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

let _provider: JsonRpcProvider | undefined

export function provider(): JsonRpcProvider {
  if (!_provider) {
    const config = chainConfig()
    _provider = new JsonRpcProvider(config.rpcUrl, config.chainId, {
      staticNetwork: true,
    })
  }
  return _provider
}

/**
 * The bank's treasury wallet — the address deposits are sent to and
 * withdrawals are paid from.
 *
 * Null when `TREASURY_PRIVATE_KEY` is unset, which disables settlement rather
 * than half-enabling it. Deposits still cannot be credited without it, because
 * there would be no address to have sent them to.
 */
export function treasury(): Wallet | null {
  const key = process.env.TREASURY_PRIVATE_KEY
  if (!key) return null
  try {
    return new Wallet(key, provider())
  } catch {
    return null
  }
}

export function treasuryAddress(): string | null {
  return treasury()?.address ?? null
}

export function settlementEnabled(): boolean {
  return Boolean(treasuryAddress())
}

export function usdcContract(runner: ContractRunner = provider()): Contract {
  return new Contract(chainConfig().usdcAddress, ERC20_ABI, runner)
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export type DepositRejection =
  | 'TX_NOT_FOUND'
  | 'TX_NOT_CONFIRMED'
  | 'TX_FAILED'
  | 'NOT_A_USDC_TRANSFER'
  | 'WRONG_RECIPIENT'
  | 'DUST_AMOUNT'
  | 'SETTLEMENT_DISABLED'

export interface VerifiedDeposit {
  txHash: string
  from: string
  to: string
  amountCents: number
  amountUsdc: string
  confirmations: number
  chainId: number
  explorerUrl: string
}

/** Below this the gas to move it exceeds the value. 1 cent. */
const MIN_DEPOSIT_CENTS = 1

/**
 * Verify that `txHash` really is a confirmed USDC transfer into the treasury.
 *
 * Everything is read back from the chain — the caller supplies only the hash.
 * A caller that claims an amount, a sender or a token is not believed; if it
 * were, anyone could mint themselves a balance by asserting a deposit.
 */
export async function verifyDeposit(
  txHash: string,
  minConfirmations = 1
): Promise<
  | { ok: true; deposit: VerifiedDeposit }
  | { ok: false; reason: DepositRejection; detail?: Record<string, unknown> }
> {
  const config = chainConfig()
  const bankAddress = treasuryAddress()
  if (!bankAddress) return { ok: false, reason: 'SETTLEMENT_DISABLED' }

  const receipt = await provider().getTransactionReceipt(txHash)
  if (!receipt) return { ok: false, reason: 'TX_NOT_FOUND' }
  if (receipt.status !== 1) return { ok: false, reason: 'TX_FAILED' }

  const confirmations = await receipt.confirmations()
  if (confirmations < minConfirmations) {
    return {
      ok: false,
      reason: 'TX_NOT_CONFIRMED',
      detail: { confirmations, required: minConfirmations },
    }
  }

  // Find a USDC Transfer log crediting the treasury. Reading the log rather
  // than the transaction's `to`/`value` is what makes this work for transfers
  // sent through a contract or a batch.
  const contract = usdcContract()
  const transferTopic = contract.interface.getEvent('Transfer')!.topicHash
  const usdc = config.usdcAddress.toLowerCase()

  let credited = 0n
  let sender = ''
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== usdc) continue
    if (log.topics[0] !== transferTopic) continue
    const parsed = contract.interface.parseLog({
      topics: [...log.topics],
      data: log.data,
    })
    if (!parsed) continue
    const to = (parsed.args[1] as string).toLowerCase()
    if (to !== bankAddress.toLowerCase()) continue
    credited += parsed.args[2] as bigint
    sender = parsed.args[0] as string
  }

  if (credited === 0n) {
    const anyUsdc = receipt.logs.some((l) => l.address.toLowerCase() === usdc)
    return {
      ok: false,
      reason: anyUsdc ? 'WRONG_RECIPIENT' : 'NOT_A_USDC_TRANSFER',
      detail: { expected_recipient: bankAddress, token: config.usdcAddress },
    }
  }

  const cents = baseUnitsToCents(credited)
  if (cents === null || cents < MIN_DEPOSIT_CENTS) {
    return {
      ok: false,
      reason: 'DUST_AMOUNT',
      detail: {
        received: formatUsdc(credited),
        note: 'Deposits must be a whole number of cents (a multiple of 0.01 USDC).',
      },
    }
  }

  return {
    ok: true,
    deposit: {
      txHash,
      from: sender,
      to: bankAddress,
      amountCents: cents,
      amountUsdc: formatUsdc(credited),
      confirmations,
      chainId: config.chainId,
      explorerUrl: `${config.explorer}/tx/${txHash}`,
    },
  }
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

export interface SubmittedWithdrawal {
  txHash: string
  to: string
  amountCents: number
  amountUsdc: string
  chainId: number
  explorerUrl: string
}

export function isValidAddress(address: string): boolean {
  return isAddress(address)
}

/** What the treasury can actually pay out right now. */
export async function treasuryBalanceCents(): Promise<number | null> {
  const address = treasuryAddress()
  if (!address) return null
  const raw = (await usdcContract().balanceOf(address)) as bigint
  return baseUnitsToCents(raw - (raw % CENTS_TO_BASE)) ?? 0
}

/**
 * Send USDC from the treasury.
 *
 * Returns as soon as the transaction is broadcast rather than waiting for it
 * to be mined: the caller has already debited the ledger, and blocking a
 * serverless request on block confirmation would time out. The hash is
 * recorded so the withdrawal can be reconciled afterwards.
 */
export async function submitWithdrawal(
  toAddress: string,
  amountCents: number
): Promise<SubmittedWithdrawal> {
  const signer = treasury()
  if (!signer) throw new Error('Settlement is disabled: TREASURY_PRIVATE_KEY is unset')
  if (!isValidAddress(toAddress)) throw new Error(`Invalid address: ${toAddress}`)

  const config = chainConfig()
  const amount = centsToBaseUnits(amountCents)
  const tx = await usdcContract(signer).transfer(toAddress, amount)

  return {
    txHash: tx.hash,
    to: toAddress,
    amountCents,
    amountUsdc: formatUsdc(amount),
    chainId: config.chainId,
    explorerUrl: `${config.explorer}/tx/${tx.hash}`,
  }
}
