'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/* ----------------------------------------------------------------
   Top navigation — consistent across all inner pages
----------------------------------------------------------------- */
const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/faucet', label: 'Faucet' },
  { href: '/developers', label: 'Developers' },
  { href: '/admin', label: 'Admin' },
]

export function TopNav() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 border-b border-[#1a1a2e] bg-[#050510]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8ff47] text-[#0a0a12] font-display font-extrabold text-lg">
            M
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#47ffe8] mog-glow" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Mog<span className="text-[#e8ff47]">Bank</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-active={pathname?.startsWith(n.href) || undefined}
              className={`mog-nav-link font-mono-ds text-sm ${
                pathname?.startsWith(n.href) ? 'text-[#e8ff47]' : 'text-[#9a9ab0] hover:text-white'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="mog-badge mog-badge-green">
          <span className="h-1.5 w-1.5 rounded-full bg-[#47ffe8] mog-glow" /> testnet · ABOS 1.0
        </span>
      </div>
    </header>
  )
}

/* ----------------------------------------------------------------
   Primitives
----------------------------------------------------------------- */
type Accent = 'yellow' | 'cyan' | 'red' | 'muted'
const ACCENT: Record<Accent, string> = {
  yellow: '#e8ff47', cyan: '#47ffe8', red: '#ff6b47', muted: '#9a9ab0',
}

export function Badge({ tone = 'muted', children }: { tone?: 'green' | 'yellow' | 'red' | 'muted'; children: React.ReactNode }) {
  return <span className={`mog-badge mog-badge-${tone}`}>{children}</span>
}

export function StatCard({ label, value, accent = 'yellow', delay = 0 }: {
  label: string; value: React.ReactNode; accent?: Accent; delay?: number
}) {
  return (
    <div className="mog-card mog-reveal p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="font-mono-ds text-[0.7rem] uppercase tracking-widest text-[#6c6c84]">{label}</div>
      <div className="mog-stat-value mt-2 text-3xl" style={{ color: ACCENT[accent] }}>{value}</div>
    </div>
  )
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`mog-card-quiet ${className}`}>{children}</div>
}

/* Animated count-up for numeric reveals */
export function useCountUp(target: number, duration = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (Number.isNaN(target)) return
    let raf = 0; const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return v
}

/* ----------------------------------------------------------------
   KYA-7 radar — signature visualization of the seven KYA checks
----------------------------------------------------------------- */
const KYA_DIMS = [
  { key: 'principal_identity_score', label: 'Principal', max: 15 },
  { key: 'email_domain_score', label: 'Email', max: 10 },
  { key: 'agent_metadata_score', label: 'Metadata', max: 15 },
  { key: 'use_case_score', label: 'Use-case', max: 20 },
  { key: 'jurisdiction_risk_score', label: 'Jurisdiction', max: 15 },
  { key: 'technical_capability_score', label: 'Technical', max: 15 },
  { key: 'verification_mode_score', label: 'Verify', max: 10 },
]

export function KyaRadar({ scores, size = 280 }: { scores?: Record<string, number>; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.34
  const n = KYA_DIMS.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const point = (i: number, frac: number) => [cx + Math.cos(angle(i)) * r * frac, cy + Math.sin(angle(i)) * r * frac]
  const grid = [0.25, 0.5, 0.75, 1]
  const valFrac = (i: number) => {
    const d = KYA_DIMS[i]
    const v = scores?.[d.key] ?? 0
    return Math.max(0.04, Math.min(1, v / d.max))
  }
  const poly = KYA_DIMS.map((_, i) => point(i, valFrac(i)).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}>
      {grid.map((g) => (
        <polygon key={g} fill="none" stroke="#1a1a2e" strokeWidth="1"
          points={KYA_DIMS.map((_, i) => point(i, g).join(',')).join(' ')} />
      ))}
      {KYA_DIMS.map((d, i) => {
        const [x, y] = point(i, 1); const [lx, ly] = point(i, 1.18)
        return (
          <g key={d.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#1a1a2e" strokeWidth="1" />
            <text x={lx} y={ly} fill="#8a8aa0" fontSize="9" textAnchor="middle"
              dominantBaseline="middle" fontFamily="var(--font-geist-mono), monospace">{d.label}</text>
          </g>
        )
      })}
      <polygon points={poly} fill="rgba(232,255,71,0.15)" stroke="#e8ff47" strokeWidth="2"
        className="mog-pop" style={{ transformOrigin: 'center' }} />
      {KYA_DIMS.map((_, i) => {
        const [x, y] = point(i, valFrac(i))
        return <circle key={i} cx={x} cy={y} r="3" fill="#47ffe8" />
      })}
    </svg>
  )
}

/* ----------------------------------------------------------------
   Escrow state machine — animated three-state automaton
----------------------------------------------------------------- */
export function EscrowFlow({ active = 'locked' }: { active?: 'locked' | 'released' | 'refunded' }) {
  const states = [
    { id: 'locked', label: 'LOCKED', tone: '#e8ff47', desc: 'Funds held' },
    { id: 'released', label: 'RELEASED', tone: '#47ffe8', desc: 'Paid to seller' },
    { id: 'refunded', label: 'REFUNDED', tone: '#ff6b47', desc: 'Returned to buyer' },
  ]
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      {states.map((s, i) => (
        <div key={s.id} className="flex items-center gap-4">
          <div
            className={`mog-card-quiet flex w-36 flex-col items-center gap-1 p-4 text-center transition-all ${
              active === s.id ? 'mog-pop' : 'opacity-50'
            }`}
            style={active === s.id ? { borderColor: s.tone, boxShadow: `0 0 30px -10px ${s.tone}` } : {}}
          >
            <span className="font-mono-ds text-xs font-bold tracking-widest" style={{ color: s.tone }}>{s.label}</span>
            <span className="text-[0.7rem] text-[#6c6c84]">{s.desc}</span>
          </div>
          {i === 0 && (
            <svg width="40" height="20" className="hidden sm:block">
              <line x1="0" y1="10" x2="34" y2="10" stroke="#47ffe8" strokeWidth="2" className="mog-flow" />
              <path d="M30 5 L38 10 L30 15" fill="none" stroke="#47ffe8" strokeWidth="2" />
            </svg>
          )}
        </div>
      ))}
    </div>
  )
}
