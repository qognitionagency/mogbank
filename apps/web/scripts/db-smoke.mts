/**
 * Integration smoke test for the Neon data layer (src/lib/db.ts).
 *
 * Exercises every query shape the API routes use against the real database,
 * then cleans up after itself. Run with a Neon connection string:
 *
 *   DATABASE_URL=postgres://... node scripts/db-smoke.mts
 */

import { createClient, query } from '../src/lib/db.ts'

const db = createClient()
let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`, ok ? '' : JSON.stringify(extra))
  if (!ok) failures++
}

// 1. insert + select().single() with jsonb payload
const { data: agent, error: agentErr } = await db.from('agents').insert({
  wallet_address: '0xTEST' + Date.now(),
  public_key: 'pk_test',
  principal_address: '0xprincipal',
  agent_type: 'langchain',
  kya_score: 72,
  kya_status: 'verified',
  email: 'a@example.com',
  metadata: { framework: 'langchain', kya_version: 'KYA-7' },
}).select().single()
check('insert agent + single()', !agentErr && !!agent?.id, agentErr)
check('jsonb round-trip', agent?.metadata?.framework === 'langchain', agent?.metadata)
check('timestamptz is ISO string', typeof agent?.created_at === 'string' && agent.created_at.endsWith('Z'), agent?.created_at)

// 2. text[] column
const { error: scErr } = await db.from('spending_controls').insert({
  agent_id: agent.id, daily_limit: 1000000000, session_limit: 100000000,
  allowed_currencies: ['USDC', 'AED'], counterparty_allowlist: [], counterparty_blocklist: [],
  rate_limit_per_minute: 100,
})
check('insert text[] columns', !scErr, scErr)
const { data: sc } = await db.from('spending_controls')
  .select('daily_limit, session_limit, allowed_currencies, counterparty_blocklist')
  .eq('agent_id', agent.id).single()
check('text[] round-trip', Array.isArray(sc?.allowed_currencies) && sc.allowed_currencies[0] === 'USDC', sc)
check('bigint is a number', typeof sc?.daily_limit === 'number', typeof sc?.daily_limit)

// 3. wallets + arithmetic + update
const { data: w1 } = await db.from('wallets').insert({ agent_id: agent.id, currency: 'USDC', wallet_type: 'custody', balance: 5000, status: 'active' }).select().single()
const { data: w2 } = await db.from('wallets').insert({ agent_id: agent.id, currency: 'USDC', wallet_type: 'escrow', balance: 0, status: 'active' }).select().single()
check('balance is a number', typeof w1?.balance === 'number', typeof w1?.balance)
const { error: updErr } = await db.from('wallets').update({ balance: w1.balance - 1200 }).eq('id', w1.id)
check('update without select', !updErr, updErr)
const { data: w1b } = await db.from('wallets').select('id, balance, status').eq('id', w1.id).single()
check('update applied', w1b?.balance === 3800, w1b)

// 4. single() on zero rows -> PGRST116
const { data: none, error: noneErr } = await db.from('agents').select('*').eq('id', '00000000-0000-0000-0000-000000000000').single()
check('single() 0 rows -> PGRST116', none === null && noneErr?.code === 'PGRST116', noneErr)

// 5. embedded select: table!inner(*)
const { data: joined, error: joinErr } = await db.from('wallets').select('*, agents!inner(*)').eq('id', w1.id).single()
check('embed agents!inner(*)', !joinErr && joined?.agents?.email === 'a@example.com', joinErr ?? joined?.agents)

// 6. embedded select: alias:fk(cols)
const { data: svc } = await db.from('services').insert({ seller_agent_id: agent.id, name: 'Test svc', description: 'd', price: 500, currency: 'USDC', status: 'active' }).select().single()
const { data: svcs, error: svcErr } = await db.from('services')
  .select('*, agents:seller_agent_id(wallet_address, agent_type)')
  .eq('status', 'active').order('created_at', { ascending: false })
check('embed alias:fk(cols)', !svcErr && svcs?.[0]?.agents?.agent_type === 'langchain', svcErr ?? svcs?.[0])

// 7. multi-row insert
const { error: multiErr } = await db.from('transactions').insert([
  { wallet_id: w1.id, counterparty_wallet_id: w2.id, type: 'transfer', amount: 1200, fee: 2, status: 'confirmed', ledger_entry: 'debit', protocol: 'x402', metadata: { note: 'a' } },
  { wallet_id: w2.id, counterparty_wallet_id: w1.id, type: 'transfer', amount: 1200, fee: 0, status: 'confirmed', ledger_entry: 'credit', protocol: 'x402', metadata: {} },
])
check('multi-row insert', !multiErr, multiErr)

// 7b. Ragged multi-row insert: one row sets `id`, the other leaves it to the
// column default. Absent keys must fall through to DEFAULT, not NULL — the
// a2a payment route relies on exactly this shape.
const pinnedId = '11111111-2222-3333-4444-555555555555'
const { error: raggedErr } = await db.from('transactions').insert([
  { id: pinnedId, wallet_id: w1.id, counterparty_wallet_id: w2.id, type: 'payment', amount: 250, fee: 1, status: 'confirmed', ledger_entry: 'debit', protocol: 'a2a' },
  { wallet_id: w2.id, counterparty_wallet_id: w1.id, type: 'payment', amount: 250, fee: 0, status: 'confirmed', ledger_entry: 'credit', protocol: 'a2a' },
])
check('ragged multi-row insert', !raggedErr, raggedErr)
const { data: a2aRows } = await db.from('transactions').select('id, ledger_entry').eq('protocol', 'a2a')
check('both a2a rows landed', a2aRows?.length === 2, a2aRows)
check('explicit id honoured', a2aRows?.some((r: any) => r.id === pinnedId), a2aRows)
check('defaulted id generated', a2aRows?.every((r: any) => !!r.id), a2aRows)

// 8. .or() + .limit() + .order()
const { data: txs, error: orErr } = await db.from('transactions')
  .select('*').or(`wallet_id.eq.${w1.id},counterparty_wallet_id.eq.${w1.id}`)
  .order('created_at', { ascending: false }).limit(10)
check('.or() filter', !orErr && txs?.length === 4, orErr ?? txs?.length)

// 9. .not(col,'is',null)
const { data: ledger, error: notErr } = await db.from('transactions').select('*').eq('wallet_id', w1.id).not('ledger_entry', 'is', null).order('created_at', { ascending: false }).limit(50)
check('.not(is,null)', !notErr && ledger?.length === 2, notErr ?? ledger?.length)

// 10. .gte() on timestamps
const midnight = new Date(); midnight.setHours(0,0,0,0)
const { data: today, error: gteErr } = await db.from('transactions').select('amount').eq('wallet_id', w1.id).gte('created_at', midnight.toISOString())
check('.gte() timestamp', !gteErr && today?.length === 2, gteErr ?? today)

// 11. rpc()
const { data: rpcOut, error: rpcErr } = await db.rpc('process_transfer', {
  p_from_wallet_id: w1.id, p_to_wallet_id: w2.id, p_amount: 100, p_fee: 1, p_protocol: 'x402',
})
check('rpc process_transfer', !rpcErr && rpcOut === true, rpcErr ?? rpcOut)

// 12. constraint violation surfaces as error, not a throw
const { error: dupErr } = await db.from('wallets').insert({ agent_id: agent.id, currency: 'USDC', wallet_type: 'custody', balance: 0 })
check('constraint error surfaces', !!dupErr, dupErr)

// 13. injection attempt is rejected, not executed
const { error: injErr } = await db.from('agents').select('*').eq('id; DROP TABLE agents; --', 'x')
check('bad identifier rejected', !!injErr, injErr)
const stillThere = await query('SELECT count(*)::int AS n FROM agents')
check('agents table intact', (stillThere[0] as any).n >= 1, stillThere)

// 14. one-to-many embed (children as arrays), as GET /api/v1/agents/[id] uses
const { data: full, error: fullErr } = await db.from('agents')
  .select(`*, wallets (*), spending_controls (*), kya_score_history (*)`)
  .eq('id', agent.id).single()
check('embed children as arrays', !fullErr && Array.isArray(full?.wallets) && full.wallets.length === 2, fullErr ?? full?.wallets)
check('embed child with no rows -> []', Array.isArray(full?.kya_score_history) && full.kya_score_history.length === 0, full?.kya_score_history)
check('embed one-row child still an array', Array.isArray(full?.spending_controls) && full.spending_controls[0]?.rate_limit_per_minute === 100, full?.spending_controls)

// 15. delete — transactions.counterparty_wallet_id has no ON DELETE rule, so
// the cascade from agents -> wallets is blocked. The adapter must report that
// as an error rather than throwing or silently succeeding.
const { error: blockedErr } = await db.from('agents').delete().eq('id', agent.id)
check('delete blocked by FK reports error', blockedErr?.code === '23503', blockedErr)
await query('DELETE FROM transactions WHERE wallet_id = $1 OR counterparty_wallet_id = $1', [w1.id])
await query('DELETE FROM transactions WHERE wallet_id = $1 OR counterparty_wallet_id = $1', [w2.id])
const { error: delErr } = await db.from('agents').delete().eq('id', agent.id)
check('delete succeeds once refs are gone', !delErr, delErr)
const { data: gone } = await db.from('agents').select('id').eq('id', agent.id)
check('delete + cascade', gone?.length === 0, gone)
void svc

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
