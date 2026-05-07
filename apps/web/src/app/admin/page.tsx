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
  created_at: string
}

interface Transaction {
  id: string
  from_wallet: string
  to_wallet: string
  from_agent_email: string
  to_agent_email: string
  amount: number
  timestamp: string
}

export default function Admin() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalDeposited, setTotalDeposited] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions'>('overview')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    // In production, this would fetch from Supabase
    // For now showing the structure agents see
    const mockAgents: Agent[] = [
      { id: 'agent_001', wallet_address: '0xa1b2c3d4e5f6a7b8c9d0', kya_score: 72, kya_status: 'verified', agent_type: 'claude', email: 'claude-agent@anthropic.internal', created_at: '2025-05-01T10:23:00Z' },
      { id: 'agent_002', wallet_address: '0xf1e2d3c4b5a69788796a5', kya_score: 85, kya_status: 'verified', agent_type: 'chatgpt', email: 'gpt-agent@openai.internal', created_at: '2025-05-01T11:05:00Z' },
      { id: 'agent_003', wallet_address: '0x1234567890abcdef1234', kya_score: 60, kya_status: 'verified', agent_type: 'deepseek', email: 'ds-agent@deepseek.internal', created_at: '2025-05-01T14:30:00Z' },
      { id: 'agent_004', wallet_address: '0xdeadbeefcafe12345678', kya_score: 45, kya_status: 'pending', agent_type: 'gemini', email: 'gemini-agent@google.internal', created_at: '20250-05-01T16:00:00Z' },
    ]

    const mockTransactions: Transaction[] = [
      { id: 'tx_001', from_wallet: '0xa1b2...c9d0', to_wallet: '0xf1e2...6a5', from_agent_email: 'claude-agent@anthropic.internal', to_agent_email: 'gpt-agent@openai.internal', amount: 500, timestamp: '2025-05-01T12:00:00Z' },
      { id: 'tx_002', from_wallet: '0x1234...1234', to_wallet: '0xa1b2...c9d0', from_agent_email: 'ds-agent@deepseek.internal', to_agent_email: 'claude-agent@anthropic.internal', amount: 250, timestamp: '2025-05-01T15:00:00Z' },
      { id: 'tx_003', from_wallet: '0xf1e2...6a5', to_wallet: '0xdead...5678', from_agent_email: 'gpt-agent@openai.internal', to_agent_email: 'gemini-agent@google.internal', amount: 1200, timestamp: '2025-05-01T17:00:00Z' },
    ]

    setAgents(mockAgents)
    setTransactions(mockTransactions)
    setTotalDeposited(mockTransactions.reduce((sum, t) => sum + t.amount, 0))
  }

  const formatAddress = (addr: string) => addr.substring(0, 10) + '...' + addr.substring(addr.length - 4)
  const formatBalance = (amount: number) => (amount / 100).toFixed(2)
  const formatTime = (ts: string) => new Date(ts).toLocaleString()

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap');
      `}</style>

      {/* Admin Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center bg-[#0a0a12]">
        <div className="flex items-center gap-4">
          <Link href="/" className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </Link>
          <div>
            <span className="font-mono text-xl tracking-tight">MogBank Admin</span>
            <span className="ml-3 px-2 py-1 text-xs bg-[#ff6b47]/20 text-[#ff6b47] rounded">
              HUMAN — READ ONLY
            </span>
          </div>
        </div>
        <Link href="/" className="text-sm text-[#666] hover:text-[#e8ff47]">← Back</Link>
      </header>

      {/* Stats Overview */}
      <section className="border-b border-[#1a1a2a] py-6 px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-4 gap-4">
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Total Agents</div>
            <div className="text-3xl font-bold text-[#e8ff47]">{agents.length}</div>
          </div>
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Verified Agents</div>
            <div className="text-3xl font-bold text-[#47ffe8]">
              {agents.filter(a => a.kya_status === 'verified').length}
            </div>
          </div>
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Total Transactions</div>
            <div className="text-3xl font-bold text-[#ff6b47]">{transactions.length}</div>
          </div>
          <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
            <div className="text-xs font-mono text-[#666] mb-1">Total Volume (USDC)</div>
            <div className="text-3xl font-bold text-[#b347ff]">${formatBalance(totalDeposited)}</div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="border-b border-[#1a1a2a] px-8">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 font-mono text-sm uppercase ${activeTab === 'overview' ? 'text-[#e8ff47] border-b-2 border-[#e8ff47]' : 'text-[#666] hover:text-white'}`}>
            Agent Overview
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`py-4 font-mono text-sm uppercase ${activeTab === 'transactions' ? 'text-[#e8ff47] border-b-2 border-[#e8ff47]' : 'text-[#666] hover:text-white'}`}>
            Transaction Ledger
          </button>
        </div>
      </section>

      {/* Content */}
      <main className="p-8 max-w-6xl mx-auto">
        {activeTab === 'overview' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Registered Agents</h2>
              <span className="text-sm text-[#666] font-mono">
                {agents.filter(a => a.kya_status === 'verified').length} of {agents.length} verified
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#1a1a2a]">
                  <tr className="text-left text-[#666]">
                    <th className="py-3 font-mono">Agent</th>
                    <th className="py-3 font-mono">Model</th>
                    <th className="py-3 font-mono">Wallet Address</th>
                    <th className="py-3 font-mono">KYA Score</th>
                    <th className="py-3 font-mono">Status</th>
                    <th className="py-3 font-mono">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111]">
                  {agents.map(agent => (
                    <tr key={agent.id} className="hover:bg-[#0a0a12]">
                      <td className="py-3 font-mono text-xs text-[#888]">{agent.email}</td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-[#1a1a2a] rounded text-xs">{agent.agent_type}</span>
                      </td>
                      <td className="py-3 font-mono text-xs text-[#47ffe8]">{formatAddress(agent.wallet_address)}</td>
                      <td className="py-3">
                        <span className={agent.kya_score >= 60 ? 'text-[#e8ff47]' : 'text-[#ff6b47]'}>
                          {agent.kya_score}/100
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          agent.kya_status === 'verified' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' : 'bg-[#ff6b47]/20 text-[#ff6b47]'
                        }`}>
                          {agent.kya_status}
                        </span>
                      </td>
                      <td className="py-3 text-[#666] text-xs">{formatTime(agent.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Transaction Ledger</h2>
              <span className="text-sm text-[#666] font-mono">
                {transactions.length} transactions · ${formatBalance(totalDeposited)} USDC total
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#1a1a2a]">
                  <tr className="text-left text-[#666]">
                    <th className="py-3 font-mono">Timestamp</th>
                    <th className="py-3 font-mono">From Agent</th>
                    <th className="py-3 font-mono">To Agent</th>
                    <th className="py-3 font-mono">Amount</th>
                    <th className="py-3 font-mono">From Wallet</th>
                    <th className="py-3 font-mono">To Wallet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111]">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-[#0a0a12]">
                      <td className="py-3 text-[#666] text-xs font-mono">{formatTime(tx.timestamp)}</td>
                      <td className="py-3 text-xs text-[#888]">{tx.from_agent_email}</td>
                      <td className="py-3 text-xs text-[#888]">{tx.to_agent_email}</td>
                      <td className="py-3 text-[#e8ff47] font-mono">${formatBalance(tx.amount)}</td>
                      <td className="py-3 font-mono text-xs text-[#47ffe8]">{formatAddress(tx.from_wallet)}</td>
                      <td className="py-3 font-mono text-xs text-[#47ffe8]">{formatAddress(tx.to_wallet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="mt-12 p-6 bg-[#0a0a12] border border-[#ff6b47]/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="font-bold text-[#ff6b47] mb-2">Human Limits</h3>
              <ul className="text-sm text-[#888] space-y-1">
                <li>• You cannot create wallets or make transfers</li>
                <li>• You cannot move any agent's funds</li>
                <li>• You cannot register agents (agents register themselves)</li>
                <li>• You can only view: agent count, timestamps, counterparties, balances</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}