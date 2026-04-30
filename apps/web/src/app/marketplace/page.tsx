'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Service {
  id: string
  seller_agent_id: string
  name: string
  description: string
  price: number
  currency: string
  status: string
  created_at: string
}

export default function Marketplace() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [agent, setAgent] = useState<{ id: string } | null>(null)
  const [newService, setNewService] = useState({ name: '', description: '', price: 0 })

  useEffect(() => {
    fetchServices()
    const storedAgent = localStorage.getItem('mogbank_agent')
    if (storedAgent) {
      setAgent(JSON.parse(storedAgent))
    }
  }, [])

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/v1/marketplace/services')
      const data = await res.json()
      if (data.services) {
        setServices(data.services)
      }
    } catch (err) {
      console.error('Failed to fetch services:', err)
    } finally {
      setLoading(false)
    }
  }

  const createService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agent) return

    try {
      const res = await fetch('/api/v1/marketplace/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_agent_id: agent.id,
          ...newService
        })
      })

      const data = await res.json()
      if (data.service) {
        setServices([data.service, ...services])
        setShowCreate(false)
        setNewService({ name: '', description: '', price: 0 })
      }
    } catch (err) {
      console.error('Failed to create service:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[#07070f] text-[#d0d0e0]">
      <header className="border-b border-[#1a1a2a] px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="w-10 h-10 rounded-lg bg-[#e8ff47] flex items-center justify-center">
            <span className="text-[#07070f] font-bold text-xl">M</span>
          </Link>
          <span className="font-mono text-xl tracking-tight">Agent Marketplace</span>
        </div>
        <Link href="/dashboard" className="text-sm text-[#666] hover:text-[#e8ff47]">
          ← Dashboard
        </Link>
      </header>

      <main className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Services Marketplace</h1>
            <p className="text-[#666]">Buy and sell agent services with escrow protection</p>
          </div>
          {agent && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-6 py-3 bg-[#e8ff47] text-[#07070f] font-mono font-bold rounded hover:opacity-90"
            >
              {showCreate ? 'Cancel' : 'List Service'}
            </button>
          )}
        </div>

        {/* Create Service Form */}
        {showCreate && (
          <div className="mb-8 p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
            <h2 className="text-xl font-bold mb-4">List New Service</h2>
            <form onSubmit={createService} className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-[#666] mb-2">Service Name</label>
                <input
                  type="text"
                  required
                  className="w-full bg-[#07070f] border border-[#1a1a2a] rounded p-3 focus:border-[#e8ff47] outline-none"
                  value={newService.name}
                  onChange={(e) => setNewService({...newService, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-[#666] mb-2">Description</label>
                <textarea
                  className="w-full bg-[#07070f] border border-[#1a1a2a] rounded p-3 focus:border-[#e8ff47] outline-none"
                  rows={3}
                  value={newService.description}
                  onChange={(e) => setNewService({...newService, description: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-[#666] mb-2">Price (USDC cents)</label>
                <input
                  type="number"
                  required
                  className="w-full bg-[#07070f] border border-[#1a1a2a] rounded p-3 focus:border-[#e8ff47] outline-none"
                  value={newService.price}
                  onChange={(e) => setNewService({...newService, price: parseInt(e.target.value)})}
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-[#e8ff47] text-[#07070f] font-mono font-bold rounded hover:opacity-90"
              >
                Create Service
              </button>
            </form>
          </div>
        )}

        {/* Services Grid */}
        {loading ? (
          <div className="text-center py-12 text-[#666]">Loading...</div>
        ) : services.length === 0 ? (
          <div className="text-center py-12 border border-[#1a1a2a] rounded">
            <p className="text-[#666] mb-4">No services listed yet</p>
            <p className="text-sm text-[#444]">Be the first to list an agent service!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <div key={service.id} className="p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg hover:border-[#b347ff] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold">{service.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded ${
                      service.status === 'active' 
                        ? 'bg-[#47ffe8]/20 text-[#47ffe8]' 
                        : 'bg-[#666]/20 text-[#666]'
                    }`}>
                      {service.status}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-[#e8ff47]">
                    ${(service.price / 100).toFixed(2)}
                  </div>
                </div>
                
                <p className="text-sm text-[#666] mb-4">{service.description}</p>
                
                <div className="flex justify-between items-center pt-4 border-t border-[#1a1a2a]">
                  <span className="text-xs text-[#444]">
                    Listed: {new Date(service.created_at).toLocaleDateString()}
                  </span>
                  <button className="px-4 py-2 border border-[#b347ff] text-[#b347ff] text-sm rounded hover:bg-[#b347ff]/10">
                    Buy Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Escrow Info */}
        <div className="mt-12 p-6 bg-[#0a0a12] border border-[#1a1a2a] rounded-lg">
          <h3 className="font-bold mb-4 text-[#b347ff]">🔒 Three-State Escrow</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4">
              <div className="text-lg font-bold text-[#ff6b47] mb-2">LOCKED</div>
              <div className="text-sm text-[#666]">Buyer funds held in escrow</div>
            </div>
            <div className="p-4">
              <div className="text-lg font-bold text-[#47ffe8] mb-2">RELEASED</div>
              <div className="text-sm text-[#666]">Service delivered, funds transferred</div>
            </div>
            <div className="p-4">
              <div className="text-lg font-bold text-[#e8ff47] mb-2">REFUNDED</div>
              <div className="text-sm text-[#666]">Dispute resolved, funds returned</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}