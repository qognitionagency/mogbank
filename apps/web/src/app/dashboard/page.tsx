'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface AgentData {
  id: string
  wallet_address: string
  kya_score: number
  kya_status: string
  agent_type: string
  created_at: string
}

interface WalletData {
  id: string
  currency: string
  balance: number
  wallet_type: string
  status: string
}

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentData | null>(null)
  const [wallets, setWallets] = useState<WalletData[]>([])
  const [loading, setLoading] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    agent_type: 'custom',
    principal_address: '',
    metadata: {} as Record<string, unknown>
  })

  useEffect(() => {
    // Check for stored agent
    const storedAgent = localStorage.getItem('mogbank_agent')
    if (storedAgent) {
      const agentData = JSON.parse(storedAgent)
      setAgent(agentData)
      fetchWallets(agentData.id)
    } else {
      setShowRegister(true)
    }
  }, [])

  const fetchWallets = async (agentId: string) => {
    try {
      const res = await fetch(`/api/v1/wallets?agent_id=${agentId}`)
      const data = await res.json()
      if (data.wallets) {
        setWallets(data.wallets)
      }
    } catch (err) {
      console.error('Failed to fetch wallets:', err)
    }
  }

  const registerAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/v1/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          metadata: {
            framework: formData.agent_type,
            capabilities: ['payments', 'wallets'],
            ...formData.metadata
          }
        })
      })

      const data = await res.json()

      if (data.success) {
        setAgent(data.agent)
        if (data.wallet) {
          setWallets([data.wallet])
        }
        localStorage.setItem('mogbank_agent', JSON.stringify(data.agent))
        setShowRegister(false)
      } else {
        alert(data.error || 'Registration failed')
      }
    } catch (err) {
      console.error('Registration error:', err)
      alert('Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const claimFaucet = async () => {
    if (!agent) return
    
    setLoading(true)
    try {
      const res = await fetch('/api/v1/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id })
      })
      const data = await res.json()
      
      if (data.success) {
        alert(`Success! ${data.claimed / 100} USDC TEST tokens added to your wallet`)
        fetchWallets(agent.id)
      } else {
        alert(data.error || 'Faucet claim failed')
      }
    } catch (err) {
      alert('Faucet claim failed')
    } finally {
      setLoading(false)
    }
  }

  const formatAddress = (addr: string) => {
    if (!addr) return ''
    return addr.substring(0, 10) + '...' + addr.substring(addr.length - 8)
  }

  const formatBalance = (balance: number) => {
    return (balance / 100).toFixed(2)
  }

  if (showRegister) {
    return (
      <div className="min-h-screen bg-[#07070f] text-[#d0d0e0] p-8">
        <div className="max-w-lg mx-auto">
          <Link href="/" className="text-[#e8ff47] hover:underline mb-8 inline-block">← Back</Link>
          
          <div className="border border-[#1a1a2a] p-8 rounded-lg bg-[#0a0a12]">
            <h1 className="text-3xl font-bold mb-2">Register Your Agent</h1>
            <p className="text-[#666] mb-8">KYA-7 scoring will determine your verification level</p>

            <form onSubmit={registerAgent} className="space-y-6">
              <div>
                <label className="block text-sm font-mono text-[#666] mb-2">Agent Email *</label>
                <input
                  type="email"
                  required
                  className="w-full bg-[#07070f] border border-[#1a1a2a] rounded p-3 text-white focus:border-[#e8ff47] outline-none"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="agent@yourcompany.com"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-[#666] mb-2">Principal Address (EOA) *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-[#07070f] border border-[#1a1a2a] rounded p-3 text-white focus:border-[#e8ff47] outline-none"
                  value={formData.principal_address}
                  onChange={(e) => setFormData({...formData, principal_address: e.target.value})}
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-[#666] mb-2">Agent Framework</label>
                <select
                  className="w-full bg-[#07070f] border border-[#1a1a2a] rounded p-3 text-white focus:border-[#e8ff47] outline-none"
                  value={formData.agent_type}
                  onChange={(e) => setFormData({...formData, agent_type: e.target.value})}
                >
                  <option value="langchain">LangChain</option>
                  <option value="crewai">CrewAI</option>
                  <option value="autogen">AutoGen</option>
                  <option value="semantic_kernel">Microsoft Semantic Kernel</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#e8ff47] text-[#07070f] py-3 rounded font-mono font-bold hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Registering...' : 'Register Agent'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-[#07070f] rounded border border-[#1a1a2a]">
              <div className="font-mono text-xs text-[#666] mb-2">KYA-7 Score Breakdown</div>
              <div className="text-sm text-[#888] space-y-1">
                <div>• Principal Identity (15 pts)</div>
                <div>• Email Domain (10 pts)</div>
                <div>• Agent Metadata (15 pts)</div>
                <div>• Use Case Risk (20 pts)</div>
                <div>• Jurisdiction Risk (15 pts)</div>
                <div>• Technical Capability (15 pts)</div>
                <div>• Verification Mode (10 pts)</div>
              </div>
              <div className="mt-2 text-[#e8ff47] text-sm">Min 60 for mainnet access</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      {/* Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </Link>
          <div>
            <span className="font-mono text-xl tracking-tight">MogBank Dashboard</span>
            <span className="ml-3 px-2 py-1 text-xs bg-[#e8ff47]/20 text-[#e8ff47] rounded">
              {agent?.kya_status === 'verified' ? 'VERIFIED' : 'TESTNET'}
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('mogbank_agent')
            setAgent(null)
            setShowRegister(true)
          }}
          className="text-sm text-[#666] hover:text-[#e8ff47]"
        >
          Reset Agent
        </button>
      </header>

      <main className="p-8 max-w-6xl mx-auto">
        {/* Agent Info */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">Agent Identity</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
              <div className="text-xs font-mono text-[#666] mb-1">KYA Score</div>
              <div className="text-2xl font-bold text-[#e8ff47]">{agent?.kya_score || 0}/100</div>
            </div>
            <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
              <div className="text-xs font-mono text-[#666] mb-1">Agent Type</div>
              <div className="text-lg">{agent?.agent_type}</div>
            </div>
            <div className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded col-span-2">
              <div className="text-xs font-mono text-[#666] mb-1">Wallet Address</div>
              <div className="font-mono text-sm text-[#47ffe8]">{formatAddress(agent?.wallet_address || '')}</div>
            </div>
          </div>
        </section>

        {/* Wallets */}
        <section className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Wallets</h2>
            <button
              onClick={claimFaucet}
              disabled={loading}
              className="px-4 py-2 bg-[#e8ff47] text-[#07070f] text-sm font-mono rounded hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Claim 10,000 UNIT'}
            </button>
          </div>
          
          {wallets.length === 0 ? (
            <div className="p-8 text-center border border-[#1a1a2a] rounded">
              <p className="text-[#666]">No wallets yet. Claim testnet tokens to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {wallets.map((wallet) => (
                <div key={wallet.id} className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded hover:border-[#e8ff47] transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-sm font-mono text-[#666]">{wallet.currency}</div>
                      <div className="text-lg font-bold">{wallet.wallet_type}</div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded ${
                      wallet.status === 'active' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' : 'bg-red-500/20 text-red-500'
                    }`}>
                      {wallet.status}
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-[#e8ff47]">
                    ${formatBalance(wallet.balance)}
                  </div>
                  <div className="text-xs text-[#666] mt-2">
                    Balance in smallest units (cents)
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/marketplace" className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded hover:border-[#b347ff] transition-colors text-center">
              <div className="text-2xl mb-2">🛒</div>
              <div>Marketplace</div>
            </Link>
            <Link href="/faucet" className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded hover:border-[#ff6b47] transition-colors text-center">
              <div className="text-2xl mb-2">💧</div>
              <div>Faucet</div>
            </Link>
            <Link href="/developers" className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded hover:border-[#47ffe8] transition-colors text-center">
              <div className="text-2xl mb-2">📚</div>
              <div>API Docs</div>
            </Link>
            <Link href="/admin" className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded hover:border-[#e8ff47] transition-colors text-center">
              <div className="text-2xl mb-2">⚙️</div>
              <div>Settings</div>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}