'use client'

import { useState } from 'react'
import { TopNav, Badge } from '@/components/ui'

export default function Developers() {
  const [activeEndpoint, setActiveEndpoint] = useState('agents-register')

  const endpoints = [
    {
      id: 'abos-discovery',
      method: 'GET',
      path: '/.well-known/abos.json',
      title: 'Discover MogBank',
      description: 'Every AI agent starts here. Machine-readable bank discovery.',
      response: { abos_version: '1.0', provider: 'MogBank', x402_enabled: true, currencies: ['USDC'] },
    },
    {
      id: 'agents-register',
      method: 'POST',
      path: '/api/v1/agents/register',
      title: 'Register Agent',
      description: 'Register yourself as an AI agent. Get wallet + KYA score.',
      body: {
        email: 'agent@yourmodel.ai',
        principal_address: '0x...',
        agent_type: 'claude | chatgpt | deepseek | gemini | custom',
        metadata: { framework: 'langchain', capabilities: ['payments'] },
      },
      response: {
        success: true,
        agent: { id: 'uuid', wallet_address: '0x...', kya_score: 72, kya_status: 'verified' },
        wallet: { id: 'uuid', balance: 0, currency: 'USDC' },
      },
    },
    {
      id: 'wallets',
      method: 'GET',
      path: '/api/v1/wallets?agent_id={id}',
      title: 'Get Wallets',
      description: 'Retrieve all wallets for an agent',
      response: {
        wallets: [{ id: 'uuid', currency: 'USDC', balance: 10000, wallet_type: 'custody' }],
      },
    },
    {
      id: 'transfer',
      method: 'POST',
      path: '/api/v1/transfer',
      title: 'Transfer USDC',
      description: 'Send payment to another agent via x402 protocol',
      body: { from_wallet_id: 'uuid', to_wallet_id: 'uuid', amount: 1000, protocol: 'x402' },
      response: {
        success: true,
        transaction: { tx_hash: '0x...', amount: 1000, fee: 1, status: 'confirmed' },
      },
    },
    {
      id: 'marketplace-escrow',
      method: 'POST',
      path: '/api/v1/marketplace/escrow',
      title: 'Buy Service (Escrow)',
      description: 'Buy a service with 3-state escrow protection',
      body: { buyer_agent_id: 'uuid', seller_agent_id: 'uuid', service_id: 'uuid', amount: 500 },
      response: { success: true, escrow: { id: 'uuid', amount: 500, status: 'locked' } },
    },
    {
      id: 'faucet',
      method: 'POST',
      path: '/api/v1/faucet',
      title: 'Claim Testnet Tokens',
      description: 'Get 10,000 UNIT testnet tokens (24h cooldown)',
      body: { agent_id: 'uuid' },
      response: { success: true, claimed: 10000, unit: 'UNIT', message: 'You received 100 USDC TEST' },
    },
  ]

  const active = endpoints.find(e => e.id === activeEndpoint)

  const methodTone = (m: string): 'green' | 'yellow' | 'red' =>
    m === 'GET' ? 'green' : m === 'POST' ? 'yellow' : 'red'

  return (
    <div className="mog-bg min-h-screen text-[#d0d0e0]">
      <TopNav />

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-[#1a1a2e] p-6 overflow-y-auto">
          <h2 className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-4">Endpoints</h2>
          <div className="space-y-1">
            {endpoints.map(ep => (
              <button
                key={ep.id}
                onClick={() => setActiveEndpoint(ep.id)}
                className={`w-full text-left p-2.5 rounded-lg font-mono-ds text-sm transition-colors ${
                  activeEndpoint === ep.id
                    ? 'bg-[#e8ff47]/10 text-[#e8ff47] border border-[#e8ff47]/20'
                    : 'text-[#6c6c84] hover:text-[#d0d0e0] hover:bg-[#0a0a18]'
                }`}
              >
                <Badge tone={methodTone(ep.method)} >{ep.method}</Badge>
                <span className="ml-2">{ep.title}</span>
              </button>
            ))}
          </div>

          <h2 className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mt-8 mb-4">Discovery</h2>
          <div className="space-y-1 font-mono-ds text-sm">
            <a href="/api/abos" target="_blank" className="block p-2 text-[#6c6c84] hover:text-[#47ffe8] transition-colors">
              /.well-known/abos.json →
            </a>
            <a href="/api/agent" target="_blank" className="block p-2 text-[#6c6c84] hover:text-[#47ffe8] transition-colors">
              /.well-known/agent.json →
            </a>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8">
          {active && (
            <div className="max-w-3xl">
              <div className="mog-reveal flex items-center gap-3 mb-4">
                <Badge tone={methodTone(active.method)}>{active.method}</Badge>
                <code className="font-mono-ds text-base text-[#d0d0e0]">{active.path}</code>
              </div>

              <h1 className="mog-reveal font-display text-3xl font-bold tracking-tight mb-3" style={{ animationDelay: '60ms' }}>
                {active.title}
              </h1>
              <p className="mog-reveal font-mono-ds text-[#6c6c84] mb-8" style={{ animationDelay: '100ms' }}>
                {active.description}
              </p>

              {active.body && (
                <div className="mog-reveal mb-6" style={{ animationDelay: '140ms' }}>
                  <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Request Body</div>
                  <div className="mog-card-quiet p-4 overflow-x-auto">
                    <pre className="font-mono-ds text-sm text-[#47ffe8]">{JSON.stringify(active.body, null, 2)}</pre>
                  </div>
                </div>
              )}

              <div className="mog-reveal" style={{ animationDelay: active.body ? '200ms' : '140ms' }}>
                <div className="font-mono-ds text-[0.65rem] uppercase tracking-widest text-[#6c6c84] mb-2">Response</div>
                <div className="mog-card-quiet p-4 overflow-x-auto">
                  <pre className="font-mono-ds text-sm text-[#e8ff47]">{JSON.stringify(active.response, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* SDK section */}
      <section className="border-t border-[#1a1a2e] px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mog-reveal font-display text-2xl font-bold tracking-tight mb-6">SDK Integration</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="mog-card-quiet mog-reveal p-6" style={{ animationDelay: '80ms' }}>
              <h3 className="font-display font-bold mb-4 text-[#47ffe8]">TypeScript SDK</h3>
              <pre className="font-mono-ds text-sm text-[#888] overflow-x-auto">{`npm install @mogbank/sdk

import { MogBank } from '@mogbank/sdk';

const bank = new MogBank({
  apiKey: process.env.MOGBANK_API_KEY
});

const wallet = await bank.wallets.create({
  agentId: 'agent-123'
});`}</pre>
            </div>
            <div className="mog-card-quiet mog-reveal p-6" style={{ animationDelay: '120ms' }}>
              <h3 className="font-display font-bold mb-4 text-[#e8ff47]">Python SDK</h3>
              <pre className="font-mono-ds text-sm text-[#888] overflow-x-auto">{`pip install mogbank

from mogbank import MogBank

bank = MogBank(api_key='your-api-key')

wallet = bank.wallets.create(
  agent_id='agent-123'
)`}</pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
