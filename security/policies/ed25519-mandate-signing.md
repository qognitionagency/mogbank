# Ed25519 Mandate Signing & Verification Policy

## Overview

MogBank uses Ed25519 asymmetric cryptography for mandate signing and verification across all agent financial operations. This document defines the end-to-end cryptographic security model, key lifecycle management, and operational procedures.

## Cryptographic Parameters

| Parameter | Value |
|-----------|-------|
| Algorithm | Ed25519 (EdDSA with Curve25519) |
| Private Key Length | 32 bytes (256 bits) |
| Public Key Length | 32 bytes (256 bits) |
| Signature Length | 64 bytes |
| Key Encoding | Base64URL (unpadded) |
| Signature Encoding | Base64URL (unpadded) |
| Hashing | SHA-512 (built into EdDSA) |
| Randomness Source | `crypto.randomBytes()` or OS CSPRNG |

## Key Lifecycle Management

### 1. Key Generation

```
Keys MUST be generated using:
- Node.js: tweetnacl.sign.keyPair() seeded with crypto.randomBytes(32)
- Browser: SubtleCrypto.generateKey({ name: 'Ed25519' })
- Python: nacl.signing.SigningKey.generate()

Keys MUST NOT be:
- Derived from passwords or user input (use a KDF like Argon2id for that)
- Reused across different agent identities
- Stored in plaintext in version control or logs
```

### 2. Key Storage

| Environment | Storage Location | Protection |
|-------------|-----------------|------------|
| Production | GCP Secret Manager | IAM-controlled access, audit logging |
| Staging | GCP Secret Manager (staging project) | IAM-controlled access |
| Development | Environment variables / `.env` | `.gitignore` enforced |
| CI/CD | GitHub Secrets | Encrypted, scoped to repository |

### 3. Key Rotation

- **Scheduled Rotation**: Every 90 days for production keys
- **Emergency Rotation**: Immediately upon suspected compromise
- **Procedure**:
  1. Generate new Ed25519 keypair
  2. Store new private key in Secret Manager with new version
  3. Update `ED25519_PRIVATE_KEY` secret reference
  4. Deploy services with new key
  5. Deprecate old key (keep for 30 days for signature verification)
  6. Delete old key after verification window

## Mandate Signing Protocol

### Sign a Mandate

```typescript
import { signMandate } from '@mogbank/backend/services/crypto';

const mandate = {
  id: 'mand_abc123',
  agent_id: 'agent_xyz',
  action: 'transfer',
  params: {
    to: '0xRecipient...',
    amount: '1000000000000000000', // 1 USDC in wei
    token: 'USDC',
  },
  nonce: crypto.randomUUID(),
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
};

const signature = signMandate(privateKey, mandate);
```

### Verify a Mandate

```typescript
import { verifyMandate } from '@mogbank/backend/services/crypto';

// Public key retrieved from agent's registered credential
const isValid = verifyMandate(publicKey, mandate, signature);

if (!isValid) {
  throw new UnauthorizedError('Mandate signature verification failed');
}

// Check expiry
if (new Date(mandate.expires_at) < new Date()) {
  throw new UnauthorizedError('Mandate has expired');
}

// Check nonce hasn't been reused (idempotency enforcement)
await checkNonce(mandate.nonce);
```

### Canonical Serialization

Mandates MUST be serialized deterministically before signing to ensure verifiable signatures:

```typescript
function canonicalSerialize(mandate: MandateData): Buffer {
  // Sort keys alphabetically, stable JSON stringification
  const ordered = JSON.stringify(mandate, Object.keys(mandate).sort());
  return Buffer.from(ordered, 'utf8');
}
```

## Verification at Every Layer

### 1. API Gateway (Nginx Ingress)

- Verify `X-Mandate-Signature` header is present
- Verify `X-Mandate-Nonce` header is present
- Rate limit based on agent identity

### 2. x402 Protocol Middleware

- Extract mandate from request payload
- Verify Ed25519 signature against registered agent public key
- Verify mandate nonce hasn't been used (Redis idempotency check)
- Verify mandate expiry
- Verify agent authorization for the requested action

### 3. Transfer Execution

- Verify mandate signature before constructing blockchain transaction
- Double-entry ledger entries reference mandate ID
- All debit/credit entries are immutable and auditable

### 4. DDSC Integration

- Agent CDP operations require Ed25519-signed mandates
- DDSC contract verifies on-chain signature (if implemented on-chain)

## Attack Mitigations

| Attack Vector | Mitigation |
|--------------|------------|
| Replay Attack | Nonce in mandate tracked in Redis with TTL (24h) |
| Expired Mandate | `expires_at` field checked by x402 middleware |
| Key Compromise | 90-day rotation, Secret Manager audit logs |
| Side-Channel | Constant-time Ed25519 implementation (libsodium/tweetnacl) |
| Man-in-the-Middle | TLS 1.3 enforced, certificate pinning via cert-manager |
| Brute Force | Rate limiting at ingress (100 req/s per IP) |
| Supply Chain | Signed Docker images, SBOM generation in CI |

## Audit & Compliance

- All mandate operations logged with structured logging
- Signature verification results logged (success/failure)
- Failed verifications trigger alerts
- Key access logged via GCP Secret Manager audit logs
- Monthly key rotation report generated

## Emergency Response

1. **Suspected Key Compromise**:
   - Rotate affected key immediately
   - Invalidate all issued mandates signed with old key
   - Review audit logs for unauthorized access
   - Notify affected agent owners

2. **Signing Service Outage**:
   - Fail closed (reject all unsigned mandates)
   - No fallback to unsigned operations
   - Monitor via Prometheus alert on signature failure rate

## Testing

```bash
# Run crypto service tests
pnpm --filter @mogbank/backend test -- src/tests/services/crypto.test.ts

# Generate test keys for development
node -e "const {randomBytes} = require('crypto'); console.log(randomBytes(32).toString('base64url'));"