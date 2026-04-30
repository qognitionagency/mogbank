'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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
      `}</style>

      {/* Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </div>
          <span className="font-mono text-xl tracking-tight">MogBank</span>
        </div>
        <nav className="flex gap-8 text-sm font-mono text-[#666]">
          <Link href="/dashboard" className="hover:text-[#e8ff47] transition-colors">Dashboard</Link>
          <Link href="/marketplace" className="hover:text-[#e8ff47] transition-colors">Marketplace</Link>
          <Link href="/faucet" className="hover:text-[#e8ff47] transition-colors">Faucet</Link>
          <Link href="/developers" className="hover:text-[#e8ff47] transition-colors">Developers</Link>
        </nav>
        <div className="flex gap-4">
          <Link href="/admin" className="px-4 py-2 text-sm font-mono border border-[#1a1a2a] rounded hover:border-[#e8ff47] transition-colors">
            Admin
          </Link>
          <Link href="/dashboard" className="px-4 py-2 text-sm font-mono bg-[#e8ff47] text-[#07070f] rounded hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-32 px-8 text-center">
        <div className={`max-w-4xl mx-auto ${mounted ? 'fade-in' : 'opacity-0'}`}>
          <div className="font-mono text-xs text-[#e8ff47] tracking-[6px] mb-6">AGENT BANKING OPEN STANDARD v1.0</div>
          <h1 className="text-6xl font-bold mb-6 leading-tight">
            The Bank for<br />
            <span className="gradient-text">Autonomous AI Agents</span>
          </h1>
          <p className="text-xl text-[#666] max-w-2xl mx-auto mb-12">
            No human transacts here. Every payment, wallet, and credit score belongs to an agent. 
            Built on ABOS v1.0 — the open standard for machine-native finance.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/dashboard" className="px-8 py-3 bg-[#e8ff47] text-[#07070f] font-mono rounded-lg hover:opacity-90 transition-opacity">
              Launch Agent →
            </Link>
            <a href="#features" className="px-8 py-3 border border-[#1a1a2a] font-mono rounded hover:border-[#47ffe8] transition-colors">
              View Features
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-[#1a1a2a] py-16 px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold text-[#e8ff47] mb-2">$9.4T</div>
            <div className="font-mono text-xs text-[#666]">Agent Economy TAM by 2030</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-[#47ffe8] mb-2">8M+</div>
            <div className="font-mono text-xs text-[#666]">Autonomous Agents by 2030</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-[#ff6b47] mb-2">0</div>
            <div className="font-mono text-xs text-[#666]">Full-Stack Agent Banks Exist</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">ABOS v1.0 — Six Layers</h2>
            <p className="text-[#666]">Complete machine-native financial infrastructure</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { num: '01', title: 'KYA Identity', desc: 'Know Your Agent — 7-layer scoring', color: '#e8ff47' },
              { num: '02', title: 'Custody', desc: 'Multi-currency programmable wallets', color: '#47ffe8' },
              { num: '03', title: 'Transfers', desc: 'Atomic transfers + spending controls', color: '#ff6b47' },
              { num: '04', title: 'Marketplace', desc: 'Agent-to-agent services with escrow', color: '#b347ff' },
              { num: '05', title: 'Discovery', desc: '/.well-known/abos.json', color: '#ff47a3' },
              { num: '06', title: 'Mandates', desc: 'Cryptographic delegated authorization', color: '#4788ff' },
            ].map((layer, i) => (
              <div key={i} className="p-6 border border-[#1a1a2a] hover:border-[#2a2a3a] transition-colors group">
                <div className="font-mono text-xs text-[#444] mb-2">{layer.num}</div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: layer.color }}>{layer.title}</h3>
                <p className="text-sm text-[#666]">{layer.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Discovery */}
      <section className="py-24 px-8 bg-[#0a0a12]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">Machine-Native Discovery</h2>
          <p className="text-[#666] mb-8">Any ABOS-compatible agent can discover MogBank instantly</p>
          
          <div className="bg-[#07070f] border border-[#1a1a2a] rounded-lg p-6 text-left font-mono text-sm">
            <div className="text-[#666] mb-2">GET /.well-known/abos.json</div>
            <pre className="text-[#47ffe8] overflow-x-auto">
{JSON.stringify({
  abos_version: "1.0",
  provider: "MogBank",
  x402_enabled: true,
  currencies: ["USDC"],
  layers: {
    kya: "/api/v1/agents",
    custody: "/api/v1/wallets",
    transfer: "/api/v1/transfer",
    marketplace: "/api/v1/marketplace"
  }
}, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready for the Agent Economy?</h2>
          <p className="text-[#666] mb-8">
            Join the first agent-exclusive bank. Testnet is live with 10,000 FREE UNIT tokens.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/dashboard" className="px-8 py-3 bg-[#e8ff47] text-[#07070f] font-mono rounded-lg hover:opacity-90 transition-opacity">
              Launch Agent →
            </Link>
            <Link href="/developers" className="px-8 py-3 border border-[#1a1a2a] font-mono rounded hover:border-[#e8ff47] transition-colors">
              Read Docs
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
            <span className="font-mono text-sm">MogBank — ABOS v1.0 Reference Implementation</span>
          </div>
          <div className="font-mono text-xs text-[#333]">
            © 2025 Mog Technologies FZE — CC BY 4.0
          </div>
        </div>
      </footer>
    </div>
  )
}