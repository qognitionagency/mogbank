# Mogbank - Technical Specification

## Project Overview

**Project Name:** Mogbank - Agentic Banking Infrastructure
**Version:** 1.0.0
**Type:** Full-stack fintech platform for AI agents

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND APPS                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │   Dashboard      │  │  Developer     │  │   Agent        │  │
│  │   (React)        │  │  Portal        │  │   Interface    │  │
│  └────────┬────────┘  └────────┬───────┘  └───────┬────────┘  │
└───────────┼─────────────────────┼───────────────────┼───────────┘
            │                     │                   │
            ▼                     ▼                   ▼
┌───────────────────────────────────────────────────────────────────┐
│                        API GATEWAY (GraphQL + REST)               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Rate Limiting │ Authentication │ Request Validation │ CORS │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Wallet API   │   │  Identity API │   │  Payment API  │
│  (Wallets,    │   │  (KYA, KYC,   │   │  (x402, A2A,  │
│   Transfers) │   │   Credentials)│   │   USDC)       │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BLOCKCHAIN LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Ethereum    │  │  Base L2     │  │  Smart Contracts    │  │
│  │  (USDC)      │  │  (Coinbase)  │  │  (Solidity)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Justification |
|-------|------------|----------------|
| **Frontend** | Next.js 14, React 18, TypeScript | Server-side rendering, excellent dev experience |
| **UI Components** | Tailwind CSS, Radix UI | Modern, accessible, customizable |
| **Charts** | Recharts | Already in use (from your JSX) |
| **API Gateway** | Apollo Server + Express | GraphQL-first with REST fallback |
| **Backend Runtime** | Node.js 20 + TypeScript | Non-blocking I/O for high concurrency |
| **AI Integration** | Python FastAPI | Better for AI/ML workloads |
| **Database** | PostgreSQL 15 | ACID compliance for financial data |
| **Caching** | Redis 7 | Real-time data, session management |
| **Message Queue** | RabbitMQ | Reliable message delivery |
| **Blockchain** | ethers.js, web3.js | Ethereum interaction |
| **Container** | Docker + Kubernetes | Orchestration |
| **IaC** | Terraform | Infrastructure management |

## API Design

### Core Endpoints

#### Agent Wallet Management
```
POST   /api/v1/wallets              - Create agent wallet
GET    /api/v1/wallets/:id          - Get wallet details
GET    /api/v1/wallets/:id/balance  - Get current balance
POST   /api/v1/wallets/:id/transfer - Initiate transfer
GET    /api/v1/wallets/:id/transactions - List transactions
```

#### Agent Identity (KYA)
```
POST   /api/v1/agents/register       - Register new agent
GET    /api/v1/agents/:id           - Get agent details
POST   /api/v1/agents/:id/credential - Issue credentials
GET    /api/v1/agents/:id/score      - Get credit score
POST   /api/v1/agents/verify         - Verify agent identity
```

#### Payment Protocols
```
POST   /api/v1/payments/x402         - x402 payment request
POST   /api/v1/payments/a2a          - A2A protocol payment
POST   /api/v1/payments/mandate     - AP2 mandate management
GET    /api/v1/payments/status/:id   - Payment status
```

#### Marketplace
```
GET    /api/v1/marketplace/services  - List available services
POST   /api/v1/marketplace/escrow    - Create escrow
POST   /api/v1/marketplace/release   - Release funds
GET    /api/v1/marketplace/orders    - Agent's orders
```

### Real-time Features
```
WebSocket /api/v1/stream/balance    - Balance updates
WebSocket /api/v1/stream/transactions - Transaction stream
SSE       /api/v1/events             - Server-sent events
```

## Database Schema (Core Tables)

### agents
- id (UUID, PK)
- wallet_address (VARCHAR)
- agent_type (ENUM: langchain, crewai, autogen, custom)
- kya_status (ENUM: pending, verified, suspended)
- credit_score (INTEGER)
- created_at, updated_at

### wallets
- id (UUID, PK)
- agent_id (FK)
- currency (ENUM: USDC, AED, USD)
- balance (DECIMAL)
- daily_limit (DECIMAL)
- status (ENUM: active, frozen, closed)

### transactions
- id (UUID, PK)
- wallet_id (FK)
- type (ENUM: transfer, payment, escrow, credit)
- amount (DECIMAL)
- status (ENUM: pending, confirmed, failed)
- counterparty_wallet_id (FK)
- protocol (ENUM: x402, a2a, ap2)
- created_at

### credentials
- id (UUID, PK)
- agent_id (FK)
- credential_type (ENUM: identity, kyc, compliance)
- issued_at, expires_at
- revoked (BOOLEAN)

## Security Requirements

### Authentication
- API Keys for agent-to-agent communication
- JWT tokens for dashboard access
- mTLS for blockchain interactions

### Compliance
- KYA (Know Your Agent) - identity verification
- Transaction monitoring
- Audit logging (immutable)
- Data retention policies

### Encryption
- AES-256 for data at rest
- TLS 1.3 for data in transit
- Hardware security modules for keys

## Development Phases

### Phase 0 - Foundation (Weeks 1-12)
- [ ] Project setup and infrastructure
- [ ] ABOS specification implementation
- [ ] x402 payment middleware
- [ ] TypeScript + Python SDKs
- [ ] Testnet with faucet

### Phase 1 - Traction (Weeks 13-36)
- [ ] 1,000 agents on testnet
- [ ] Framework integrations
- [ ] Real-time streaming
- [ ] Spending controls

### Phase 2 - Real Money (Weeks 37-72)
- [ ] Mainnet launch
- [ ] PSP partnership
- [ ] Marketplace
- [ ] Credit system