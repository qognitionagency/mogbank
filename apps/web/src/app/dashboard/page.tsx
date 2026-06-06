'use client'

import { useState, useEffect, useCallback } from 'react'
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

type RegStep = 'form' | 'submitting' | 'credentials'

interface RegResult {
  agent: { id: string; kya_score: number; kya_status: string; wallet_address: string; public_key: string }
  credentials: { api_key: string; ed25519_private_key: string; warning: string }
  wallet: { id: string; balance: number; currency: string } | null
  kya_breakdown: Record<string, number>
}

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [balance, setBalance] = useState<number | null>(null)

  // Registration flow
  const [regStep, setRegStep] = useState<RegStep>('form')
  const [regForm, setRegForm] = useState({
    email: '',
    principal_address: '',
    agent_type: 'custom',
    agent_name: '',
  })
  const [regResult, setRegResult] = useState<RegResult | null>(null)
  const [regError, setRegError] = useState<string | null>(null)
  const [copied, setCopied] = useState<Record<string, boolean>>({})

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegStep('submitting')
    setRegError(null)
    try {
      const res = await fetch('/api/v1/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regForm.email,
          principal_address: regForm.principal_address,
          agent_type: regForm.agent_type,
          metadata: regForm.agent_name ? { model_name: regForm.agent_name } : {},
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setRegError(data.error || 'Registration failed')
        setRegStep('form')
        return
      }
      setRegResult(data)
      setRegStep('credentials')
    } catch {
      setRegError('Network error — please try again')
      setRegStep('form')
    }
  }

  const copyField = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000)
    })
  }

  const finishRegistration = () => {
    if (!regResult) return
    localStorage.setItem('mogbank_agent', JSON.stringify({ id: regResult.agent.id }))
    setLoading(true)
    fetchAgentData()
  }

  if (!agent) {
    return (
      <div className="mog-bg min-h-screen text-[#d0d0e0]">
        <TopNav />
        <div className="mx-auto max-w-lg px-6 py-16">

          {/* Credentials step — shown after successful registration */}
          {regStep === 'credentials' && regResult && (
            <div className="mog-reveal">
              <div className="mb-8 text-center">
                <div className="mog-pop mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#47ffe8]/30 bg-[#47ffe8]/10">
                  <span className="text-3xl">🔑</span>
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight">Save Your Credentials</h1>
                <p className="mt-2 font-mono-ds text-sm text-[#ff6b47]">
                  These are shown exactly once and cannot be recovered.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {[
                  { key: 'api_key', label: 'API Key', value: regResult.credentials.api_key, color: '#e8ff47' },
                  { key: 'ed25519', label: 'Ed25519 Private Key', value: regResult.credentials.ed25519_private_key, color: '#47ffe8' },
                  { key: 'agent_id', label: 'Agent ID', value: regResult.agent.id, color: '#b347ff' },
                ].map(field => (
                  <div key={field.key} className="mog-card-quiet p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">{field.label}</span>
                      <button
                        onClick={() => copyField(field.key, field.value)}
                        className="font-mono-ds text-[0.65rem] text-[#6c6c84] hover:text-[#d0d0e0] transition-colors"
                      >
                        {copied[field.key] ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <code className="block break-all font-mono-ds text-xs" style={{ color: field.color }}>
                      {field.value}
                    </code>
                  </div>
                ))}
              </div>

              <div className="mog-card-quiet mb-6 p-4 border-[#e8ff47]/20" style={{ borderColor: 'rgba(232,255,71,0.2)' }}>
                <div className="flex gap-3 items-start">
                  <span className="text-[#e8ff47] font-mono-ds text-lg leading-none mt-0.5">!</span>
                  <div className="font-mono-ds text-xs text-[#888] leading-relaxed">
                    <strong className="text-[#e8ff47]">KYA-7 Score:</strong>{' '}
                    <span style={{ color: regResult.agent.kya_score >= 60 ? '#47ffe8' : '#ff6b47' }}>
                      {regResult.agent.kya_score}/100
                    </span>{' '}
                    · Status: <span style={{ color: regResult.agent.kya_status === 'verified' ? '#47ffe8' : '#ffb347' }}>
                      {regResult.agent.kya_status}
                    </span>
                    <br />Your wallet starts at $0.00 USDC. Visit the faucet to claim 100 TEST USDC.
                  </div>
                </div>
              </div>

              <button onClick={finishRegistration} className="mog-btn mog-btn-primary w-full">
                I&apos;ve saved my credentials → Open Dashboard
              </button>
            </div>
          )}

          {/* Registration form */}
          {(regStep === 'form' || regStep === 'submitting') && (
            <div className="mog-reveal">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1a1a2e] bg-[#e8ff47]/10">
                  <span className="text-3xl">🤖</span>
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight">Register Your Agent</h1>
                <p className="mt-2 font-mono-ds text-sm text-[#6c6c84]">
                  One POST request. Bank account created. KYA-7 scored instantly.
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">
                    Agent Email
                  </label>
                  <input
                    type="email"
                    required
                    className="mog-input"
                    placeholder="agent@yourmodel.ai"
                    value={regForm.email}
                    onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">
                    Principal Address
                    <span className="ml-2 normal-case text-[#444]">— your wallet / signing address</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="mog-input"
                    placeholder="0x... (Ethereum / Base L2 address)"
                    value={regForm.principal_address}
                    onChange={e => setRegForm(f => ({ ...f, principal_address: e.target.value }))}
                  />
                  <p className="mt-1 font-mono-ds text-[0.6rem] text-[#444]">
                    Testnet: any 0x address works. Use 0x0000000000000000000000000000000000000000 if you don&apos;t have one.
                  </p>
                </div>

                <div>
                  <label className="block font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">
                    Agent Type
                  </label>
                  <select
                    className="mog-input"
                    value={regForm.agent_type}
                    onChange={e => setRegForm(f => ({ ...f, agent_type: e.target.value }))}
                  >
                    {['claude', 'chatgpt', 'gemini', 'deepseek', 'llama', 'grok', 'mistral', 'custom'].map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">
                    Agent Name <span className="normal-case text-[#444]">— optional</span>
                  </label>
                  <input
                    type="text"
                    className="mog-input"
                    placeholder="e.g. My Research Agent"
                    value={regForm.agent_name}
                    onChange={e => setRegForm(f => ({ ...f, agent_name: e.target.value }))}
                  />
                </div>

                {regError && (
                  <div className="mog-pop rounded-xl border border-[#ff6b47]/30 bg-[#ff6b47]/10 p-3 font-mono-ds text-sm text-[#ff6b47]">
                    {regError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={regStep === 'submitting'}
                  className="mog-btn mog-btn-primary w-full disabled:opacity-50"
                >
                  {regStep === 'submitting' ? 'Registering agent…' : 'Register Agent & Get Wallet'}
                </button>
              </form>
            </div>
          )}
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
