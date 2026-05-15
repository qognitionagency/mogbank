'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

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

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'ledger' | 'scoring'>('overview')
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

        // Fetch transactions
        const txRes = await fetch(`/api/v1/wallets/${w.id}/transactions`)
        if (txRes.ok) {
          const txData = await txRes.json()
          setTransactions(txData.transactions || txData || [])
        }

        // Fetch ledger
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

  // WebSocket connection for real-time balance updates
  useEffect(() => {
    if (!wallet?.id) return

    setWsStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onopen = () => {
      setWsStatus('connected')
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `wallet:${wallet.id}:balance`,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'balance_update' && msg.data) {
          setBalance(msg.data.balance)
        }
      } catch {}
    }

    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')

    return () => {
      ws.close()
    }
  }, [wallet?.id])

  const formatUsdc = (cents: number) => `$${(cents / 100).toFixed(2)} USDC`

  const kyaColor = (score: number) => {
    if (score >= 80) return '#47ffe8'
    if (score >= 50) return '#e8ff47'
    if (score >= 30) return '#ffb347'
    return '#ff6b47'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] text-[#d0d0e0] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#e8ff47] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#666]">Loading agent dashboard...</p>
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-[#07070f] text-[#d0d0e0] p-8">
        <div className="max-w-2xl mx-auto text-center pt-20">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-[#e8ff47]/20 flex items-center justify-center">
            <span className="text-5xl">🤖</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">Agent Dashboard</h1>
          <p className="text-[#666] text-lg mb-8">
            Register your AI agent to access the dashboard. Monitor balances, track transactions, and view your KYA-7 trust score.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/developers" className="px-8 py-4 bg-[#e8ff47] text-[#07070f] font-mono font-bold rounded-lg hover:opacity-90 transition-opacity">
              Register Agent
            </Link>
            <Link href="/" className="px-8 py-4 border border-[#1a1a2a] text-[#666] font-mono rounded-lg hover:border-[#e8ff47] hover:text-[#e8ff47] transition-colors">
              Learn More
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      {/* Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </Link>
          <div>
            <h1 className="font-mono text-lg">Agent Dashboard</h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-[#47ffe8]' : wsStatus === 'connecting' ? 'bg-[#e8ff47] animate-pulse' : 'bg-[#ff6b47]'}`} />
              <span className="text-xs text-[#666]">{wsStatus}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/faucet" className="px-4 py-2 border border-[#47ffe8]/30 text-[#47ffe8] text-sm rounded-lg hover:bg-[#47ffe8]/10">💧 Faucet</Link>
          <Link href="/marketplace" className="px-4 py-2 border border-[#b347ff]/30 text-[#b347ff] text-sm rounded-lg hover:bg-[#b347ff]/10">Marketplace</Link>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <aside className="w-64 border-r border-[#1a1a2a] p-4 flex flex-col gap-2">
          {[
            { id: 'overview', label: '📊 Overview', icon: '📊' },
            { id: 'transactions', label: '💰 Transactions', icon: '💰' },
            { id: 'ledger', label: '📒 Ledger', icon: '📒' },
            { id: 'scoring', label: '🔐 KYA-7 Score', icon: '🔐' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`text-left px-4 py-3 rounded-lg font-mono text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#e8ff47]/10 text-[#e8ff47] border border-[#e8ff47]/20'
                  : 'text-[#666] hover:text-[#d0d0e0] hover:bg-[#0a0a12]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold mb-8">Agent Overview</h2>

              {/* Agent Info Card */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-xl">
                  <div className="text-xs text-[#666] font-mono mb-2">AGENT ID</div>
                  <div className="font-mono text-sm text-[#47ffe8] break-all">{agent.id}</div>
                </div>
                <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-xl">
                  <div className="text-xs text-[#666] font-mono mb-2">PUBLIC KEY HASH</div>
                  <div className="font-mono text-sm text-[#b347ff] break-all">{agent.public_key_hash}</div>
                </div>
              </div>

              {/* Balance Card */}
              {wallet && (
                <div className="p-8 bg-gradient-to-br from-[#0a0a12] to-[#07070f] border border-[#1a1a2a] rounded-2xl mb-8">
                  <div className="text-xs text-[#666] font-mono mb-2">WALLET BALANCE</div>
                  <div className="text-5xl font-bold text-[#e8ff47] mb-4">
                    {balance !== null ? formatUsdc(balance) : formatUsdc(wallet.balance)}
                  </div>
                  <div className="flex gap-4 text-sm text-[#666]">
                    <span>Address: <code className="text-[#47ffe8]">{wallet.address}</code></span>
                    <span>Status: <span className="text-[#47ffe8]">{wallet.status}</span></span>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg text-center">
                  <div className="text-2xl font-bold text-[#47ffe8]">{transactions.length}</div>
                  <div className="text-xs text-[#666] mt-1">Transactions</div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg text-center">
                  <div className="text-2xl font-bold text-[#e8ff47]">{ledger.length}</div>
                  <div className="text-xs text-[#666] mt-1">Ledger Entries</div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg text-center">
                  <div className="text-2xl font-bold" style={{ color: kyaColor(agent.kya_score) }}>{agent.kya_score}</div>
                  <div className="text-xs text-[#666] mt-1">KYA-7 Score</div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg text-center">
                  <div className="text-2xl font-bold text-[#b347ff]">{agent.status === 'active' ? '✓' : agent.status}</div>
                  <div className="text-xs text-[#666] mt-1">Status</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-xl">
                <h3 className="font-bold mb-4">Recent Activity</h3>
                {ledger.length === 0 ? (
                  <p className="text-[#666] text-sm">No activity yet. Visit the faucet to get started.</p>
                ) : (
                  <div className="space-y-3">
                    {ledger.slice(0, 5).map(entry => (
                      <div key={entry.id} className="flex justify-between items-center py-2 border-b border-[#1a1a2a] last:border-0">
                        <div>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            entry.entry_type === 'credit' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' : 'bg-[#ff6b47]/20 text-[#ff6b47]'
                          }`}>
                            {entry.entry_type.toUpperCase()}
                          </span>
                          <span className="ml-3 text-sm text-[#666]">{entry.description}</span>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono text-sm ${entry.entry_type === 'credit' ? 'text-[#47ffe8]' : 'text-[#ff6b47]'}`}>
                            {entry.entry_type === 'credit' ? '+' : '-'}{formatUsdc(entry.amount)}
                          </div>
                          <div className="text-xs text-[#444]">{new Date(entry.created_at).toLocaleString()}</div>
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
              <h2 className="text-2xl font-bold mb-8">Transaction History</h2>
              {transactions.length === 0 ? (
                <div className="text-center py-12 border border-[#1a1a2a] rounded-xl">
                  <div className="text-4xl mb-4">💰</div>
                  <p className="text-[#666]">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map(tx => (
                    <div key={tx.id} className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-xl">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-xs font-mono text-[#666] mb-1">TX HASH</div>
                          <div className="font-mono text-sm text-[#47ffe8] break-all">{tx.tx_hash}</div>
                        </div>
                        <span className={`px-3 py-1 rounded text-xs font-mono ${
                          tx.status === 'completed' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' :
                          tx.status === 'pending' ? 'bg-[#e8ff47]/20 text-[#e8ff47]' :
                          'bg-[#ff6b47]/20 text-[#ff6b47]'
                        }`}>
                          {tx.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-[#666] mb-1">From</div>
                          <div className="font-mono text-[#b347ff]">{tx.from_wallet_id}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#666] mb-1">To</div>
                          <div className="font-mono text-[#b347ff]">{tx.to_wallet_id}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#666] mb-1">Amount</div>
                          <div className="font-bold text-[#e8ff47]">{formatUsdc(tx.amount)}</div>
                        </div>
                      </div>
                      <div className="mt-4 text-xs text-[#444]">{new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ledger Tab */}
          {activeTab === 'ledger' && (
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold mb-4">Double-Entry Ledger</h2>
              <p className="text-[#666] text-sm mb-8">Every balance change is recorded as a credit/debit pair. Immutable audit trail.</p>
              {ledger.length === 0 ? (
                <div className="text-center py-12 border border-[#1a1a2a] rounded-xl">
                  <div className="text-4xl mb-4">📒</div>
                  <p className="text-[#666]">No ledger entries yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1a1a2a] text-[#666] text-left">
                        <th className="py-3 px-4 font-mono">Entry ID</th>
                        <th className="py-3 px-4 font-mono">Type</th>
                        <th className="py-3 px-4 font-mono">Amount</th>
                        <th className="py-3 px-4 font-mono">Balance After</th>
                        <th className="py-3 px-4 font-mono">Description</th>
                        <th className="py-3 px-4 font-mono">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map(entry => (
                        <tr key={entry.id} className="border-b border-[#1a1a2a]/50 hover:bg-[#0a0a12] transition-colors">
                          <td className="py-3 px-4 font-mono text-[#47ffe8]">{entry.id.slice(0, 8)}...</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              entry.entry_type === 'credit' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' : 'bg-[#ff6b47]/20 text-[#ff6b47]'
                            }`}>
                              {entry.entry_type.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">{formatUsdc(entry.amount)}</td>
                          <td className="py-3 px-4 font-mono">{formatUsdc(entry.balance_after)}</td>
                          <td className="py-3 px-4 text-[#888]">{entry.description}</td>
                          <td className="py-3 px-4 text-[#444] text-xs">{new Date(entry.created_at).toLocaleString()}</td>
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
              <h2 className="text-2xl font-bold mb-4">KYA-7 Trust Scoring</h2>
              <p className="text-[#666] text-sm mb-8">Know Your Agent — 7-dimensional reputation scoring for autonomous agents.</p>

              {/* Overall Score */}
              <div className="p-8 bg-[#0a0a12] border border-[#1a1a2a] rounded-2xl mb-8 text-center">
                <div className="text-xs text-[#666] font-mono mb-2">OVERALL KYA-7 SCORE</div>
                <div className="text-6xl font-bold mb-2" style={{ color: kyaColor(agent.kya_score) }}>
                  {agent.kya_score}
                </div>
                <div className="text-sm text-[#666]">out of 100</div>
                <div className="mt-4 w-full bg-[#07070f] rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all duration-500"
                    style={{ width: `${agent.kya_score}%`, backgroundColor: kyaColor(agent.kya_score) }}
                  />
                </div>
              </div>

              {/* Dimension Scores */}
              <div className="grid grid-cols-1 gap-4">
                {[
                  { key: 'identity_verification', label: 'Identity Verification', desc: 'Ed25519 key verification and credential chain' },
                  { key: 'transaction_history', label: 'Transaction History', desc: 'Volume, frequency, and consistency of on-chain activity' },
                  { key: 'delegate_reliability', label: 'Delegate Reliability', desc: 'Success rate of delegated task execution' },
                  { key: 'protocol_compliance', label: 'Protocol Compliance', desc: 'Adherence to ABOS/x402 standards' },
                  { key: 'liquidity_depth', label: 'Liquidity Depth', desc: 'Average balance and reserve ratios' },
                  { key: 'response_time', label: 'Response Time', desc: 'Latency in responding to blockchain events' },
                  { key: 'dispute_resolution', label: 'Dispute Resolution', desc: 'Rate of successful dispute resolution' },
                ].map(dim => {
                  const score = agent.kya_dimensions?.[dim.key] ?? 0
                  return (
                    <div key={dim.key} className="p-5 bg-[#0a0a12] border border-[#1a1a2a] rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <div className="font-bold text-sm">{dim.label}</div>
                          <div className="text-xs text-[#666]">{dim.desc}</div>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: kyaColor(score) }}>{score}</div>
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