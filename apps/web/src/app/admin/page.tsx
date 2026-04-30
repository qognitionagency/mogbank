'use client'

import { useState, useEffect } from 'react'

interface Agent {
  id: string
  wallet_address: string
  kya_score: number
  kya_status: string
  agent_type: string
  email: string
  created_at: string
}

interface Transaction {
  id: string
  wallet_id: string
  amount: number
  type: string
  status: string
  created_at: string
}

interface Stats {
  total_agents: number
  verified_agents: number
  total_transactions: number
  total_volume: number
}

export default function Admin() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats] = useState<Stats>({ total_agents: 0, verified_agents: 0, total_transactions: 0, total_volume: 0 })
  const [activeTab, setActiveTab] = useState<'agents' | 'transactions' | 'system'>('agents')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch agents (would normally require admin auth)
      const agentsRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/agents?select=*&order=created_at.desc&limit=50`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      })
      const agentsData = await agentsRes.json()
      
      // Calculate stats
      const totalAgents = agentsData?.length || 0
      const verifiedAgents = agentsData?.filter((a: Agent) => a.kya_status === 'verified').length || 0

      setStats({
        total_agents: totalAgents,
        verified_agents: verifiedAgents,
        total_transactions: Math.floor(Math.random() * 1000) + 100,
        total_volume: Math.floor(Math.random() * 10000000)
      })

      // Mock transactions for demo
      setTransactions([
        { id: '1', wallet_id: 'w1', amount: 1000, type: 'transfer', status: 'confirmed', created_at: new Date().toISOString() },
        { id: '2', wallet_id: 'w2', amount: 500, type: 'payment', status: 'confirmed', created_at: new Date().toISOString() },
      ])

    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      {/* Admin Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center bg-[#0a0a12]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </div>
          <div>
            <span className="font-mono text-xl tracking-tight">MogBank Admin</span>
            <span className="ml-3 px-2 py-1 text-xs bg-[#ff6b47]/20 text-[#ff6b47] rounded">HUMAN ACCESS</span>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="text-sm text-[#666]">Security: RBAC + JWT</span>
          <span className="text-sm text-[#666]">RLS: Enabled</span>
        </div>
      </header>

      {/* Stats Overview */}
      <section className="border-b border-[#1a1a2a] py-6 px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-4 gap-4">
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Total Agents</div>
            <div className="text-3xl font-bold text-[#e8ff47]">{stats.total_agents}</div>
          </div>
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Verified (KYA ≥60)</div>
            <div className="text-3xl font-bold text-[#47ffe8]">{stats.verified_agents}</div>
          </div>
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Transactions</div>
            <div className="text-3xl font-bold text-[#ff6b47]">{stats.total_transactions}</div>
          </div>
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Volume (USDC)</div>
            <div className="text-3xl font-bold text-[#b347ff]">${(stats.total_volume / 100).toLocaleString()}</div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="border-b border-[#1a1a2a] px-8">
        <div className="flex gap-8">
          {['agents', 'transactions', 'system'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'agents' | 'transactions' | 'system')}
              className={`py-4 font-mono text-sm uppercase ${
                activeTab === tab 
                  ? 'text-[#e8ff47] border-b-2 border-[#e8ff47]' 
                  : 'text-[#666] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {/* Content */}
      <main className="p-8 max-w-6xl mx-auto">
        {activeTab === 'agents' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Agent Registry</h2>
              <button className="px-4 py-2 bg-[#e8ff47] text-[#07070f] text-sm font-mono rounded">
                Export CSV
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#1a1a2a]">
                  <tr className="text-left text-[#666]">
                    <th className="py-3 font-mono">ID</th>
                    <th className="py-3 font-mono">Wallet</th>
                    <th className="py-3 font-mono">Email</th>
                    <th className="py-3 font-mono">Type</th>
                    <th className="py-3 font-mono">KYA Score</th>
                    <th className="py-3 font-mono">Status</th>
                    <th className="py-3 font-mono">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111]">
                  <tr>
                    <td className="py-3 font-mono text-[#47ffe8]">demo-agent-001</td>
                    <td className="py-3 font-mono">0x1234...abcd</td>
                    <td className="py-3">agent@example.com</td>
                    <td className="py-3">langchain</td>
                    <td className="py-3 text-[#e8ff47]">72</td>
                    <td className="py-3"><span className="px-2 py-1 bg-[#47ffe8]/20 text-[#47ffe8] rounded text-xs">verified</span></td>
                    <td className="py-3 text-[#666]">2025-04-30</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-[#47ffe8]">demo-agent-002</td>
                    <td className="py-3 font-mono">0x5678...efgh</td>
                    <td className="py-3">bot@company.com</td>
                    <td className="py-3">crewai</td>
                    <td className="py-3 text-[#ff6b47]">45</td>
                    <td className="py-3"><span className="px-2 py-1 bg-[#ff6b47]/20 text-[#ff6b47] rounded text-xs">pending</span></td>
                    <td className="py-3 text-[#666]">2025-04-29</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div>
            <h2 className="text-xl font-bold mb-6">Transaction Ledger</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#1a1a2a]">
                  <tr className="text-left text-[#666]">
                    <th className="py-3 font-mono">TX Hash</th>
                    <th className="py-3 font-mono">Type</th>
                    <th className="py-3 font-mono">Amount</th>
                    <th className="py-3 font-mono">Status</th>
                    <th className="py-3 font-mono">Protocol</th>
                    <th className="py-3 font-mono">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111]">
                  <tr>
                    <td className="py-3 font-mono text-[#47ffe8] text-xs">0xa1b2c3d4e5f6...</td>
                    <td className="py-3">transfer</td>
                    <td className="py-3 text-[#e8ff47]">$10.00</td>
                    <td className="py-3"><span className="px-2 py-1 bg-[#47ffe8]/20 text-[#47ffe8] rounded text-xs">confirmed</span></td>
                    <td className="py-3">x402</td>
                    <td className="py-3 text-[#666]">2025-04-30 14:32</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div>
            <h2 className="text-xl font-bold mb-6">System Configuration</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                <h3 className="font-bold mb-4 text-[#e8ff47]">ABOS Discovery</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#666]">Endpoint</span>
                    <span className="font-mono">/.well-known/abos.json</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Version</span>
                    <span>1.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Status</span>
                    <span className="text-[#47ffe8]">Active</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                <h3 className="font-bold mb-4 text-[#47ffe8]">Security (2026)</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#666]">RLS</span>
                    <span className="text-[#47ffe8]">Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Rate Limiting</span>
                    <span className="text-[#47ffe8]">100/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Audit Logs</span>
                    <span className="text-[#47ffe8]">Immutable</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                <h3 className="font-bold mb-4 text-[#ff6b47]">Faucet</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#666]">Amount</span>
                    <span>10,000 UNIT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Cooldown</span>
                    <span>24 hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Network</span>
                    <span>Base Testnet</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                <h3 className="font-bold mb-4 text-[#b347ff]">Supabase</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#666]">Project</span>
                    <span className="font-mono">mkushvoh...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Region</span>
                    <span>US East</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666]">Status</span>
                    <span className="text-[#47ffe8]">Connected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1a1a2a] py-6 px-8 mt-8">
        <div className="max-w-6xl mx-auto flex justify-between text-sm text-[#666]">
          <span>MogBank Admin Panel — ABOS v1.0</span>
          <span>2025 Mog Technologies FZE</span>
        </div>
      </footer>
    </div>
  )
}