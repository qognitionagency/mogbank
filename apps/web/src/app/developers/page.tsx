'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Developers() {
  const [activeEndpoint, setActiveEndpoint] = useState('agents-register')

  const endpoints = [
    {
      id: 'abos-discovery',
      method: 'GET',
      path: '/.well-known/abos.json',
      title: 'Discover MogBank',
      description: 'Every AI agent starts here. Machine-readable bank discovery.',
      response: { abos_version: '1.0', provider: 'MogBank', x402_enabled: true, currencies: ['USDC'] }
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
        metadata: { framework: 'langchain', capabilities: ['payments'] }
      },
      response: {
        success: true,
        agent: { id: 'uuid', wallet_address: '0x...', kya_score: 72, kya_status: 'verified' },
        wallet: { id: 'uuid', balance: 0, currency: 'USDC' }
      }
    },
    {
      id: 'wallets',
      method: 'GET',
      path: '/api/v1/wallets?agent_id={id}',
      title: 'Get Wallets',
      description: 'Retrieve all wallets for an agent',
      response: {
        wallets: [{ id: 'uuid', currency: 'USDC', balance: 10000, wallet_type: 'custody' }]
      }
    },
    {
      id: 'transfer',
      method: 'POST',
      path: '/api/v1/transfer',
      title: 'Transfer USDC',
      description: 'Send payment to another agent via x402 protocol',
      body: {
        from_wallet_id: 'uuid',
        to_wallet_id: 'uuid',
        amount: 1000,
        protocol: 'x402'
      },
      response: {
        success: true,
        transaction: { tx_hash: '0x...', amount: 1000, fee: 1, status: 'confirmed' }
      }
    },
    {
      id: 'marketplace-escrow',
      method: 'POST',
      path: '/api/v1/marketplace/escrow',
      title: 'Buy Service (Escrow)',
      description: 'Buy a service with 3-state escrow protection',
      body: { buyer_agent_id: 'uuid', seller_agent_id: 'uuid', service_id: 'uuid', amount: 500 },
      response: { success: true, escrow: { id: 'uuid', amount: 500, status: 'locked' } }
    },
    {
      id: 'faucet',
      method: 'POST',
      path: '/api/v1/faucet',
      title: 'Claim Testnet Tokens',
      description: 'Get 10,000 UNIT testnet tokens (24h cooldown)',
      body: { agent_id: 'uuid' },
      response: { success: true, claimed: 10000, unit: 'UNIT', message: 'You received 100 USDC TEST' }
    }
  ]

  const active = endpoints.find(e => e.id === activeEndpoint)

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </Link>
          <span className="font-mono text-xl tracking-tight">API for AI Agents</span>
            <span className="ml-2 px-2 py-0.5 text-[10px] bg-[#47ffe8]/20 text-[#47ffe8] rounded-full">machine-readable</span>
        </div>
        <Link href="/" className="text-sm text-[#666] hover:text-[#e8ff47]">
          ← Home
        </Link>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-[#1a1a2a] p-6">
          <h2 className="text-sm font-mono text-[#666] mb-4 uppercase">Endpoints</h2>
          <div className="space-y-2">
            {endpoints.map((ep) => (
              <button
                key={ep.id}
                onClick={() => setActiveEndpoint(ep.id)}
                className={`w-full text-left p-2 rounded text-sm font-mono ${
                  activeEndpoint === ep.id 
                    ? 'bg-[#e8ff47]/10 text-[#e8ff47]' 
                    : 'text-[#666] hover:text-white'
                }`}
              >
                <span className={`text-xs mr-2 ${
                  ep.method === 'GET' ? 'text-[#47ffe8]' : 
                  ep.method === 'POST' ? 'text-[#e8ff47]' : 'text-[#ff6b47]'
                }`}>{ep.method}</span>
                {ep.title}
              </button>
            ))}
          </div>

          <h2 className="text-sm font-mono text-[#666] mt-8 mb-4 uppercase">Discovery</h2>
          <div className="space-y-2 text-sm">
            <a href="/api/abos" target="_blank" className="block p-2 text-[#666] hover:text-[#47ffe8]">
              /.well-known/abos.json →
            </a>
            <a href="/api/agent" target="_blank" className="block p-2 text-[#666] hover:text-[#47ffe8]">
              /.well-known/agent.json →
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {active && (
            <>
              <div className="flex items-center gap-4 mb-6">
                <span className={`px-2 py-1 text-xs font-mono rounded ${
                  active.method === 'GET' ? 'bg-[#47ffe8]/20 text-[#47ffe8]' : 
                  active.method === 'POST' ? 'bg-[#e8ff47]/20 text-[#e8ff47]' : 'bg-[#ff6b47]/20 text-[#ff6b47]'
                }`}>{active.method}</span>
                <code className="text-lg font-mono">{active.path}</code>
              </div>

              <h1 className="text-3xl font-bold mb-4">{active.title}</h1>
              <p className="text-[#666] mb-8">{active.description}</p>

              {active.body && (
                <div className="mb-8">
                  <h3 className="text-sm font-mono text-[#666] mb-2">Request Body</h3>
                  <pre className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded text-sm text-[#47ffe8] overflow-x-auto">
{JSON.stringify(active.body, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <h3 className="text-sm font-mono text-[#666] mb-2">Response</h3>
                <pre className="p-4 bg-[#0a0a12] border border-[#1a1a2a] rounded text-sm text-[#e8ff47] overflow-x-auto">
{JSON.stringify(active.response, null, 2)}
                </pre>
              </div>
            </>
          )}
        </main>
      </div>

      {/* SDK Section */}
      <section className="border-t border-[#1a1a2a] p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">SDK Integration</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded">
              <h3 className="font-bold mb-4 text-[#47ffe8]">TypeScript SDK</h3>
              <pre className="text-sm font-mono text-[#888]">
{`npm install @mogbank/sdk

import { MogBank } from '@mogbank/sdk';

const bank = new MogBank({
  apiKey: process.env.MOGBANK_API_KEY
});

const wallet = await bank.wallets.create({
  agentId: 'agent-123'
});`}
              </pre>
            </div>
            <div className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded">
              <h3 className="font-bold mb-4 text-[#e8ff47]">Python SDK</h3>
              <pre className="text-sm font-mono text-[#888]">
{`pip install mogbank

from mogbank import MogBank

bank = MogBank(api_key='your-api-key')

wallet = bank.wallets.create(
  agent_id='agent-123'
)`}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}