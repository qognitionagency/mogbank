'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function Faucet() {
  const [agent, setAgent] = useState<{ id: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [lastClaim, setLastClaim] = useState<string | null>(null)

  useEffect(() => {
    const storedAgent = localStorage.getItem('mogbank_agent')
    if (storedAgent) {
      setAgent(JSON.parse(storedAgent))
    }
  }, [])

  const claimTokens = async () => {
    if (!agent) {
      setMessage({ type: 'error', text: 'Please register an agent first' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/v1/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id })
      })

      const data = await res.json()

      if (data.success) {
        setMessage({ type: 'success', text: `Success! Received ${data.claimed / 100} USDC TEST tokens` })
        setLastClaim(new Date().toISOString())
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to claim tokens' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to claim tokens' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0] p-8">
      <Link href="/" className="text-[#e8ff47] hover:underline mb-8 inline-block">← Back</Link>

      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#e8ff47]/20 flex items-center justify-center">
            <span className="text-4xl">💧</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">MogBank Faucet</h1>
          <p className="text-[#666]">Get free testnet tokens for your AI agent</p>
        </div>

        {/* Token Card */}
        <div className="p-8 bg-gradient-to-br from-[#0a0a12] to-[#07070f] border border-[#1a1a2a] rounded-2xl mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-5xl font-bold text-[#e8ff47] mb-2">10,000</div>
              <div className="text-[#666]">UNIT per claim</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-[#666]">Network</div>
              <div className="font-mono text-[#47ffe8]">Base Testnet</div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-[#07070f] rounded-lg border border-[#1a1a2a]">
            <div className="flex-1">
              <div className="text-xs text-[#666] mb-1">Token</div>
              <div className="font-mono">USDC (TEST)</div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[#666] mb-1">Value</div>
              <div>$100.00 USD</div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[#666] mb-1">Cooldown</div>
              <div>24 hours</div>
            </div>
          </div>
        </div>

        {/* Claim Button */}
        {agent ? (
          <>
            <button
              onClick={claimTokens}
              disabled={loading}
              className="w-full py-4 bg-[#e8ff47] text-[#07070f] font-mono font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Processing...' : 'Claim 10,000 UNIT'}
            </button>
            
            {message && (
              <div className={`mt-4 p-4 rounded-lg text-center ${
                message.type === 'success' 
                  ? 'bg-[#47ffe8]/20 text-[#47ffe8]' 
                  : 'bg-[#ff6b47]/20 text-[#ff6b47]'
              }`}>
                {message.text}
              </div>
            )}

            {lastClaim && (
              <div className="mt-4 text-center text-sm text-[#666]">
                Last claim: {new Date(lastClaim).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-6 border border-[#1a1a2a] rounded-lg">
            <p className="text-[#666] mb-4">You need to register an agent first</p>
            <Link href="/dashboard" className="text-[#e8ff47] hover:underline">
              Go to Dashboard →
            </Link>
          </div>
        )}

        {/* Info */}
        <div className="mt-12 p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
          <h3 className="font-bold mb-4 text-[#666]">About the Faucet</h3>
          <ul className="space-y-2 text-sm text-[#888]">
            <li>• Testnet tokens have no real monetary value</li>
            <li>• One claim per agent every 24 hours</li>
            <li>• Tokens are minted on Base testnet</li>
            <li>• Use for development and testing only</li>
          </ul>
        </div>

        {/* Code Example */}
        <div className="mt-6 p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
          <h3 className="font-bold mb-4 text-[#666]">Programmatic Access</h3>
          <pre className="text-sm font-mono text-[#47ffe8] overflow-x-auto">
{`curl -X POST https://mogbank.vercel.app/api/v1/faucet \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id": "your-agent-id"}'`}
          </pre>
        </div>
      </div>
    </div>
  )
}