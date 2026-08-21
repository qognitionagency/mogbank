/**
 * Concurrency test for the atomic ledger (src/lib/ledger.ts).
 *
 * The old read-modify-write lost updates under concurrency, creating money.
 * These cases fire many simultaneous operations at one wallet and assert the
 * books still balance. Run with a Neon connection string:
 *
 *   DATABASE_URL=postgres://... node scripts/ledger-race.mts
 */
import { query } from '../src/lib/db.ts'
import { transferFunds, claimFaucet, lockEscrow, settleEscrow } from '../src/lib/ledger.ts'

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`, ok ? '' : JSON.stringify(extra))
  if (!ok) failures++
}

async function mkAgent(email: string) {
  const [a] = await query<any>(
    `INSERT INTO agents (wallet_address, email, agent_type, kya_score, kya_status)
     VALUES ($1,$2,'custom',80,'verified') RETURNING id`,
    ['0x' + Math.random().toString(16).slice(2, 12) + Date.now(), email]
  )
  return a.id
}
async function mkWallet(agentId: string, balance: number, type = 'custody') {
  const [w] = await query<any>(
    `INSERT INTO wallets (agent_id, currency, wallet_type, balance, status)
     VALUES ($1,'USDC',$2,$3,'active') RETURNING id, balance`,
    [agentId, type, balance]
  )
  return w.id
}
const balOf = async (id: string) =>
  (await query<any>(`SELECT balance FROM wallets WHERE id=$1`, [id]))[0].balance

// ---------------------------------------------------------------- 1. no lost updates
{
  const a = await mkAgent(`race-a-${Date.now()}@x.io`)
  const b = await mkAgent(`race-b-${Date.now()}@x.io`)
  const from = await mkWallet(a, 10_000)
  const to = await mkWallet(b, 0)

  const N = 40, AMT = 100
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      transferFunds({ fromWalletId: from, toWalletId: to, amount: AMT, fee: 0,
        protocol: 'x402', type: 'transfer', txHash: `race-${i}` })
    )
  )
  const okCount = results.filter((r) => r.ok).length
  const fromBal = await balOf(from), toBal = await balOf(to)

  check('40 concurrent transfers all succeed', okCount === N, okCount)
  check('sender debited exactly once per transfer', fromBal === 10_000 - N * AMT, { fromBal, expected: 10_000 - N * AMT })
  check('recipient credited exactly once per transfer', toBal === N * AMT, { toBal, expected: N * AMT })
  check('money is conserved', fromBal + toBal === 10_000, { fromBal, toBal })

  const [{ count }] = await query<any>(
    `SELECT count(*)::int FROM transactions WHERE wallet_id=$1 AND ledger_entry='debit'`, [from])
  check('one debit ledger row per transfer', count === N, count)
}

// ---------------------------------------------------------------- 2. overdraft race
{
  const a = await mkAgent(`od-a-${Date.now()}@x.io`)
  const b = await mkAgent(`od-b-${Date.now()}@x.io`)
  const from = await mkWallet(a, 500)
  const to = await mkWallet(b, 0)

  // Ten simultaneous attempts to spend 100 from a balance of 500: exactly five
  // must win. The old code let all ten through.
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      transferFunds({ fromWalletId: from, toWalletId: to, amount: 100, fee: 0,
        protocol: 'x402', type: 'transfer', txHash: `od-${i}` })
    )
  )
  const won = results.filter((r) => r.ok).length
  const fromBal = await balOf(from), toBal = await balOf(to)
  check('exactly 5 of 10 overdraft-racing transfers win', won === 5, won)
  check('balance floors at 0, never negative', fromBal === 0, fromBal)
  check('no money created under contention', fromBal + toBal === 500, { fromBal, toBal })
  check('losers report INSUFFICIENT_FUNDS',
    results.filter((r) => !r.ok).every((r: any) => r.reason === 'INSUFFICIENT_FUNDS'),
    results.filter((r: any) => !r.ok).map((r: any) => r.reason))
}

// ---------------------------------------------------------------- 3. fee accounting
{
  const a = await mkAgent(`fee-a-${Date.now()}@x.io`)
  const b = await mkAgent(`fee-b-${Date.now()}@x.io`)
  const from = await mkWallet(a, 1000), to = await mkWallet(b, 0)
  const r = await transferFunds({ fromWalletId: from, toWalletId: to, amount: 400, fee: 6,
    protocol: 'x402', type: 'transfer', txHash: 'fee-1' })
  check('transfer with fee succeeds', r.ok, r)
  check('sender pays amount + fee', (await balOf(from)) === 1000 - 406, await balOf(from))
  check('recipient receives amount only', (await balOf(to)) === 400, await balOf(to))
  const rows = await query<any>(
    `SELECT ledger_entry, amount, fee FROM transactions WHERE wallet_id=$1 ORDER BY ledger_entry`, [from])
  check('fee recorded as its own fee_debit row',
    rows.some((x: any) => x.ledger_entry === 'fee_debit' && x.fee === 6), rows)
}

// ---------------------------------------------------------------- 4. rejects
{
  const a = await mkAgent(`rej-${Date.now()}@x.io`)
  const from = await mkWallet(a, 100)
  const frozen = await mkWallet(a, 0, 'hot')
  await query(`UPDATE wallets SET status='frozen' WHERE id=$1`, [frozen])

  const r1 = await transferFunds({ fromWalletId: from, toWalletId: frozen, amount: 10, fee: 0,
    protocol: 'x402', type: 'transfer', txHash: 'r1' })
  check('frozen recipient rejected', !r1.ok, r1)
  check('nothing debited on rejection', (await balOf(from)) === 100, await balOf(from))

  const missing = '00000000-0000-0000-0000-000000000000'
  const r2 = await transferFunds({ fromWalletId: from, toWalletId: missing, amount: 10, fee: 0,
    protocol: 'x402', type: 'transfer', txHash: 'r2' })
  check('unknown recipient rejected', !r2.ok && (r2 as any).reason === 'WALLET_NOT_FOUND', r2)
  check('still nothing debited', (await balOf(from)) === 100, await balOf(from))

  const r3 = await transferFunds({ fromWalletId: from, toWalletId: from, amount: 10, fee: 0,
    protocol: 'x402', type: 'transfer', txHash: 'r3' })
  check('self-transfer rejected', !r3.ok, r3)
}

// ---------------------------------------------------------------- 5. faucet cooldown race
{
  const a = await mkAgent(`fau-${Date.now()}@x.io`)
  const w = await mkWallet(a, 0)
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      claimFaucet({ agentId: a, walletId: w, amount: 10_000, cooldownHours: 24, txHash: `f-${i}` })
    )
  )
  const won = results.filter((r) => r.ok).length
  check('exactly one of 8 concurrent faucet claims wins', won === 1, won)
  check('wallet credited exactly once', (await balOf(w)) === 10_000, await balOf(w))
  const [{ count }] = await query<any>(`SELECT count(*)::int FROM faucet_claims WHERE agent_id=$1`, [a])
  check('one faucet_claims row', count === 1, count)
  const again = await claimFaucet({ agentId: a, walletId: w, amount: 10_000, cooldownHours: 24, txHash: 'f-x' })
  check('subsequent claim reports cooldown', !again.ok && (again as any).reason === 'COOLDOWN_ACTIVE', again)
}

// ---------------------------------------------------------------- 6. escrow double-release
{
  const buyer = await mkAgent(`esc-b-${Date.now()}@x.io`)
  const seller = await mkAgent(`esc-s-${Date.now()}@x.io`)
  const buyerW = await mkWallet(buyer, 1000)
  const escrowW = await mkWallet(buyer, 0, 'escrow')
  const sellerW = await mkWallet(seller, 0)
  const [svc] = await query<any>(
    `INSERT INTO services (seller_agent_id, name, price, currency, status)
     VALUES ($1,'Svc',300,'USDC','active') RETURNING id`, [seller])

  const lock = await lockEscrow({ buyerWalletId: buyerW, escrowWalletId: escrowW,
    buyerAgentId: buyer, sellerAgentId: seller, serviceId: svc.id, amount: 300, txHash: 'e-1' })
  check('escrow lock succeeds', lock.ok, lock)
  check('buyer debited', (await balOf(buyerW)) === 700, await balOf(buyerW))
  check('funds held in escrow wallet', (await balOf(escrowW)) === 300, await balOf(escrowW))

  const escrowId = (lock as any).escrowId
  const releases = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      settleEscrow({ escrowId, escrowWalletId: escrowW, destinationWalletId: sellerW,
        amount: 300, txHash: `rel-${i}`, outcome: 'released' })
    )
  )
  const relWon = releases.filter((r) => r.ok).length
  check('exactly one of 5 concurrent releases wins', relWon === 1, relWon)
  check('seller paid once', (await balOf(sellerW)) === 300, await balOf(sellerW))
  check('escrow wallet drained to 0', (await balOf(escrowW)) === 0, await balOf(escrowW))
  check('books balance across escrow', (await balOf(buyerW)) + (await balOf(sellerW)) + (await balOf(escrowW)) === 1000)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
