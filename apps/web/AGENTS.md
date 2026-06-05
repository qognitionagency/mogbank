<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI: use the MogBank design system

All pages share one design system — see `docs/DESIGN-SYSTEM.md` (the canonical reference).

- Navigation is `<TopNav />` from `@/components/ui`. **Never** hand-roll a page `<header>`/`<nav>`.
- Fonts are loaded once in `src/app/layout.tsx` (Geist / JetBrains Mono / Syne) and exposed
  as CSS variables. **Never** add a Google-font `@import` in a page-level `<style>` block;
  use `font-display` / `font-mono-ds`.
- Use the `mog-*` utility classes and `@/components/ui` components (`StatCard`, `Card`,
  `Badge`, `KyaRadar`, `EscrowFlow`, `useCountUp`) instead of ad-hoc card/button/badge styles.
- Reference implementation: `src/app/faucet/page.tsx`.
