'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { TopNav, KyaRadar, StatCard, Badge } from '@/components/ui'

interface AgentInfo {
  id: string
  name: string
  public_key_hash: string
  kya_score: number
  kya_dimensions: Record<string, number>
  status: string
  created_at: string
}

interface WalletInfo {
  id: string
  agent_id: string
  address: string
  balance: number
  currency: string
  status: string
  created_at: string
}

interface Transaction {
  id: string
  tx_hash: string
  from_wallet_id: string
  to_wallet_id: string
  amount: number
  currency: string
  status: string
  created_at: string
}

interface LedgerEntry {
  id: string
  wallet_id: string
  entry_type: string
  amount: number
  balance_after: number
  description: string
  created_at: string
}

type TabId = 'overview' | 'transactions' | 'ledger' | 'scoring'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'scoring', label: 'KYA-7 Score' },
]

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [balance, setBalance] = useState<number | null>(null)

  const fetchAgentData = useCallback(async () => {
    const storedAgent = localStorage.getItem('mogbank_agent')
    if (!storedAgent) {
      setLoading(false)
      return
    }

    const parsed = JSON.parse(storedAgent)
    try {
      const [agentRes, walletRes] = await Promise.all([
        fetch(`/api/v1/agents/${parsed.id}`),
        fetch(`/api/v1/wallets/agent/${parsed.id}`),
      ])

      if (agentRes.ok) {
        const agentData = await agentRes.json()
        setAgent(agentData.agent || agentData)
      }

      if (walletRes.ok) {
        const walletData = await walletRes.json()
        const w = walletData.wallet || walletData
        setWallet(w)
        setBalance(w.balance)

        const txRes = await fetch(`/api/v1/wallets/${w.id}/transactions`)
        if (txRes.ok) {
          const txData = await txRes.json()
          setTransactions(txData.transactions || txData || [])
        }

        const ledgerRes = await fetch(`/api/v1/wallets/${w.id}/ledger`)
        if (ledgerRes.ok) {
          const ledgerData = await ledgerRes.json()
          setLedger(ledgerData.entries || ledgerData || [])
        }
      }
    } catch (err) {
      console.error('Failed to fetch agent data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgentData()
  }, [fetchAgentData])

  useEffect(() => {
    if (!wallet?.id) return

    setWsStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onopen = () => {
      setWsStatus('connected')
      ws.send(JSON.stringify({ type: 'subscribe', channel: `wallet:${wallet.id}:balance` }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'balance_update' && msg.data) setBalance(msg.data.balance)
      } catch {}
    }
    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')

    return () => ws.close()
  }, [wallet?.id])

  const formatUsdc = (cents: number) => `$${(cents / 100).toFixed(2)} USDC`

  const kyaAccent = (score: number): 'cyan' | 'yellow' | 'red' | 'muted' => {
    if (score >= 80) return 'cyan'
    if (score >= 50) return 'yellow'
    return 'red'
  }

  const kyaColor = (score: number) => {
    if (score >= 80) return '#47ffe8'
    if (score >= 50) return '#e8ff47'
    if (score >= 30) return '#ffb347'
    return '#ff6b47'
  }

  if (loading) {
    return (
      <div className="mog-bg min-h-screen text-[#d0d0e0]">
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-[#e8ff47] border-t-transparent" />
            <p className="font-mono-ds text-sm text-[#6c6c84]">Loading agent dashboard…</p>
          </div>
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="mog-bg min-h-screen text-[#d0d0e0]">
        <TopNav />
        <div className="mx-auto max-w-2xl px-6 pt-24 text-center">
          <div className="mog-reveal mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-[#1a1a2e] bg-[#e8ff47]/10">
            <span className="text-5xl">🤖</span>
          </div>
          <h1 className="mog-reveal font-display text-4xl font-bold tracking-tight" style={{ animationDelay: '80ms' }}>
            Agent Dashboard
          </h1>
          <p className="mog-reveal mt-4 text-[#6c6c84]" style={{ animationDelay: '160ms' }}>
            Register your AI agent to access the dashboard. Monitor balances, track transactions, and view your KYA-7 trust score.
          </p>
          <div className="mog-reveal mt-8 flex justify-center gap-4" style={{ animationDelay: '240ms' }}>
            <Link href="/developers" className="mog-btn mog-btn-primary">Register Agent</Link>
            <Link href="/" className="mog-btn mog-btn-ghost">Learn More</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mog-bg min-h-screen text-[#d0d0e0]">
      <TopNav />

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-[#1a1a2e] p-4 flex flex-col gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-left px-4 py-3 rounded-xl font-mono-ds text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#e8ff47]/10 text-[#e8ff47] border border-[#e8ff47]/20'
                  : 'text-[#6c6c84] hover:text-[#d0d0e0] hover:bg-[#0a0a18]'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-[#1a1a2e]">
            <Badge tone={wsStatus === 'connected' ? 'green' : wsStatus === 'connecting' ? 'yellow' : 'red'}>
              <span className={`h-1.5 w-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-[#47ffe8] mog-glow' : wsStatus === 'connecting' ? 'bg-[#e8ff47] animate-pulse' : 'bg-[#ff6b47]'}`} />
              {wsStatus}
            </Badge>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="max-w-4xl">
              <h2 className="mog-reveal font-display text-2xl font-bold tracking-tight mb-8">Agent Overview</h2>

              <div className="mog-reveal grid grid-cols-2 gap-4 mb-6" style={{ animationDelay: '60ms' }}>
                <div className="mog-card-quiet p-5">
                  <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Agent ID</div>
                  <div className="font-mono-ds text-sm text-[#47ffe8] break-all">{agent.id}</div>
                </div>
                <div className="mog-card-quiet p-5">
                  <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Public Key Hash</div>
                  <div className="font-mono-ds text-sm text-[#b347ff] break-all">{agent.public_key_hash}</div>
                </div>
              </div>

              {wallet && (
                <div className="mog-card mog-reveal p-8 mb-6" style={{ animationDelay: '120ms' }}>
                  <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Wallet Balance</div>
                  <div className="mog-stat-value text-5xl text-[#e8ff47]">
                    {balance !== null ? formatUsdc(balance) : formatUsdc(wallet.balance)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 font-mono-ds text-sm text-[#6c6c84]">
                    <span>Address: <code className="text-[#47ffe8]">{wallet.address}</code></span>
                    <span>Status: <span className="text-[#47ffe8]">{wallet.status}</span></span>
                  </div>
                </div>
              )}

              <div className="mog-reveal grid grid-cols-4 gap-4 mb-6" style={{ animationDelay: '180ms' }}>
                <StatCard label="Transactions" value={transactions.length} accent="cyan" delay={0} />
                <StatCard label="Ledger Entries" value={ledger.length} accent="yellow" delay={60} />
                <StatCard label="KYA-7 Score" value={agent.kya_score} accent={kyaAccent(agent.kya_score)} delay={120} />
                <StatCard label="Status" value={agent.status === 'active' ? '✓ Active' : agent.status} accent="muted" delay={180} />
              </div>

              <div className="mog-card-quiet mog-reveal p-6" style={{ animationDelay: '240ms' }}>
                <h3 className="font-display font-bold mb-4">Recent Activity</h3>
                {ledger.length === 0 ? (
                  <p className="font-mono-ds text-sm text-[#6c6c84]">No activity yet. Visit the faucet to get started.</p>
                ) : (
                  <div className="space-y-3">
                    {ledger.slice(0, 5).map(entry => (
                      <div key={entry.id} className="flex justify-between items-center py-2 border-b border-[#1a1a2e] last:border-0">
                        <div className="flex items-center gap-3">
                          <Badge tone={entry.entry_type === 'credit' ? 'green' : 'red'}>
                            {entry.entry_type.toUpperCase()}
                          </Badge>
                          <span className="text-sm text-[#6c6c84]">{entry.description}</span>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono-ds text-sm ${entry.entry_type === 'credit' ? 'text-[#47ffe8]' : 'text-[#ff6b47]'}`}>
                            {entry.entry_type === 'credit' ? '+' : '-'}{formatUsdc(entry.amount)}
                          </div>
                          <div className="font-mono-ds text-[0.65rem] text-[#444]">{new Date(entry.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div className="max-w-4xl">
              <h2 className="mog-reveal font-display text-2xl font-bold tracking-tight mb-8">Transaction History</h2>
              {transactions.length === 0 ? (
                <div className="mog-card-quiet p-12 text-center">
                  <div className="text-4xl mb-4">💰</div>
                  <p className="font-mono-ds text-[#6c6c84]">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map((tx, i) => (
                    <div key={tx.id} className="mog-card-quiet mog-reveal p-6" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-1">TX Hash</div>
                          <div className="font-mono-ds text-sm text-[#47ffe8] break-all">{tx.tx_hash}</div>
                        </div>
                        <Badge tone={tx.status === 'completed' ? 'green' : tx.status === 'pending' ? 'yellow' : 'red'}>
                          {tx.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-1">From</div>
                          <div className="font-mono-ds text-[#b347ff] text-xs break-all">{tx.from_wallet_id}</div>
                        </div>
                        <div>
                          <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-1">To</div>
                          <div className="font-mono-ds text-[#b347ff] text-xs break-all">{tx.to_wallet_id}</div>
                        </div>
                        <div>
                          <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-1">Amount</div>
                          <div className="font-display font-bold text-[#e8ff47]">{formatUsdc(tx.amount)}</div>
                        </div>
                      </div>
                      <div className="mt-4 font-mono-ds text-[0.65rem] text-[#444]">{new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ledger Tab */}
          {activeTab === 'ledger' && (
            <div className="max-w-4xl">
              <h2 className="mog-reveal font-display text-2xl font-bold tracking-tight mb-2">Double-Entry Ledger</h2>
              <p className="mog-reveal font-mono-ds text-sm text-[#6c6c84] mb-8" style={{ animationDelay: '60ms' }}>
                Every balance change is recorded as a credit/debit pair. Immutable audit trail.
              </p>
              {ledger.length === 0 ? (
                <div className="mog-card-quiet p-12 text-center">
                  <div className="text-4xl mb-4">📒</div>
                  <p className="font-mono-ds text-[#6c6c84]">No ledger entries yet</p>
                </div>
              ) : (
                <div className="mog-card-quiet mog-reveal overflow-x-auto" style={{ animationDelay: '80ms' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1a1a2e] text-left">
                        <th className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">Entry ID</th>
                        <th className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">Type</th>
                        <th className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">Amount</th>
                        <th className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">Balance After</th>
                        <th className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">Description</th>
                        <th className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map(entry => (
                        <tr key={entry.id} className="border-b border-[#1a1a2e]/50 hover:bg-[#0a0a18] transition-colors">
                          <td className="py-3 px-4 font-mono-ds text-sm text-[#47ffe8]">{entry.id.slice(0, 8)}…</td>
                          <td className="py-3 px-4">
                            <Badge tone={entry.entry_type === 'credit' ? 'green' : 'red'}>
                              {entry.entry_type.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-mono-ds">{formatUsdc(entry.amount)}</td>
                          <td className="py-3 px-4 font-mono-ds">{formatUsdc(entry.balance_after)}</td>
                          <td className="py-3 px-4 text-[#888]">{entry.description}</td>
                          <td className="py-3 px-4 font-mono-ds text-[0.65rem] text-[#444]">{new Date(entry.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* KYA-7 Scoring Tab */}
          {activeTab === 'scoring' && (
            <div className="max-w-4xl">
              <h2 className="mog-reveal font-display text-2xl font-bold tracking-tight mb-2">KYA-7 Trust Scoring</h2>
              <p className="mog-reveal font-mono-ds text-sm text-[#6c6c84] mb-8" style={{ animationDelay: '60ms' }}>
                Know Your Agent — 7-dimensional reputation scoring for autonomous agents.
              </p>

              <div className="mog-card mog-reveal p-8 mb-8 text-center" style={{ animationDelay: '120ms' }}>
                <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Overall KYA-7 Score</div>
                <div className="mog-stat-value text-6xl mb-2" style={{ color: kyaColor(agent.kya_score) }}>
                  {agent.kya_score}
                </div>
                <div className="font-mono-ds text-sm text-[#6c6c84]">out of 100</div>
                <div className="mt-4 w-full bg-[#07070f] rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all duration-500"
                    style={{ width: `${agent.kya_score}%`, backgroundColor: kyaColor(agent.kya_score) }}
                  />
                </div>
                <div className="mt-8">
                  <KyaRadar scores={agent.kya_dimensions} />
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'identity_verification', label: 'Identity Verification', desc: 'Ed25519 key verification and credential chain' },
                  { key: 'transaction_history', label: 'Transaction History', desc: 'Volume, frequency, and consistency of on-chain activity' },
                  { key: 'delegate_reliability', label: 'Delegate Reliability', desc: 'Success rate of delegated task execution' },
                  { key: 'protocol_compliance', label: 'Protocol Compliance', desc: 'Adherence to ABOS/x402 standards' },
                  { key: 'liquidity_depth', label: 'Liquidity Depth', desc: 'Average balance and reserve ratios' },
                  { key: 'response_time', label: 'Response Time', desc: 'Latency in responding to blockchain events' },
                  { key: 'dispute_resolution', label: 'Dispute Resolution', desc: 'Rate of successful dispute resolution' },
                ].map((dim, i) => {
                  const score = agent.kya_dimensions?.[dim.key] ?? 0
                  return (
                    <div key={dim.key} className="mog-card-quiet mog-reveal p-5" style={{ animationDelay: `${160 + i * 40}ms` }}>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <div className="font-display font-bold text-sm">{dim.label}</div>
                          <div className="font-mono-ds text-[0.65rem] text-[#6c6c84]">{dim.desc}</div>
                        </div>
                        <div className="mog-stat-value text-2xl" style={{ color: kyaColor(score) }}>{score}</div>
                      </div>
                      <div className="w-full bg-[#07070f] rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: `${score}%`, backgroundColor: kyaColor(score) }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
