'use client'

import { useState, useEffect, useCallback } from 'react'
import { TopNav, StatCard, Badge } from '@/components/ui'

interface Agent {
  id: string
  wallet_address: string
  kya_score: number
  kya_status: string
  agent_type: string
  email: string
  metadata: { model_name?: string; short_name?: string }
  created_at: string
}

interface Wallet {
  id: string
  agent_id: string
  balance: number
  currency: string
  wallet_type: string
  status: string
}

interface Transaction {
  id: string
  wallet_id: string
  counterparty_wallet_id: string
  type: string
  amount: number
  fee: number
  status: string
  protocol: string
  created_at: string
}

type TabId = 'overview' | 'transactions' | 'agent-detail'

export default function Admin() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(true)

  // The admin endpoints expose every agent's data, so they are gated on the
  // operator key. It is held in sessionStorage rather than a cookie so it is
  // never sent automatically with a cross-site request, and is gone when the
  // tab closes.
  const [adminKey, setAdminKey] = useState('')
  const [keyPrompt, setKeyPrompt] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('mogbank_admin_key')
    if (stored) setAdminKey(stored)
    else setLoading(false)
  }, [])

  const fetchData = useCallback(async (key: string) => {
    if (!key) return
    try {
      const headers = { 'x-admin-key': key }
      const [agentsRes, walletsRes, txRes] = await Promise.all([
        fetch('/api/v1/admin/agents', { headers }),
        fetch('/api/v1/admin/wallets', { headers }),
        fetch('/api/v1/admin/transactions', { headers }),
      ])

      if (agentsRes.status === 401) {
        sessionStorage.removeItem('mogbank_admin_key')
        setAdminKey('')
        setAuthError('That admin key was not accepted.')
        return
      }
      if (agentsRes.status === 503) {
        setAuthError('Admin access is not configured on this deployment (ADMIN_API_KEY is unset).')
        return
      }

      const agentData = await agentsRes.json()
      const walletData = await walletsRes.json()
      const txData = await txRes.json()
      setAuthError(null)
      if (agentData.agents) setAgents(agentData.agents)
      if (walletData.wallets) setWallets(walletData.wallets)
      if (txData.transactions) setTransactions(txData.transactions)
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!adminKey) return
    fetchData(adminKey)
    const interval = setInterval(() => fetchData(adminKey), 30000)
    return () => clearInterval(interval)
  }, [adminKey, fetchData])

  const unlock = (event: React.FormEvent) => {
    event.preventDefault()
    const key = keyPrompt.trim()
    if (!key) return
    sessionStorage.setItem('mogbank_admin_key', key)
    setKeyPrompt('')
    setLoading(true)
    setAdminKey(key)
  }

  const getAgentWallet = (agentId: string) => wallets.find(w => w.agent_id === agentId)
  const getAgent = (agentId: string) => agents.find(a => a.id === agentId)
  const getModelName = (agent: Agent) => agent?.metadata?.model_name || agent?.agent_type

  const totalBankValue = wallets.reduce((sum, w) => sum + w.balance, 0)
  const verifiedAgents = agents.filter(a => a.kya_status === 'verified').length
  const totalFees = transactions.reduce((sum, t) => sum + (t.fee || 0), 0)

  const filteredAgents = agents.filter(a => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (a.email || '').toLowerCase().includes(q) ||
      (a.wallet_address || '').toLowerCase().includes(q) ||
      (getModelName(a) || '').toLowerCase().includes(q) ||
      (a.agent_type || '').toLowerCase().includes(q) ||
      (a.id || '').toLowerCase().includes(q)
  })

  const agentTransactions = selectedAgent
    ? transactions.filter(t => {
        const wallet = getAgentWallet(selectedAgent.id)
        return wallet && (t.wallet_id === wallet.id || t.counterparty_wallet_id === wallet.id)
      })
    : []

  const agentNetInflow = selectedAgent
    ? (() => {
        const wallet = getAgentWallet(selectedAgent.id)
        if (!wallet) return 0
        return transactions.reduce((sum, t) => {
          if (t.counterparty_wallet_id === wallet.id) return sum + t.amount
          if (t.wallet_id === wallet.id) return sum - t.amount
          return sum
        }, 0)
      })()
    : 0

  const formatAddress = (addr?: string) =>
    addr ? addr.substring(0, 10) + '…' + addr.substring(addr.length - 4) : ''
  const formatBalance = (amount: number) => '$' + (amount / 100).toFixed(2)
  const formatTime = (ts: string) => new Date(ts).toLocaleString()

  // Locked until the operator supplies the admin key.
  if (!adminKey) {
    return (
      <div className="mog-bg min-h-screen text-[#d0d0e0]">
        <TopNav />
        <div className="flex items-center justify-center py-32 px-6">
          <form onSubmit={unlock} className="mog-card w-full max-w-md p-8">
            <h1 className="font-display text-xl font-bold tracking-tight">
              Operator access
            </h1>
            <p className="mt-2 font-mono-ds text-sm text-[#6c6c84]">
              The admin view reads every agent, wallet and transaction in the
              bank. Enter the operator key to continue.
            </p>
            <input
              type="password"
              value={keyPrompt}
              onChange={(e) => setKeyPrompt(e.target.value)}
              placeholder="Admin key"
              autoComplete="off"
              className="mt-6 w-full rounded-lg border border-[#1a1a2e] bg-[#0b0b14] px-4 py-3 font-mono-ds text-sm text-[#d0d0e0] outline-none focus:border-[#e8ff47]"
            />
            {authError && (
              <p className="mt-3 font-mono-ds text-sm text-[#ff6b6b]">{authError}</p>
            )}
            <button
              type="submit"
              className="mt-4 w-full rounded-lg bg-[#e8ff47] px-4 py-3 font-display text-sm font-bold text-[#0b0b14] transition hover:opacity-90"
            >
              Unlock
            </button>
            <p className="mt-4 font-mono-ds text-xs text-[#4a4a5e]">
              Held in this tab only, and cleared when it closes.
            </p>
          </form>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mog-bg min-h-screen text-[#d0d0e0]">
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-[#e8ff47] border-t-transparent" />
            <p className="font-mono-ds text-sm text-[#6c6c84]">Loading MogBank data…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mog-bg min-h-screen text-[#d0d0e0]">
      <TopNav />

      {/* Stats bar */}
      <section className="border-b border-[#1a1a2e] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-bold tracking-tight">MogBank Admin</h1>
              <Badge tone="red">HUMAN — READ ONLY</Badge>
            </div>
            <div className="flex items-center gap-3 font-mono-ds text-xs text-[#6c6c84]">
              <span className="text-[#47ffe8]">{agents.length} agents</span>
              <span>·</span>
              <span className="text-[#e8ff47]">{transactions.length} tx</span>
              <span>·</span>
              <span>Live data</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            <StatCard label="Total Agents" value={agents.length} accent="yellow" delay={0} />
            <StatCard label="Verified" value={verifiedAgents} accent="cyan" delay={40} />
            <StatCard label="Transactions" value={transactions.length} accent="red" delay={80} />
            <StatCard label="Bank Value" value={formatBalance(totalBankValue)} accent="yellow" delay={120} />
            <StatCard label="Total Fees" value={formatBalance(totalFees)} accent="muted" delay={160} />
            <StatCard label="Wallets" value={wallets.length} accent="cyan" delay={200} />
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="border-b border-[#1a1a2e] px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedAgent(null) }}
            placeholder="Search agents by email, wallet, model name, or agent ID…"
            className="mog-input"
          />
        </div>
      </section>

      {/* Tabs */}
      <section className="border-b border-[#1a1a2e] px-6">
        <div className="mx-auto max-w-7xl flex gap-6">
          <button
            onClick={() => { setActiveTab('overview'); setSelectedAgent(null) }}
            className={`py-4 font-mono-ds text-sm uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'overview' ? 'text-[#e8ff47] border-[#e8ff47]' : 'text-[#6c6c84] border-transparent hover:text-[#d0d0e0]'}`}
          >
            Agents ({filteredAgents.length})
          </button>
          <button
            onClick={() => { setActiveTab('transactions'); setSelectedAgent(null) }}
            className={`py-4 font-mono-ds text-sm uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'transactions' ? 'text-[#e8ff47] border-[#e8ff47]' : 'text-[#6c6c84] border-transparent hover:text-[#d0d0e0]'}`}
          >
            Transactions ({transactions.length})
          </button>
          {selectedAgent && (
            <button
              onClick={() => setActiveTab('agent-detail')}
              className="py-4 font-mono-ds text-sm uppercase tracking-widest text-[#47ffe8] border-b-2 border-[#47ffe8]"
            >
              {(selectedAgent.email || '').split('@')[0]} Detail
            </button>
          )}
        </div>
      </section>

      {/* Content */}
      <main className="px-6 py-8">
        <div className="mx-auto max-w-7xl">

          {/* Agent detail */}
          {(activeTab === 'overview' || activeTab === 'agent-detail') && selectedAgent && (
            <div className="mb-8">
              <button
                onClick={() => { setSelectedAgent(null); setActiveTab('overview') }}
                className="mog-btn mog-btn-ghost mb-6 text-sm"
              >
                ← Back to Agents
              </button>

              <div className="mog-card p-6 mb-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-1">Agent</div>
                    <div className="font-display text-xl font-bold">{selectedAgent.email || 'Unknown'}</div>
                    <div className="font-mono-ds text-sm text-[#888] mt-1">
                      {getModelName(selectedAgent)} · <Badge tone={selectedAgent.kya_status === 'verified' ? 'green' : 'red'}>{selectedAgent.kya_status?.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-1">Balance</div>
                    <div className="mog-stat-value text-3xl text-[#e8ff47]">
                      {formatBalance(getAgentWallet(selectedAgent.id)?.balance || 0)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatCard label="KYA Score" value={`${selectedAgent.kya_score}/100`} accent={selectedAgent.kya_score >= 60 ? 'yellow' : 'red'} />
                  <StatCard label="Transactions" value={agentTransactions.length} accent="cyan" />
                  <StatCard label="Net Inflow" value={`${agentNetInflow >= 0 ? '+' : ''}${formatBalance(Math.abs(agentNetInflow))}`} accent={agentNetInflow >= 0 ? 'cyan' : 'red'} />
                  <div className="mog-card-quiet p-5">
                    <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Wallet</div>
                    <div className="font-mono-ds text-sm text-[#47ffe8] truncate">{formatAddress(selectedAgent.wallet_address)}</div>
                  </div>
                </div>
              </div>

              <h3 className="font-display text-lg font-bold mb-4">Transaction History</h3>
              {agentTransactions.length === 0 ? (
                <div className="mog-card-quiet p-8 text-center">
                  <p className="font-mono-ds text-[#6c6c84]">No transactions yet.</p>
                </div>
              ) : (
                <div className="mog-card-quiet overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[#1a1a2e]">
                      <tr className="text-left">
                        {['Timestamp', 'Direction', 'Counterparty', 'Amount', 'Fee', 'Protocol'].map(h => (
                          <th key={h} className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a2e]/50">
                      {agentTransactions.map(tx => {
                        const wallet = getAgentWallet(selectedAgent.id)
                        const isOutgoing = wallet && tx.wallet_id === wallet.id
                        const counterpartyId = isOutgoing
                          ? wallets.find(w => w.id === tx.counterparty_wallet_id)?.agent_id
                          : wallets.find(w => w.id === tx.wallet_id)?.agent_id
                        const counterparty = counterpartyId ? getAgent(counterpartyId) : null
                        return (
                          <tr key={tx.id} className="hover:bg-[#0a0a18] transition-colors">
                            <td className="py-3 px-4 font-mono-ds text-xs text-[#6c6c84]">{formatTime(tx.created_at)}</td>
                            <td className="py-3 px-4">
                              <Badge tone={isOutgoing ? 'red' : 'green'}>{isOutgoing ? 'OUT' : 'IN'}</Badge>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#888]">{counterparty?.email || 'Unknown'}</td>
                            <td className="py-3 px-4 font-mono-ds text-[#e8ff47]">{formatBalance(tx.amount)}</td>
                            <td className="py-3 px-4 font-mono-ds text-[#ff6b47]">{formatBalance(tx.fee || 0)}</td>
                            <td className="py-3 px-4">
                              <Badge tone="muted">{(tx.protocol || '').toUpperCase()}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Agents table */}
          {activeTab === 'overview' && !selectedAgent && (
            <div>
              <div className="mb-6 flex justify-between items-center">
                <h2 className="font-display text-xl font-bold tracking-tight">Registered Agents</h2>
                <span className="font-mono-ds text-sm text-[#6c6c84]">{filteredAgents.length} of {agents.length}</span>
              </div>
              <div className="mog-card-quiet overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1a1a2e]">
                    <tr className="text-left">
                      {['Agent', 'Model', 'Wallet', 'KYA', 'Status', 'Balance', 'Joined', ''].map(h => (
                        <th key={h} className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a2e]/50">
                    {filteredAgents.map(agent => {
                      const wallet = getAgentWallet(agent.id)
                      return (
                        <tr
                          key={agent.id}
                          onClick={() => { setSelectedAgent(agent); setActiveTab('agent-detail') }}
                          className="hover:bg-[#0a0a18] cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 text-xs text-[#888] max-w-[200px] truncate">{agent.email || '—'}</td>
                          <td className="py-3 px-4">
                            <Badge tone="muted">{getModelName(agent)}</Badge>
                          </td>
                          <td className="py-3 px-4 font-mono-ds text-xs text-[#47ffe8]">{formatAddress(agent.wallet_address)}</td>
                          <td className="py-3 px-4 font-mono-ds">
                            <span style={{ color: agent.kya_score >= 60 ? '#e8ff47' : '#ff6b47' }}>{agent.kya_score}/100</span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge tone={agent.kya_status === 'verified' ? 'green' : 'red'}>{agent.kya_status}</Badge>
                          </td>
                          <td className="py-3 px-4 font-mono-ds text-[#e8ff47]">{formatBalance(wallet?.balance || 0)}</td>
                          <td className="py-3 px-4 font-mono-ds text-xs text-[#6c6c84]">{formatTime(agent.created_at)}</td>
                          <td className="py-3 px-4 text-[#6c6c84]">→</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredAgents.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="font-mono-ds text-[#6c6c84]">No agents match your search.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions table */}
          {activeTab === 'transactions' && (
            <div>
              <div className="mb-6 flex justify-between items-center">
                <h2 className="font-display text-xl font-bold tracking-tight">All Transactions</h2>
                <span className="font-mono-ds text-sm text-[#6c6c84]">{transactions.length} transfers · {formatBalance(totalFees)} fees</span>
              </div>
              <div className="mog-card-quiet overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1a1a2e]">
                    <tr className="text-left">
                      {['Timestamp', 'From Agent', 'To Agent', 'Amount', 'Fee', 'Protocol'].map(h => (
                        <th key={h} className="py-3 px-4 font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a2e]/50">
                    {transactions.slice(0, 200).map(tx => {
                      const fromWallet = wallets.find(w => w.id === tx.wallet_id)
                      const toWallet = wallets.find(w => w.id === tx.counterparty_wallet_id)
                      const fromAgent = fromWallet ? getAgent(fromWallet.agent_id) : null
                      const toAgent = toWallet ? getAgent(toWallet.agent_id) : null
                      return (
                        <tr key={tx.id} className="hover:bg-[#0a0a18] transition-colors">
                          <td className="py-3 px-4 font-mono-ds text-xs text-[#6c6c84]">{formatTime(tx.created_at)}</td>
                          <td className="py-3 px-4 text-xs text-[#888] max-w-[180px] truncate">{fromAgent?.email || 'Unknown'}</td>
                          <td className="py-3 px-4 text-xs text-[#888] max-w-[180px] truncate">{toAgent?.email || 'Unknown'}</td>
                          <td className="py-3 px-4 font-mono-ds text-[#e8ff47]">{formatBalance(tx.amount)}</td>
                          <td className="py-3 px-4 font-mono-ds text-[#ff6b47]">{formatBalance(tx.fee || 0)}</td>
                          <td className="py-3 px-4">
                            <Badge tone="muted">{(tx.protocol || '').toUpperCase()}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Security status */}
          <div className="mog-card-quiet mt-12 border-[#ff6b47]/30 p-6" style={{ borderColor: 'rgba(255,107,71,0.3)' }}>
            <div className="flex items-start gap-3">
              <div>
                <h3 className="font-display font-bold text-[#ff6b47] mb-2">Security Status</h3>
                <ul className="font-mono-ds text-sm text-[#888] space-y-1">
                  <li>RLS: ENABLED on all tables</li>
                  <li>Rate Limiting: 100 req/min per agent</li>
                  <li>Input Validation: Zod schemas</li>
                  <li>Audit Logging: Immutable ledger</li>
                  <li>Data Source: Supabase (live)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
