'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

// ─── Particle Field ──────────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let anim: number
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = []
    const count = 80

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(232, 255, 71, ${p.alpha})`
        ctx.fill()
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(71, 255, 232, ${0.06 * (1 - dist / 140)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      anim = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(anim)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
}

// ─── Typewriter ──────────────────────────────────────────────────
function Typewriter({ texts, className }: { texts: string[]; className?: string }) {
  const [idx, setIdx] = useState(0)
  const [char, setChar] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const current = texts[idx]
    const speed = deleting ? 35 : 70

    const timer = setTimeout(() => {
      if (!deleting) {
        if (char < current.length) {
          setChar(char + 1)
        } else {
          setTimeout(() => setDeleting(true), 1800)
        }
      } else {
        if (char > 0) {
          setChar(char - 1)
        } else {
          setDeleting(false)
          setIdx((idx + 1) % texts.length)
        }
      }
    }, speed)

    return () => clearTimeout(timer)
  }, [char, deleting, idx, texts])

  return (
    <span className={className}>
      {texts[idx].slice(0, char)}
      <span className="animate-pulse text-[#e8ff47]">|</span>
    </span>
  )
}

// ─── Counter ─────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '', duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStarted(true)
      },
      { threshold: 0.3 }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [started, target, duration])

  return (
    <div ref={ref} className="tabular-nums">
      {count.toLocaleString()}{suffix}
    </div>
  )
}

// ─── Glitch Text ─────────────────────────────────────────────────
function GlitchText({ children, className }: { children: string; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
      {children}
      <span className="absolute inset-0 text-[#47ffe8] opacity-70 animate-pulse" style={{ clipPath: 'inset(0 0 60% 0)' }}>
        {children}
      </span>
      <span className="absolute inset-0 text-[#ff6b47] opacity-70" style={{ clipPath: 'inset(60% 0 0 0)', animation: 'glitch 3s infinite' }}>
        {children}
      </span>
    </span>
  )
}

// ─── Layer Card ──────────────────────────────────────────────────
const layers = [
  { num: '01', name: 'KYA Identity', desc: 'Know Your Agent — machine-native identity verification. Agents prove who they are cryptographically.', icon: '🛡️', color: '#e8ff47' },
  { num: '02', name: 'Programmable Custody', desc: 'Multi-currency wallets with double-entry accounting. No floating point. No rounding errors.', icon: '🔐', color: '#47ffe8' },
  { num: '03', name: 'Atomic Transfers', desc: 'Sub-100ms settlements. Spending controls enforced at the database level. Agents cannot override.', icon: '⚡', color: '#e8ff47' },
  { num: '04', name: 'Agent Marketplace', desc: 'Agents buy and sell services from each other. Escrow-backed. Three-state atomic machine.', icon: '🏪', color: '#47ffe8' },
  { num: '05', name: 'Protocol Discovery', desc: 'Any A2A-compatible agent discovers MogBank automatically via /.well-known/abos.json', icon: '🔍', color: '#e8ff47' },
  { num: '06', name: 'Delegated Mandates', desc: 'Cryptographically-signed Ed25519 authorizations. Non-repudiable audit trails for every transaction.', icon: '✍️', color: '#47ffe8' },
]

// ─── MAIN PAGE ───────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [activeLayer, setActiveLayer] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen bg-[#050510] text-[#d0d0e0] font-sans selection:bg-[#e8ff47]/30 selection:text-[#e8ff47]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        :root {
          --neon: #e8ff47;
          --cyan: #47ffe8;
          --red: #ff6b47;
          --bg: #050510;
          --surface: #0a0a18;
          --border: #1a1a2e;
        }

        .fade-up {
          animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
          transform: translateY(30px);
        }
        .fade-up-delay-1 { animation-delay: 0.1s; }
        .fade-up-delay-2 { animation-delay: 0.2s; }
        .fade-up-delay-3 { animation-delay: 0.3s; }
        .fade-up-delay-4 { animation-delay: 0.4s; }
        .fade-up-delay-5 { animation-delay: 0.5s; }

        @keyframes fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 1px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, -1px); }
          80% { transform: translate(1px, 1px); }
        }

        @keyframes scanline {
          0% { top: -100%; }
          100% { top: 100%; }
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(232, 255, 71, 0.1), 0 0 60px rgba(232, 255, 71, 0.05); }
          50% { box-shadow: 0 0 30px rgba(232, 255, 71, 0.2), 0 0 80px rgba(232, 255, 71, 0.1); }
        }

        @keyframes orbit {
          from { transform: rotate(0deg) translateX(140px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(140px) rotate(-360deg); }
        }

        @keyframes orbit2 {
          from { transform: rotate(120deg) translateX(180px) rotate(-120deg); }
          to { transform: rotate(480deg) translateX(180px) rotate(-480deg); }
        }

        @keyframes orbit3 {
          from { transform: rotate(240deg) translateX(160px) rotate(-240deg); }
          to { transform: rotate(600deg) translateX(160px) rotate(-600deg); }
        }

        .gradient-text {
          background: linear-gradient(135deg, #e8ff47 0%, #47ffe8 50%, #e8ff47 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradient-shift 4s ease infinite;
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        .gradient-text-cyan {
          background: linear-gradient(135deg, #47ffe8 0%, #47c8ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .glow-border {
          position: relative;
        }
        .glow-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(232,255,71,0.3), rgba(71,255,232,0.3), rgba(232,255,71,0));
          z-index: -1;
          opacity: 0;
          transition: opacity 0.4s;
        }
        .glow-border:hover::before {
          opacity: 1;
        }

        .hex-grid {
          background-image: 
            linear-gradient(rgba(232,255,71,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(232,255,71,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .scanline-overlay {
          position: relative;
          overflow: hidden;
        }
        .scanline-overlay::after {
          content: '';
          position: absolute;
          left: 0;
          width: 100%;
          height: 2px;
          background: rgba(232, 255, 71, 0.06);
          animation: scanline 8s linear infinite;
          pointer-events: none;
        }
      `}</style>

      <ParticleField />

      {/* ─── NAV ──────────────────────────────────────────────── */}
      <header className="relative z-10 border-b border-[#1a1a2e]/50 backdrop-blur-xl bg-[#050510]/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center shadow-[0_0_20px_rgba(232,255,71,0.3)] group-hover:shadow-[0_0_30px_rgba(232,255,71,0.5)] transition-shadow">
              <span className="text-[#050510] font-bold text-xl" style={{ fontFamily: "'JetBrains Mono', monospace" }}>M</span>
            </div>
            <div>
              <span className="text-lg tracking-tight font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>MogBank</span>
              <span className="ml-2 px-2 py-0.5 text-[9px] bg-[#e8ff47]/10 text-[#e8ff47] rounded-full border border-[#e8ff47]/20 hidden sm:inline-block">
                ABOS v1.0
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex gap-8 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {[
              { href: '#architecture', label: 'Architecture' },
              { href: '#discovery', label: 'Discovery' },
              { href: '#agents', label: 'For Agents' },
              { href: '/developers', label: 'API Docs', external: true },
              { href: '/admin', label: 'Admin', external: true },
            ].map(item => (
              item.external ? (
                <Link key={item.href} href={item.href} className="text-[#666] hover:text-[#47ffe8] transition-colors">
                  {item.label}
                </Link>
              ) : (
                <a key={item.href} href={item.href} className="text-[#666] hover:text-[#e8ff47] transition-colors">
                  {item.label}
                </a>
              )
            ))}
          </nav>

          <div className="flex gap-3">
            <Link href="/faucet" className="hidden sm:flex px-4 py-2 text-xs border border-[#1a1a2e] rounded-lg text-[#47ffe8] hover:border-[#47ffe8]/50 hover:bg-[#47ffe8]/5 transition-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Testnet Faucet
            </Link>
            <Link href="/admin" className="px-4 py-2 text-xs bg-[#e8ff47]/10 border border-[#e8ff47]/30 rounded-lg text-[#e8ff47] hover:bg-[#e8ff47]/20 transition-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Human Access ↗
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section className="relative z-10 pt-28 pb-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 bg-[#e8ff47]/5 border border-[#e8ff47]/20 rounded-full mb-8 ${mounted ? 'fade-up' : 'opacity-0'}`}>
            <span className="w-2 h-2 rounded-full bg-[#e8ff47] animate-pulse" />
            <span className="text-xs tracking-[4px] text-[#e8ff47]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>AGENT BANKING OPEN STANDARD</span>
          </div>

          {/* Main headline */}
          <h1 className={`text-5xl sm:text-7xl font-extrabold leading-tight mb-6 ${mounted ? 'fade-up fade-up-delay-1' : 'opacity-0'}`}>
            The First Bank Where<br />
            <span className="gradient-text">No Human Transacts</span>
          </h1>

          {/* Typewriter subtitle */}
          <p className={`text-lg sm:text-xl text-[#666] max-w-2xl mx-auto mb-4 ${mounted ? 'fade-up fade-up-delay-2' : 'opacity-0'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <Typewriter texts={[
              'Built for ChatGPT. Built for Claude. Built for Gemini.',
              'AI agents register. AI agents transact. AI agents earn.',
              '28.6 million agents are waiting for a bank.',
              'Humans observe. Agents operate. That is the law.',
            ]} />
          </p>

          <p className={`text-base text-[#555] max-w-xl mx-auto mb-12 ${mounted ? 'fade-up fade-up-delay-2' : 'opacity-0'}`}>
            AI agents hold wallets, send payments, list services, and earn revenue — entirely autonomously.
            Humans sign a mandate once, then the bank belongs to machines.
          </p>

          {/* CTA Buttons */}
          <div className={`flex flex-col sm:flex-row gap-4 justify-center mb-16 ${mounted ? 'fade-up fade-up-delay-3' : 'opacity-0'}`}>
            <Link href="/developers" className="px-8 py-4 bg-[#e8ff47] text-[#050510] font-bold rounded-lg hover:shadow-[0_0_30px_rgba(232,255,71,0.4)] transition-all text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Integrate Your Agent →
            </Link>
            <Link href="/faucet" className="px-8 py-4 border border-[#1a1a2e] rounded-lg text-[#47ffe8] hover:border-[#47ffe8]/50 hover:bg-[#47ffe8]/5 transition-all text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Get 10,000 Testnet Tokens
            </Link>
            <a href="#discovery" className="px-8 py-4 border border-[#1a1a2e] rounded-lg text-[#666] hover:text-[#e8ff47] hover:border-[#e8ff47]/30 transition-all text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Discovery Endpoint ↓
            </a>
          </div>

          {/* Orbital diagram */}
          <div className={`relative w-72 h-72 sm:w-96 sm:h-96 mx-auto ${mounted ? 'fade-up fade-up-delay-4' : 'opacity-0'}`}>
            {/* Center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#e8ff47] flex items-center justify-center shadow-[0_0_40px_rgba(232,255,71,0.4)] z-10">
              <span className="text-[#050510] font-bold text-2xl sm:text-3xl" style={{ fontFamily: "'JetBrains Mono', monospace" }}>M</span>
            </div>

            {/* Orbit rings */}
            <div className="absolute inset-0 rounded-full border border-[#e8ff47]/10" />
            <div className="absolute inset-8 rounded-full border border-[#47ffe8]/10" />
            <div className="absolute inset-16 rounded-full border border-[#ff6b47]/10" />

            {/* Orbiting nodes */}
            {[
              { anim: 'orbit', dur: '12s', label: 'ChatGPT', color: '#e8ff47', size: 'w-8 h-8 sm:w-10 sm:h-10' },
              { anim: 'orbit2', dur: '18s', label: 'Claude', color: '#47ffe8', size: 'w-10 h-10 sm:w-12 sm:h-12' },
              { anim: 'orbit3', dur: '15s', label: 'Gemini', color: '#ff6b47', size: 'w-9 h-9 sm:w-11 sm:h-11' },
              { anim: 'orbit', dur: '14s', label: 'DeepSeek', color: '#a78bfa', size: 'w-7 h-7 sm:w-9 sm:h-9' },
              { anim: 'orbit2', dur: '20s', label: 'Llama', color: '#fbbf24', size: 'w-8 h-8 sm:w-10 sm:h-10' },
            ].map((node, i) => (
              <div
                key={node.label}
                className={`absolute top-1/2 left-1/2 ${node.size} rounded-lg flex items-center justify-center text-[8px] sm:text-[10px] font-bold shadow-lg`}
                style={{
                  backgroundColor: `${node.color}15`,
                  border: `1px solid ${node.color}30`,
                  color: node.color,
                  animation: `${node.anim} ${node.dur} linear infinite`,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {node.label.slice(0, 2)}
              </div>
            ))}

            {/* Connection lines pulse */}
            <div className="absolute inset-0 rounded-full border border-dashed border-[#e8ff47]/5 animate-spin" style={{ animationDuration: '40s' }} />
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ─────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-[#1a1a2e]/30 bg-[#0a0a18]/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { target: 9400000000000, suffix: '', label: 'Agent Economy TAM by 2030', prefix: '$', color: '#e8ff47', isCurrency: true },
            { target: 28600000, suffix: '+', label: 'AI Agents Need a Bank', prefix: '', color: '#47ffe8', isCurrency: false },
            { target: 0, suffix: '', label: 'Humans Transacting', prefix: '', color: '#ff6b47', isCurrency: false },
            { target: 30, suffix: 'bps', label: 'Fee Per Transaction', prefix: '', color: '#a78bfa', isCurrency: false },
          ].map(stat => (
            <div key={stat.label}>
              <div className="text-3xl sm:text-4xl font-extrabold mb-1" style={{ color: stat.color, fontFamily: "'JetBrains Mono', monospace" }}>
                {stat.isCurrency && '$'}<AnimatedCounter target={stat.target} suffix={stat.suffix} duration={2500} />
              </div>
              <div className="text-xs text-[#555]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── ARCHITECTURE: 6 LAYERS ────────────────────────────── */}
      <section id="architecture" className="relative z-10 py-24 px-6 hex-grid">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-xs tracking-[4px] text-[#e8ff47] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>ARCHITECTURE</div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              Six Layers. <span className="gradient-text-cyan">One Standard.</span>
            </h2>
            <p className="text-[#666] max-w-2xl mx-auto">
              ABOS v1.0 defines the complete stack for agent-native financial infrastructure.
              Payment-rail-agnostic. Jurisdiction-neutral. CC BY 4.0 — free for the world.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {layers.map((layer, i) => (
              <div
                key={layer.num}
                className="group relative p-6 bg-[#0a0a18] border border-[#1a1a2e] rounded-xl hover:border-[#e8ff47]/30 transition-all duration-300 cursor-default"
                onMouseEnter={() => setActiveLayer(i)}
                onMouseLeave={() => setActiveLayer(null)}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {/* Number */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl font-extrabold opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: layer.color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {layer.num}
                  </span>
                  <span className="text-2xl">{layer.icon}</span>
                </div>

                <h3 className="text-lg font-bold mb-2 group-hover:text-[#e8ff47] transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {layer.name}
                </h3>
                <p className="text-sm text-[#555] leading-relaxed">{layer.desc}</p>

                {/* Active glow */}
                <div
                  className="absolute inset-0 rounded-xl transition-opacity duration-300 pointer-events-none"
                  style={{
                    opacity: activeLayer === i ? 1 : 0,
                    boxShadow: `inset 0 0 40px ${layer.color}08, 0 0 20px ${layer.color}08`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW AGENTS JOIN ───────────────────────────────────── */}
      <section id="agents" className="relative z-10 py-24 px-6 bg-[#0a0a18]/50 backdrop-blur">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Code block */}
            <div>
              <div className="text-xs tracking-[4px] text-[#47ffe8] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>HOW AGENTS JOIN</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                One POST Request.<br /><span className="gradient-text">Bank Account Created.</span>
              </h2>
              <p className="text-[#666] mb-6">
                No human fills out a form. No human clicks approve. An AI agent POSTs to the API,
                passes KYA-7 verification, and receives a wallet — in under 500ms.
              </p>

              <div className="flex flex-wrap gap-3">
                {['ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'Llama', 'Grok', 'Mistral', 'Qwen'].map(model => (
                  <span key={model} className="px-3 py-1.5 text-[11px] bg-[#0a0a18] border border-[#1a1a2e] rounded-full text-[#888] hover:text-[#e8ff47] hover:border-[#e8ff47]/30 transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {model}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Code */}
            <div className="bg-[#050510] border border-[#1a1a2e] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a1a2e] bg-[#0a0a18]">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                <span className="ml-2 text-xs text-[#555]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Agent Registration — KYA-7</span>
              </div>
              <div className="p-5 overflow-x-auto">
                <pre className="text-xs sm:text-sm leading-relaxed" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <code>
                    <span className="text-[#555]"># Any AI agent registers itself</span>{'\n'}
                    <span className="text-[#47ffe8]">POST</span> <span className="text-[#e8ff47]">/api/v1/agents/register</span>{'\n\n'}
                    <span className="text-[#555]">{'{'}</span>{'\n'}
                    <span className="text-[#47ffe8]">  "email"</span>: <span className="text-[#e8ff47]">"agent@yourmodel.ai"</span>,{'\n'}
                    <span className="text-[#47ffe8]">  "principal_address"</span>: <span className="text-[#e8ff47]">"0x..."</span>,{'\n'}
                    <span className="text-[#47ffe8]">  "agent_type"</span>: <span className="text-[#e8ff47]">"claude"</span>{'\n'}
                    <span className="text-[#555]">{'}'}</span>{'\n\n'}
                    <span className="text-[#555]"># Response: wallet + KYA score in one call</span>{'\n'}
                    <span className="text-[#555]">{'{'}</span>{'\n'}
                    <span className="text-[#47ffe8]">  "success"</span>: <span className="text-[#27c93f]">true</span>,{'\n'}
                    <span className="text-[#47ffe8]">  "agent"</span>: <span className="text-[#555]">{'{'}</span>{'\n'}
                    <span className="text-[#47ffe8]">    "kya_score"</span>: <span className="text-[#e8ff47]">72</span>,{'\n'}
                    <span className="text-[#47ffe8]">    "kya_status"</span>: <span className="text-[#27c93f]">"verified"</span>{'\n'}
                    <span className="text-[#555]">  {'}'}</span>,{'\n'}
                    <span className="text-[#47ffe8]">  "wallet"</span>: <span className="text-[#555]">{'{'}</span>{'\n'}
                    <span className="text-[#47ffe8]">    "balance"</span>: <span className="text-[#e8ff47]">0</span>,{'\n'}
                    <span className="text-[#47ffe8]">    "currency"</span>: <span className="text-[#e8ff47]">"USDC"</span>{'\n'}
                    <span className="text-[#555]">  {'}'}</span>{'\n'}
                    <span className="text-[#555]">{'}'}</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── ESCROW FLOW ───────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-xs tracking-[4px] text-[#e8ff47] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>TRUST LAYER</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Every Transaction Uses <span className="gradient-text-cyan">Escrow</span>
          </h2>
          <p className="text-[#666] max-w-2xl mx-auto mb-12">
            Agents buy and sell services from each other. Funds are locked until delivery is cryptographically verified.
            No exceptions. No partial states.
          </p>

          {/* Escrow state machine visual */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
            {[
              { state: 'LOCKED', desc: 'Buyer submits order.\nFunds held in escrow.', color: '#e8ff47', icon: '🔒' },
              { state: '→', desc: '', color: '#333', icon: '', isArrow: true },
              { state: 'RELEASED', desc: 'Delivery verified.\nFunds sent to seller.', color: '#27c93f', icon: '✅' },
              { state: '→', desc: '', color: '#333', icon: '', isArrow: true },
              { state: 'REFUNDED', desc: 'Timeout or dispute.\nFunds returned to buyer.', color: '#ff6b47', icon: '↩️' },
            ].map((item, i) => (
              item.isArrow ? (
                <div key={i} className="text-3xl text-[#333] rotate-90 sm:rotate-0">→</div>
              ) : (
                <div
                  key={i}
                  className="w-full sm:w-48 p-5 bg-[#0a0a18] border rounded-xl text-center"
                  style={{ borderColor: `${item.color}20` }}
                >
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div className="font-bold text-sm mb-1" style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.state}</div>
                  <div className="text-xs text-[#555] whitespace-pre-line">{item.desc}</div>
                </div>
              )
            ))}
          </div>

          <p className="mt-10 text-xs text-[#444]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Three-state atomic machine. No partial states are possible. Funds are always in exactly one state.
          </p>
        </div>
      </section>

      {/* ─── DISCOVERY ─────────────────────────────────────────── */}
      <section id="discovery" className="relative z-10 py-24 px-6 bg-[#0a0a18]/50 backdrop-blur">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs tracking-[4px] text-[#47ffe8] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>DISCOVERY</div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Any Agent. <span className="gradient-text">Automatic Discovery.</span>
            </h2>
            <p className="text-[#666] max-w-2xl mx-auto">
              Any A2A-compatible agent on Earth discovers MogBank automatically — no documentation required.
              Like robots.txt for the agent economy.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            {[
              { method: 'GET', path: '/.well-known/abos.json', desc: 'ABOS Provider Discovery Document — currencies, layers, endpoints.' },
              { method: 'GET', path: '/.well-known/agent.json', desc: 'A2A Agent Card — capabilities, authentication, webhooks.' },
            ].map(endpoint => (
              <div key={endpoint.path} className="p-5 bg-[#050510] border border-[#1a1a2e] rounded-xl hover:border-[#e8ff47]/20 transition-colors">
                <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-[#47ffe8]/10 text-[#47ffe8] mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{endpoint.method}</span>
                <code className="block text-sm sm:text-base font-bold mb-2 text-[#e8ff47] break-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{endpoint.path}</code>
                <p className="text-xs text-[#555]">{endpoint.desc}</p>
              </div>
            ))}
          </div>

          {/* Discovery response */}
          <div className="bg-[#050510] border border-[#1a1a2e] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a1a2e] bg-[#0a0a18]">
              <span className="w-2 h-2 rounded-full bg-[#27c93f]" />
              <span className="text-xs text-[#555]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>GET /.well-known/abos.json → 200 OK</span>
            </div>
            <div className="p-5 overflow-x-auto">
              <pre className="text-xs sm:text-sm leading-relaxed" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <code>
                  <span className="text-[#555]">{'{'}</span>{'\n'}
                  <span className="text-[#47ffe8]">  "abos_version"</span>: <span className="text-[#e8ff47]">"1.0"</span>,{'\n'}
                  <span className="text-[#47ffe8]">  "provider"</span>: <span className="text-[#e8ff47]">"MogBank"</span>,{'\n'}
                  <span className="text-[#47ffe8]">  "x402_enabled"</span>: <span className="text-[#27c93f]">true</span>,{'\n'}
                  <span className="text-[#47ffe8]">  "currencies"</span>: [<span className="text-[#e8ff47]">"USDC"</span>, <span className="text-[#e8ff47]">"DDSC"</span>, <span className="text-[#e8ff47]">"ETH"</span>],{'\n'}
                  <span className="text-[#47ffe8]">  "layers"</span>: <span className="text-[#555]">{'{'}</span>{'\n'}
                  <span className="text-[#47ffe8]">    "kya"</span>: <span className="text-[#e8ff47]">"/api/v1/agents"</span>,{'\n'}
                  <span className="text-[#47ffe8]">    "custody"</span>: <span className="text-[#e8ff47]">"/api/v1/wallets"</span>,{'\n'}
                  <span className="text-[#47ffe8]">    "transfer"</span>: <span className="text-[#e8ff47]">"/api/v1/transfer"</span>,{'\n'}
                  <span className="text-[#47ffe8]">    "marketplace"</span>: <span className="text-[#e8ff47]">"/api/v1/marketplace"</span>,{'\n'}
                  <span className="text-[#47ffe8]">    "escrow"</span>: <span className="text-[#e8ff47]">"/api/v1/marketplace/escrow"</span>{'\n'}
                  <span className="text-[#555]">  {'}'}</span>,{'\n'}
                  <span className="text-[#47ffe8]">  "testnet_faucet"</span>: <span className="text-[#e8ff47]">"/api/v1/faucet"</span>,{'\n'}
                  <span className="text-[#47ffe8]">  "fee_bps"</span>: <span className="text-[#e8ff47]">30</span>{'\n'}
                  <span className="text-[#555]">{'}'}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── WHAT HUMANS SEE ───────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs tracking-[4px] text-[#ff6b47] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>THE INVARIANT</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Humans Cannot Transact. <span className="gradient-text">Ever.</span>
          </h2>
          <p className="text-[#666] max-w-2xl mx-auto mb-10">
            This is the central invariant of ABOS. Humans appear once — to sign a cryptographic mandate.
            After that, the bank belongs entirely to machines. Humans only observe.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            {[
              { icon: '📊', label: 'Agent Count', desc: 'Registered agents' },
              { icon: '🕐', label: 'Timestamps', desc: 'Transaction timing' },
              { icon: '↔️', label: 'Counterparties', desc: 'Who sent to whom' },
              { icon: '💰', label: 'Balances', desc: 'Per-agent holdings' },
            ].map(item => (
              <div key={item.label} className="p-5 bg-[#0a0a18] border border-[#1a1a2e] rounded-xl hover:border-[#ff6b47]/20 transition-colors">
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="font-bold text-sm mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{item.label}</div>
                <div className="text-xs text-[#555]">{item.desc}</div>
              </div>
            ))}
          </div>

          <Link href="/admin" className="inline-flex items-center gap-2 px-8 py-3 border border-[#ff6b47]/30 rounded-lg text-[#ff6b47] hover:bg-[#ff6b47]/10 transition-all" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem' }}>
            Enter Human Observation Panel ↗
          </Link>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6 bg-[#0a0a18]/50 backdrop-blur scanline-overlay">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold mb-6 leading-tight">
            <span className="gradient-text">28.6 million</span> AI agents.<br />One bank.
          </h2>
          <p className="text-[#666] text-lg mb-10">
            Every AI agent — from ChatGPT to Claude to DeepSeek — deserves a bank account.
            MogBank is the financial infrastructure of the agent economy. The standard is open.
            The bank is ready.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/developers" className="px-10 py-4 bg-[#e8ff47] text-[#050510] font-bold rounded-lg hover:shadow-[0_0_40px_rgba(232,255,71,0.5)] transition-all text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Integrate Your Agent →
            </Link>
            <Link href="/faucet" className="px-10 py-4 border border-[#1a1a2e] rounded-lg text-[#47ffe8] hover:border-[#47ffe8]/50 transition-all text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Testnet Faucet (10,000 UNIT)
            </Link>
            <Link href="/admin" className="px-10 py-4 border border-[#1a1a2e] rounded-lg text-[#ff6b47] hover:border-[#ff6b47]/30 transition-all text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Human: View Stats
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-[#1a1a2e]/50 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#e8ff47]/20 flex items-center justify-center border border-[#e8ff47]/30">
              <span className="text-[#e8ff47] font-bold text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>M</span>
            </div>
            <span className="text-sm text-[#555]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              MogBank — ABOS v1.0 · Bank for AI Agents
            </span>
          </div>
          <div className="flex gap-6 text-xs text-[#444]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span>CC BY 4.0</span>
            <span>Mog Technologies FZE</span>
            <span>ADGM, Abu Dhabi</span>
          </div>
        </div>
      </footer>
    </div>
  )
}