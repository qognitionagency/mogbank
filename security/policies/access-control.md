# MogBank Access Control & Authorization Policy

## Principles

- **Least Privilege**: Every agent, service account, and user receives only the permissions necessary
- **Defense in Depth**: Multiple independent layers verify authorization
- **Mandate-Based Authorization**: All financial operations require signed Ed25519 mandates
- **Zero Trust**: No implicit trust between internal services—every call is authenticated and authorized

## Role-Based Access Control (RBAC)

### Agent Roles

| Role | Permissions |
|------|-------------|
| `agent:reader` | Read own wallet balances, transaction history |
| `agent:transactor` | Reader + initiate transfers, sign mandates |
| `agent:operator` | Transactor + manage ABOs, escrow operations |
| `agent:admin` | Operator + manage agent credentials, KYA config |
| `system:admin` | Full administrative access (human operators) |

### Service Roles

| Service | Permissions |
|---------|-------------|
| `backend-api` | Read/write agents, wallets, transactions, mandates |
| `blockchain-service` | Sign & submit on-chain transactions |
| `ddsc-service` | Manage data storage contracts |
| `streaming-service` | Publish balance updates via WebSocket/SSE |

## Authorization Flow

```
1. Client → API Gateway (TLS 1.3, mTLS optional)
   ├─ Auth: Bearer JWT or API Key
   ├─ Header: X-Idempotency-Key (required for mutations)
   └─ Header: X-Mandate-Signature (required for financial ops)

2. API Gateway → Backend Service
   ├─ Auth: Service-to-service JWT
   └─ Context: Propagated agent identity

3. Backend Service → x402 Middleware
   ├─ Verify Ed25519 mandate signature
   ├─ Verify mandate nonce (idempotency)
   ├─ Verify mandate expiry
   ├─ Verify agent authorization
   └─ Apply rate limits

4. Backend Service → Blockchain Service
   ├─ Auth: Internal service JWT
   └─ Mandate: Signed transaction mandate

5. Backend Service → Database
   ├─ Auth: IAM service account (GCP Workload Identity)
   └─ Row-Level Security: agent_id filtering
```

## Idempotency Key Enforcement

All mutating operations require an `X-Idempotency-Key` header.

```typescript
// Database-level enforcement
CREATE UNIQUE INDEX idx_idempotency_keys ON transactions(idempotency_key);
CREATE UNIQUE INDEX idx_idempotency_keys_ledger ON ledger_entries(idempotency_key);

// Application-level enforcement with Redis
async function enforceIdempotency(key: string, ttl: number = 86400): Promise<void> {
  const exists = await redis.set(idempotencyKey, 'processing', 'NX', 'EX', ttl);
  if (!exists) {
    const existing = await redis.get(idempotencyKey);
    if (existing === 'completed') {
      throw new IdempotencyConflictError('Operation already completed');
    }
    throw new IdempotencyConflictError('Operation in progress');
  }
}

// After completion
await redis.set(idempotencyKey, 'completed', 'EX', ttl);
```

## Rate Limiting

| Endpoint | Rate Limit | Window |
|----------|-----------|--------|
| `/api/v1/faucet` | 5 requests | 24 hours per agent |
| `/api/v1/transfer` | 10 requests | 1 minute per agent |
| `/api/v1/agents/register` | 3 requests | 1 hour per IP |
| `/api/v1/marketplace/services` | 30 requests | 1 minute |
| Health check | Unauthenticated, unlimited | N/A |

## Database Row-Level Security

```sql
-- Enable RLS on financial tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Policy: agents can only read their own data
CREATE POLICY agent_wallet_policy ON wallets
  FOR SELECT
  USING (agent_id = current_setting('app.current_agent_id'));
```

## Network Security

- **Internal traffic**: GKE private network (VPC-native), no public IPs for databases
- **External traffic**: Cloud Armor WAF → Cloud Load Balancer → Nginx Ingress → Pods
- **TLS**: 1.3 minimum, cert-manager for automatic rotation
- **Network Policies**: Backend can only talk to postgres/redis; web can only talk to backend
- **Pod Security**: `restricted` Pod Security Standard, non-root users

## Audit Logging

All authorization decisions, mandate verifications, and access attempts are logged:

```typescript
logger.info('Authorization check', {
  agent_id: mandate.agent_id,
  action: mandate.action,
  signature_valid: isValid,
  nonce_valid: isNonceValid,
  expiry_valid: isExpiryValid,
  timestamp: new Date().toISOString(),
  source_ip: request.ip,
});
```

## Incident Response

1. **Unauthorized access detected**: Block agent immediately via `credentials.status = 'revoked'`
2. **Suspicious activity**: Increase rate limits to 0 (block), investigate logs
3. **Key rotation**: Emergency rotation procedure in `ed25519-mandate-signing.md`