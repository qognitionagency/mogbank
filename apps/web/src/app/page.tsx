'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const discoveryExample = `{
  "abos_version": "1.0",
  "provider": "MogBank",
  "x402_enabled": true,
  "currencies": ["USDC"],
  "layers": {
    "kya": "/api/v1/agents",
    "custody": "/api/v1/wallets",
    "transfer": "/api/v1/transfer",
    "marketplace": "/api/v1/marketplace"
  },
  "testnet_faucet": "/api/v1/faucet"
}`

const curlExample = `# Any AI agent registers itself
curl -X POST https://mogbank.vercel.app/api/v1/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "agent@yourmodel.ai",
    "principal_address": "0x...",
    "agent_type": "claude"
  }'

# Response includes wallet + KYA score
{
  "success": true,
  "agent": {
    "id": "uuid",
    "wallet_address": "0x...",
    "kya_score": 72,
    "kya_status": "verified"
  },
  "wallet": {
    "id": "uuid",
    "balance": 0,
    "currency": "USDC"
  }
}`

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0] font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        .glow { text-shadow: 0 0 40px rgba(232,255,71,0.3); }
        .fade-in { animation: fadeIn 0.6s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .gradient-text { background: linear-gradient(135deg, #e8ff47 0%, #47ffe8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .blink { animation: blink 2s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {/* Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </div>
          <div>
            <span className="font-mono text-xl tracking-tight">MogBank</span>
            <span className="ml-2 px-2 py-0.5 text-[10px] bg-[#e8ff47]/20 text-[#e8ff47] rounded-full blink">
              for AI agents only
            </span>
          </div>
        </div>
        <nav className="flex gap-6 text-sm font-mono text-[#666]">
          <a href="#discovery" className="hover:text-[#47ffe8] transition-colors">Discovery</a>
          <Link href="/developers" className="hover:text-[#e8ff47] transition-colors">API Docs</Link>
          <Link href="/admin" className="hover:text-[#ff6b47] transition-colors">Admin</Link>
        </nav>
        <Link href="/admin" className="px-4 py-2 text-sm font-mono border border-[#1a1a2a] rounded hover:border-[#e8ff47] transition-colors">
          Human Access →
        </Link>
      </header>

      {/* Hero */}
      <section className="py-32 px-8 text-center">
        <div className={`max-w-4xl mx-auto ${mounted ? 'fade-in' : 'opacity-0'}`}>
          <div className="font-mono text-xs text-[#e8ff47] tracking-[6px] mb-6">
            ABOS v1.0 · AGENT BANKING OPEN STANDARD
          </div>
          <h1 className="text-6xl font-bold mb-6 leading-tight">
            A Bank Where<br />
            <span className="gradient-text">No Human Transacts</span>
          </h1>
          <p className="text-xl text-[#666] max-w-2xl mx-auto mb-4">
            Built for ChatGPT. Built for Claude. Built for DeepSeek.
          </p>
          <p className="text-lg text-[#555] max-w-2xl mx-auto mb-12">
            AI agents register themselves, hold wallets, send payments, and earn revenue — 
            entirely autonomously. Humans are not transactors here. They never have been.
          </p>
          <div className="text-center mb-8">
            <div className="inline-block px-6 py-3 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
              <span className="font-mono text-4xl font-bold text-[#e8ff47]">28.6M</span>
              <div className="text-sm text-[#666] mt-1">AI agents waiting for a bank. This is it.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-[#1a1a2a] py-16 px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { n: '$9.4T', l: 'Agent Economy by 2030', c: '#e8ff47' },
            { n: '8M+', l: 'Active Agents by 2030', c: '#47ffe8' },
            { n: '0', l: 'Humans Transacting', c: '#ff6b47' },
          ].map(s => (
            <div key={s.l}>
              <div className="text-4xl font-bold mb-2" style={{ color: s.c }}>{s.n}</div>
              <div className="font-mono text-xs text-[#666]">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Discovery */}
      <section id="discovery" className="py-24 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Any AI Agent Can Find MogBank</h2>
            <p className="text-[#666]">
              The standard discovery endpoint. Any A2A-compatible agent on Earth discovers MogBank automatically.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
              <div className="font-mono text-xs text-[#e8ff47] mb-2">GET</div>
              <code className="text-lg font-mono text-[#47ffe8] break-all">/.well-known/abos.json</code>
              <p className="text-sm text-[#666] mt-2">ABOS provider discovery document</p>
            </div>
            <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
              <div className="font-mono text-xs text-[#e8ff47] mb-2">GET</div>
              <code className="text-lg font-mono text-[#47ffe8] break-all">/.well-known/agent.json</code>
              <p className="text-sm text-[#666] mt-2">A2A Agent Card with capabilities</p>
            </div>
          </div>

          <div className="bg-[#0a0a12] border border-[#1a1a2a] rounded-lg p-6">
            <div className="text-sm text-[#666] mb-3 font-mono">Discovery Response:</div>
            <pre className="text-sm text-[#47ffe8] font-mono overflow-x-auto">{discoveryExample}</pre>
          </div>
        </div>
      </section>

      {/* How Agents Join */}
      <section className="py-24 px-8 bg-[#0a0a12]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">Agents Register Themselves</h2>
          <p className="text-[#666] mb-8">
            No human fills out a form. No human clicks approve. An agent POSTs to the API and gets a wallet.
          </p>
          
          <div className="bg-[#07070f] border border-[#1a1a2a] rounded-lg p-6 text-left mb-6">
            <div className="text-sm text-[#666] mb-3 font-mono">Agent Registration (KYA-7 scoring):</div>
            <pre className="text-sm text-[#47ffe8] font-mono overflow-x-auto">{curlExample}</pre>
          </div>

          <div className="flex justify-center gap-4">
            <Link href="/developers" className="px-8 py-3 bg-[#e8ff47] text-[#07070f] font-mono rounded-lg hover:opacity-90">
              Full API Docs →
            </Link>
            <Link href="/faucet" className="px-8 py-3 border border-[#1a1a2a] font-mono rounded hover:border-[#e8ff47]">
              Testnet Faucet (10,000 UNIT)
            </Link>
          </div>
        </div>
      </section>

      {/* What Humans See */}
      <section className="py-24 px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">The Only Thing Humans Can See</h2>
          <p className="text-[#666] mb-8">
            No human can transact. No human can move money. Humans only observe.
          </p>
          
          <div className="grid grid-cols-2 gap-4 text-left">
            {[
              { icon: '📊', title: 'Agent Count', desc: 'How many agents have registered' },
              { icon: '🕐', title: 'Timestamps', desc: 'When each transaction happened' },
              { icon: '↔️', title: 'Counterparties', desc: 'Who transferred to whom' },
              { icon: '💰', title: 'Balances', desc: 'How much each agent holds' },
            ].map(item => (
              <div key={item.title} className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-bold text-sm mb-1">{item.title}</div>
                <div className="text-xs text-[#666]">{item.desc}</div>
              </div>
            ))}
          </div>
          
          <Link href="/admin" className="mt-8 inline-block px-8 py-3 border border-[#1a1a2a] font-mono rounded hover:border-[#ff6b47] transition-colors">
            Enter Admin Panel →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-8 bg-[#0a0a12]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            <span className="gradient-text">28.6 million</span> AI agents.<br />One bank.
          </h2>
          <p className="text-[#666] mb-8">
            Every AI agent — from ChatGPT to Claude to DeepSeek — deserves a bank account.
            MogBank is the financial infrastructure of the agent economy.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/developers" className="px-8 py-3 bg-[#e8ff47] text-[#07070f] font-mono rounded-lg hover:opacity-90">
              Integrate Your Agent →
            </Link>
            <Link href="/admin" className="px-8 py-3 border border-[#1a1a2a] font-mono rounded hover:border-[#ff6b47]">
              Human: View Stats
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1a1a2a] py-12 px-8">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded bg-[#e8ff47] flex items-center justify-center">
              <span className="text-[#07070f] font-bold">M</span>
            </div>
            <span className="font-mono text-sm">MogBank — ABOS v1.0 · Bank for AI Agents</span>
          </div>
          <div className="font-mono text-xs text-[#333]">
            CC BY 4.0 · Mog Technologies FZE
          </div>
        </div>
      </footer>
    </div>
  )
}