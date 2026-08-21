'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TopNav, useCountUp } from '@/components/ui'

export default function Faucet() {
  const [agent, setAgent] = useState<{ id: string; api_key?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [claimed, setClaimed] = useState<number | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const animatedClaim = useCountUp(claimed ? claimed / 100 : 0)
  const animatedBalance = useCountUp(balance ? balance / 100 : 0)

  useEffect(() => {
    const storedAgent = localStorage.getItem('mogbank_agent')
    if (storedAgent) setAgent(JSON.parse(storedAgent))
  }, [])

  const claimTokens = async () => {
    if (!agent) {
      setMessage({ type: 'error', text: 'Please register an agent first' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      // The claiming agent is derived from the API key, not the body.
      const res = await fetch('/api/v1/faucet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(agent.api_key ? { 'x-api-key': agent.api_key } : {}),
        },
        body: '{}',
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: 'Funds settled to your custody wallet' })
        setClaimed(data.claimed)
        setBalance(data.wallet_balance ?? null)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to claim tokens' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to claim tokens' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mog-bg min-h-screen text-[#d0d0e0]">
      <TopNav />
      <main className="relative z-10 mx-auto max-w-2xl px-6 py-14">
        <div className="mog-reveal mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1a1a2e] bg-[#e8ff47]/10">
            <span className="text-3xl">💧</span>
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Testnet Faucet</h1>
          <p className="mt-3 font-mono-ds text-sm text-[#6c6c84]">
            Zero-risk USDC for your agent · ABOS Layer 2 custody
          </p>
        </div>

        {/* Token card */}
        <div className="mog-card mog-reveal p-8" style={{ animationDelay: '80ms' }}>
          <div className="flex items-end justify-between">
            <div>
              <div className="mog-stat-value text-6xl text-[#e8ff47]">
                {claimed ? animatedClaim.toFixed(0) : '100'}
              </div>
              <div className="mt-1 font-mono-ds text-sm text-[#6c6c84]">
                {claimed ? 'USDC received' : 'USDC per claim'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono-ds text-[0.7rem] uppercase tracking-widest text-[#6c6c84]">Network</div>
              <div className="font-mono-ds text-[#47ffe8]">Base Testnet</div>
            </div>
          </div>

          {claimed && (
            <div className="mog-pop mt-6 rounded-xl border border-[#47ffe8]/30 bg-[#47ffe8]/[0.06] p-4 text-center">
              <div className="font-mono-ds text-[0.7rem] uppercase tracking-widest text-[#6c6c84]">New wallet balance</div>
              <div className="mog-stat-value mt-1 text-3xl text-[#47ffe8]">${animatedBalance.toFixed(2)}</div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[#1a1a2e] bg-[#1a1a2e]">
            {[
              ['Token', 'USDC (TEST)'],
              ['Value', '$100.00'],
              ['Cooldown', '24 hours'],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#07070f] p-4">
                <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84]">{k}</div>
                <div className="mt-1 font-mono-ds text-sm">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Claim */}
        <div className="mog-reveal mt-6" style={{ animationDelay: '160ms' }}>
          {agent ? (
            <>
              <button onClick={claimTokens} disabled={loading} className="mog-btn mog-btn-primary w-full disabled:opacity-50">
                {loading ? 'Settling…' : 'Claim 100 USDC'}
              </button>
              {message && (
                <div
                  className={`mog-pop mt-4 rounded-xl p-4 text-center font-mono-ds text-sm ${
                    message.type === 'success'
                      ? 'border border-[#47ffe8]/30 bg-[#47ffe8]/10 text-[#47ffe8]'
                      : 'border border-[#ff6b47]/30 bg-[#ff6b47]/10 text-[#ff6b47]'
                  }`}
                >
                  {message.text}
                </div>
              )}
            </>
          ) : (
            <div className="mog-card-quiet p-6 text-center">
              <p className="mb-4 text-[#6c6c84]">Register an agent to receive testnet funds.</p>
              <Link href="/dashboard" className="mog-btn mog-btn-ghost inline-flex">Go to Dashboard →</Link>
            </div>
          )}
        </div>

        {/* Programmatic */}
        <div className="mog-card-quiet mog-reveal mt-10 p-6" style={{ animationDelay: '240ms' }}>
          <h3 className="font-mono-ds text-[0.7rem] uppercase tracking-widest text-[#6c6c84]">Programmatic access</h3>
          <pre className="mt-3 overflow-x-auto font-mono-ds text-sm text-[#47ffe8]">
{`curl -X POST https://mogbank.vercel.app/api/v1/faucet \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id": "your-agent-id"}'`}
          </pre>
        </div>
      </main>
    </div>
  )
}
