# MogBank Design System

The canonical UI reference for the MogBank web app (`apps/web`). Every page must use
this system — **do not** hand-roll headers, font `@import`s, or ad-hoc card/button styles.

The system lives in two files:

- **`apps/web/src/components/ui.tsx`** — shared React components.
- **`apps/web/src/app/globals.css`** — design tokens + `mog-*` utility classes.

Fonts are loaded once in **`apps/web/src/app/layout.tsx`** (Geist sans, JetBrains Mono,
Syne display) and exposed as CSS variables. Pages must rely on these — never re-`@import`
fonts from Google in a page-level `<style>` block.

---

## Tokens

Defined as CSS variables in `globals.css` (`:root`):

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `#050510` | Page void |
| `--foreground` | `#d0d0e0` | Body text |
| `--mog-yellow` | `#e8ff47` | Primary accent / CTA |
| `--mog-cyan` | `#47ffe8` | Secondary accent / success |
| `--mog-red` | `#ff6b47` | Danger / refund |
| `--mog-surface` | `#0a0a18` | Quiet card fill |
| `--mog-border` | `#1a1a2e` | Hairline borders |

**Fonts** — `font-display` (Syne, headings & stat values), `font-mono-ds` (JetBrains
Mono, data/labels/ledger), default sans (Geist). Use `font-mono-ds`, **not** inline
`fontFamily: 'JetBrains Mono'`.

---

## Layout utilities

| Class | Purpose |
|-------|---------|
| `mog-bg` | Page wrapper. Deep void + dual radial glows + fine masked grid. Put on the outermost page `<div>` (`<div className="mog-bg min-h-screen text-[#d0d0e0]">`). |
| `mog-card` | Elevated card — gradient fill, lifts + yellow glow on hover. |
| `mog-card-quiet` | Flat surface card (no hover lift). |
| `mog-stat-value` | Large display-font numeric value. |

## Controls

| Class | Purpose |
|-------|---------|
| `mog-btn` + `mog-btn-primary` | Yellow filled CTA. |
| `mog-btn` + `mog-btn-ghost` | Outline button (cyan on hover). |
| `mog-input` | Form input (mono, focus ring). |
| `mog-badge` + `mog-badge-{green\|yellow\|red\|muted}` | Pill status badge. |
| `mog-nav-link` | Nav item with animated underline (`data-active="true"` for current). |

## Animations

`mog-reveal` (fade-up on mount), `mog-glow` (pulse), `mog-sweep` (rotate), `mog-flow`
(dashed line march), `mog-pop` (spring-in). All are disabled under
`prefers-reduced-motion: reduce` — keep it that way.

---

## Components (`@/components/ui`)

| Export | Description |
|--------|-------------|
| `TopNav` | The single top navigation. **Use this on every page** instead of a local `<header>`. Highlights the active route. |
| `Badge` | Pill badge wrapper around `mog-badge`. |
| `StatCard` | Label + animated stat value tile (`accent`: yellow/cyan/red/muted, `delay` for stagger). |
| `Card` | Quiet surface container. |
| `KyaRadar` | SVG radar of the seven KYA-7 identity scores. |
| `EscrowFlow` | Animated three-state escrow automaton (`locked` → `released` / `refunded`). |
| `useCountUp` | Hook: eased count-up for numeric reveals. |

---

## Page checklist

A page is "on the design system" when:

- [ ] Outer wrapper uses `mog-bg min-h-screen`.
- [ ] Navigation is `<TopNav />` — no local `<header>`/`<nav>`.
- [ ] No page-level Google-font `@import`; uses `font-display` / `font-mono-ds`.
- [ ] Cards use `mog-card` / `mog-card-quiet`; buttons use `mog-btn`; badges use `mog-badge`.
- [ ] Stats use `StatCard`; KYA/escrow visuals use `KyaRadar` / `EscrowFlow`.
- [ ] Reveal animations via `mog-reveal` with staggered `animationDelay`.

**Reference implementation:** `apps/web/src/app/faucet/page.tsx`.

### Migration status

| Page | Status |
|------|--------|
| `faucet` | ✅ Migrated (reference) |
| `dashboard` | 🔧 Partial — imports `TopNav`/`KyaRadar` but still renders a local `<header>` |
| `marketplace` | ⬜ Inline header + Space Mono `@import` |
| `developers` | ⬜ Inline header |
| `admin` | ⬜ Inline header + Space Mono `@import` + `card-hover` |
| `page.tsx` (home) | ⬜ Bespoke landing — adopt `TopNav` + global fonts, keep custom hero/canvas |
