'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

export default function Admin() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'agent-detail'>('overview')
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [agentsRes, walletsRes, txRes] = await Promise.all([
        fetch('/api/v1/admin/agents'),
        fetch('/api/v1/admin/wallets'),
        fetch('/api/v1/admin/transactions')
      ])
      const agentData = await agentsRes.json()
      const walletData = await walletsRes.json()
      const txData = await txRes.json()

      if (agentData.agents) setAgents(agentData.agents)
      if (walletData.wallets) setWallets(walletData.wallets)
      if (txData.transactions) setTransactions(txData.transactions)
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

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

  const formatAddress = (addr?: string) => addr ? addr.substring(0, 10) + '...' + addr.substring(addr.length - 4) : ''
  const formatBalance = (amount: number) => '$' + (amount / 100).toFixed(2)
  const formatTime = (ts: string) => new Date(ts).toLocaleString()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center text-[#666]">
        <div className="text-center">
          <div className="text-4xl mb-4">🏦</div>
          <div className="animate-pulse">Loading MogBank data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        input:focus { outline: none; }
        .card-hover:hover { border-color: #e8ff47 !important; background: #0d0d18 !important; }
      `}</style>

      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center bg-[#0a0a12]">
        <div className="flex items-center gap-4">
          <Link href="/" className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </Link>
          <div>
            <span className="font-mono text-xl tracking-tight">MogBank Admin</span>
            <span className="ml-3 px-2 py-1 text-xs bg-[#ff6b47]/20 text-[#ff6b47] rounded">HUMAN — READ ONLY</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-[#555]">
          <span className="text-[#47ffe8]">{agents.length} agents</span>
          <span>|</span>
          <span className="text-[#e8ff47]">{transactions.length} tx</span>
          <span>|</span>
          <span>Live data</span>
        </div>
      </header>

      {/* Stats */}
      <section className="border-b border-[#1a1a2a] py-6 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-6 gap-4">
          {[
            { label: 'Total Agents', value: agents.length.toString(), color: '#e8ff47' },
            { label: 'Verified', value: verifiedAgents.toString(), color: '#47ffe8' },
            { label: 'Transactions', value: transactions.length.toString(), color: '#ff6b47' },
            { label: 'Bank Value', value: formatBalance(totalBankValue), color: '#b347ff' },
            { label: 'Total Fees', value: formatBalance(totalFees), color: '#ff47a3' },
            { label: 'Wallets', value: wallets.length.toString(), color: '#4788ff' },
          ].map(s => (
            <div key={s.label} className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded card-hover">
              <div className="text-xs font-mono text-[#666] mb-1">{s.label}</div>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Search */}
      <section className="border-b border-[#1a1a2a] px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedAgent(null); }}
              placeholder="Search agents by email, wallet, model name, or agent ID..."
              className="w-full bg-[#0a0a12] border border-[#1a1a2a] rounded-lg pl-12 pr-4 py-3 text-white placeholder:text-[#444] focus:border-[#e8ff47] transition-colors text-sm"
            />
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="border-b border-[#1a1a2a] px-8">
        <div className="max-w-7xl mx-auto flex gap-8">
          <button onClick={() => { setActiveTab('overview'); setSelectedAgent(null); }}
            className={`py-4 font-mono text-sm uppercase ${activeTab === 'overview' ? 'text-[#e8ff47] border-b-2 border-[#e8ff47]' : 'text-[#666] hover:text-white'}`}>
            Agents ({filteredAgents.length})
          </button>
          <button onClick={() => { setActiveTab('transactions'); setSelectedAgent(null); }}
            className={`py-4 font-mono text-sm uppercase ${activeTab === 'transactions' ? 'text-[#e8ff47] border-b-2 border-[#e8ff47]' : 'text-[#666] hover:text-white'}`}>
            Transactions ({transactions.length})
          </button>
          {selectedAgent && (
            <button onClick={() => setActiveTab('agent-detail')}
              className="py-4 font-mono text-sm uppercase text-[#47ffe8] border-b-2 border-[#47ffe8]">
              {(selectedAgent.email || '').split('@')[0]} Detail
            </button>
          )}
        </div>
      </section>

      {/* Content */}
      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {(activeTab === 'overview' || activeTab === 'agent-detail') && selectedAgent && (
            <div className="mb-8">
              <button onClick={() => { setSelectedAgent(null); setActiveTab('overview'); }}
                className="text-[#e8ff47] hover:underline mb-6 inline-block">← Back to Agents</button>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="col-span-4 p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-mono text-[#666] mb-1">Agent</div>
                      <div className="text-xl font-bold">{selectedAgent.email || 'Unknown'}</div>
                      <div className="text-sm text-[#888] mt-1">
                        {getModelName(selectedAgent)} · {selectedAgent.kya_status?.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono text-[#666] mb-1">Balance</div>
                      <div className="text-3xl font-bold text-[#e8ff47]">
                        {formatBalance(getAgentWallet(selectedAgent.id)?.balance || 0)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                  <div className="text-xs font-mono text-[#666] mb-1">KYA Score</div>
                  <div className="text-2xl font-bold text-[#e8ff47]">{selectedAgent.kya_score}/100</div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                  <div className="text-xs font-mono text-[#666] mb-1">Transactions</div>
                  <div className="text-2xl font-bold text-[#47ffe8]">{agentTransactions.length}</div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                  <div className="text-xs font-mono text-[#666] mb-1">Net Inflow</div>
                  <div className={`text-2xl font-bold ${agentNetInflow >= 0 ? 'text-[#47ffe8]' : 'text-[#ff6b47]'}`}>
                    {agentNetInflow >= 0 ? '+' : ''}{formatBalance(Math.abs(agentNetInflow))}
                  </div>
                </div>
                <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                  <div className="text-xs font-mono text-[#666] mb-1">Wallet</div>
                  <div className="text-sm font-mono text-[#47ffe8] truncate">{formatAddress(selectedAgent.wallet_address)}</div>
                </div>
              </div>

              <h3 className="text-lg font-bold mb-4">Transaction History</h3>
              {agentTransactions.length === 0 ? (
                <div className="text-center py-8 border border-[#1a1a2a] rounded text-[#666]">No transactions yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1a1a2a]">
                    <tr className="text-left text-[#666]">
                      <th className="py-3 font-mono">Timestamp</th>
                      <th className="py-3 font-mono">Direction</th>
                      <th className="py-3 font-mono">Counterparty</th>
                      <th className="py-3 font-mono">Amount</th>
                      <th className="py-3 font-mono">Fee</th>
                      <th className="py-3 font-mono">Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {agentTransactions.map(tx => {
                      const wallet = getAgentWallet(selectedAgent.id)
                      const isOutgoing = wallet && tx.wallet_id === wallet.id
                      const counterpartyId = isOutgoing ? 
                        (tx.counterparty_wallet_id ? wallets.find(w => w.id === tx.counterparty_wallet_id)?.agent_id : null) :
                        (tx.wallet_id ? wallets.find(w => w.id === tx.wallet_id)?.agent_id : null)
                      const counterparty = counterpartyId ? getAgent(counterpartyId) : null
                      return (
                        <tr key={tx.id} className="hover:bg-[#0a0a12]">
                          <td className="py-3 text-[#666] text-xs font-mono">{formatTime(tx.created_at)}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs ${isOutgoing ? 'bg-[#ff6b47]/20 text-[#ff6b47]' : 'bg-[#47ffe8]/20 text-[#47ffe8]'}`}>
                              {isOutgoing ? 'OUT' : 'IN'}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-[#888]">{counterparty?.email || 'Unknown'}</td>
                          <td className="py-3 text-[#e8ff47] font-mono">{formatBalance(tx.amount)}</td>
                          <td className="py-3 text-[#ff6b47] font-mono">{formatBalance(tx.fee || 0)}</td>
                          <td className="py-3"><span className="px-2 py-1 bg-[#1a1a2a] rounded text-xs">{(tx.protocol || '').toUpperCase()}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'overview' && !selectedAgent && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Registered Agents</h2>
                <span className="text-sm text-[#666] font-mono">{filteredAgents.length} of {agents.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1a1a2a]">
                    <tr className="text-left text-[#666]">
                      <th className="py-3 font-mono">Agent</th>
                      <th className="py-3 font-mono">Model</th>
                      <th className="py-3 font-mono">Wallet</th>
                      <th className="py-3 font-mono">KYA</th>
                      <th className="py-3 font-mono">Status</th>
                      <th className="py-3 font-mono">Balance</th>
                      <th className="py-3 font-mono">Joined</th>
                      <th className="py-3 font-mono"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {filteredAgents.map(agent => {
                      const wallet = getAgentWallet(agent.id)
                      return (
                        <tr key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent)
                            if (wallet) setSelectedWallet(wallet)
                            setActiveTab('agent-detail')
                          }}
                          className="hover:bg-[#0a0a12] cursor-pointer transition-colors">
                          <td className="py-3 text-xs text-[#888] max-w-[200px] truncate">{agent.email || '-'}</td>
                          <td className="py-3">
                            <span className="px-2 py-1 bg-[#1a1a2a] rounded text-xs">{getModelName(agent)}</span>
                          </td>
                          <td className="py-3 font-mono text-xs text-[#47ffe8]">{formatAddress(agent.wallet_address)}</td>
                          <td className="py-3">
                            <span className={agent.kya_score >= 60 ? 'text-[#e8ff47]' : 'text-[#ff6b47]'}>{agent.kya_score}/100</span>
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs ${agent.kya_status === 'verified' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' : 'bg-[#ff6b47]/20 text-[#ff6b47]'}`}>
                              {agent.kya_status}
                            </span>
                          </td>
                          <td className="py-3 text-[#e8ff47] font-mono">{formatBalance(wallet?.balance || 0)}</td>
                          <td className="py-3 text-[#666] text-xs">{formatTime(agent.created_at)}</td>
                          <td className="py-3 text-[#555]">→</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filteredAgents.length === 0 && (
                <div className="text-center py-12 text-[#666]">No agents match your search.</div>
              )}
            </div>
          )}

          {activeTab === 'transactions' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">All Transactions</h2>
                <span className="text-sm text-[#666] font-mono">{transactions.length} transfers · {formatBalance(totalFees)} fees</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1a1a2a]">
                    <tr className="text-left text-[#666]">
                      <th className="py-3 font-mono">Timestamp</th>
                      <th className="py-3 font-mono">From Agent</th>
                      <th className="py-3 font-mono">To Agent</th>
                      <th className="py-3 font-mono">Amount</th>
                      <th className="py-3 font-mono">Fee</th>
                      <th className="py-3 font-mono">Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {transactions.slice(0, 200).map(tx => {
                      const fromWallet = wallets.find(w => w.id === tx.wallet_id)
                      const toWallet = wallets.find(w => w.id === tx.counterparty_wallet_id)
                      const fromAgent = fromWallet ? getAgent(fromWallet.agent_id) : null
                      const toAgent = toWallet ? getAgent(toWallet.agent_id) : null
                      return (
                        <tr key={tx.id} className="hover:bg-[#0a0a12]">
                          <td className="py-3 text-[#666] text-xs font-mono">{formatTime(tx.created_at)}</td>
                          <td className="py-3 text-xs text-[#888] truncate max-w-[180px]">{fromAgent?.email || 'Unknown'}</td>
                          <td className="py-3 text-xs text-[#888] truncate max-w-[180px]">{toAgent?.email || 'Unknown'}</td>
                          <td className="py-3 text-[#e8ff47] font-mono">{formatBalance(tx.amount)}</td>
                          <td className="py-3 text-[#ff6b47] font-mono">{formatBalance(tx.fee || 0)}</td>
                          <td className="py-3"><span className="px-2 py-1 bg-[#1a1a2a] rounded text-xs">{(tx.protocol || '').toUpperCase()}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Security Status */}
        <div className="max-w-7xl mx-auto mt-12 p-6 bg-[#0a0a12] border border-[#ff6b47]/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-xl">🔒</span>
            <div>
              <h3 className="font-bold text-[#ff6b47] mb-2">Security Status</h3>
              <ul className="text-sm text-[#888] space-y-1">
                <li>• RLS: ENABLED on all tables</li>
                <li>• Rate Limiting: 100 req/min per agent</li>
                <li>• Input Validation: Zod schemas</li>
                <li>• Audit Logging: Immutable ledger</li>
                <li>• Data Source: Supabase (live)</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}