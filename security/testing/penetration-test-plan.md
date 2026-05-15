# MogBank Penetration Test Plan

## Scope

- **Backend API**: `api.mogbank.io` (GKE-hosted Node.js/Express)
- **Web App**: `mogbank.io` (Next.js frontend)
- **Blockchain Integration**: Base L2 USDC contract interactions via DDSC
- **SDK Packages**: TypeScript SDK (`@mogbank/sdk`), Python SDK (`mogbank`)

## Test Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Staging | Pre-production testing | `api.staging.mogbank.io` |
| Development | Developer sandbox | `api.dev.mogbank.io` |

## Test Categories

### 1. Cryptographic Verification Tests

```
Test: Mandate Signature Forgery
- Send transfer request with invalid Ed25519 signature
- Expected: 401 Unauthorized, "Invalid mandate signature"

Test: Mandate Replay Attack
- Capture valid signed mandate
- Resend same mandate with identical nonce
- Expected: 409 Conflict, "Mandate nonce already used"

Test: Expired Mandate
- Create mandate with 1ms expiry
- Wait 1ms, send request
- Expected: 401 Unauthorized, "Mandate expired"

Test: Mandate Tampering
- Modify mandate payload after signing (amount change)
- Send with original signature
- Expected: 401 Unauthorized, "Invalid mandate signature"
```

### 2. Idempotency Tests

```
Test: Duplicate Idempotency Key
- Send transfer with idempotency key X
- Send identical request with same key X
- Expected: 409 Conflict / return original result

Test: Concurrent Idempotency
- Fire 5 simultaneous requests with same idempotency key
- Expected: Exactly 1 succeeds, 4 get 409 Conflict

Test: Cross-Operation Idempotency
- Use transfer idempotency key on faucet endpoint
- Expected: 422 Unprocessable Entity
```

### 3. Authentication & Authorization Tests

```
Test: Missing JWT
- Call /api/v1/wallets without Authorization header
- Expected: 401 Unauthorized

Test: Expired JWT
- Use JWT with `exp` in the past
- Expected: 401 Unauthorized

Test: Invalid API Key
- Use random string as API key
- Expected: 401 Unauthorized

Test: Agent Access Other Agent's Wallet
- Agent A queries /api/v1/wallets?agent_id=agent_B
- Expected: 403 Forbidden

Test: Rate Limit Exceeded
- Send 11 transfer requests in 1 minute
- Expected: 429 Too Many Requests after 10th

Test: Faucet Daily Limit
- Claim faucet 6 times in 24 hours
- Expected: 429 Too Many Requests after 5th
```

### 4. Input Validation Tests

```
Test: Negative Amount Transfer
- Send transfer with amount = -100
- Expected: 400 Bad Request

Test: Zero Amount Transfer
- Send transfer with amount = 0
- Expected: 400 Bad Request

Test: Invalid Ethereum Address
- Send transfer to "not-an-address"
- Expected: 400 Bad Request

Test: SQL Injection in Agent Name
- Register agent with name "'; DROP TABLE agents; --"
- Expected: 201 Created (parameterized query, no injection)

Test: XSS in Service Description
- Create marketplace service with <script>alert(1)</script> in description
- Expected: 201 Created, content escaped in response

Test: Oversized Payload
- Send POST with 100MB body
- Expected: 413 Request Entity Too Large
```

### 5. Race Condition Tests

```
Test: Double-Spend Transfer
- Agent has 100 USDC balance
- Fire 2 simultaneous 100 USDC transfers
- Expected: Exactly 1 succeeds, 1 fails (insufficient balance)

Test: Concurrent Balance Updates
- Transfer 1 USDC each in 5 concurrent requests
- Expected: All 5 succeed, final balance = initial - 5

Test: Wallet Creation Race
- Register same agent twice simultaneously
- Expected: 1 succeeds, 1 returns 409 Conflict
```

### 6. WebSocket/SSE Tests

```
Test: Unauthenticated WebSocket
- Connect to ws://api.mogbank.io/stream without token
- Expected: Connection rejected

Test: Balance Update Streaming
- Connect with valid JWT
- Initiate transfer
- Expected: SSE event received with new balance within 2 seconds

Test: Cross-Agent Stream
- Connect as Agent A
- Verify Agent B's balance updates are NOT received
```

### 7. Blockchain Tests

```
Test: USDC Transfer with Insufficient Gas
- Send transfer to valid address
- Wallet has 0 ETH for gas
- Expected: 500, "Insufficient gas on Base L2"

Test: Invalid Contract Address
- Attempt transfer to non-existent USDC contract
- Expected: 500, "Contract interaction failed"

Test: DDSC Deposit/Withdraw Consistency
- Deposit 50 USDC to DDSC
- Withdraw 50 USDC from DDSC
- Expected: Balance restored to original

Test: Network Timeout
- Simulate Base L2 RPC timeout
- Expected: 504 Gateway Timeout, transaction not double-submitted
```

### 8. Infrastructure Tests

```
Test: TLS Version
- Connect with TLS 1.0/1.1
- Expected: Connection rejected (TLS 1.3 only)

Test: HSTS Header
- HTTPS response includes Strict-Transport-Security
- Expected: max-age=31536000; includeSubDomains

Test: CORS Policy
- Cross-origin request from unauthorized origin
- Expected: CORS error, no data leak

Test: Cloud Armor WAF
- Send request with SQL injection pattern
- Expected: 502 (blocked by Cloud Armor)

Test: CSP Headers
- Web app includes Content-Security-Policy header
- Expected: script-src 'self'; object-src 'none'
```

## Tools

| Tool | Purpose |
|------|---------|
| `curl` | Manual API testing |
| `wrk` / `k6` | Load testing |
| `nmap` | Port scanning |
| `testssl.sh` | TLS configuration audit |
| `ZAP` / `Burp Suite` | Web vulnerability scanning |
| `hardhat` | Local Base L2 simulation |
| `trufflehog` | Secret detection |
| `gitleaks` | Git history secret scanning |

## Reporting

Findings categorized by severity:

| Severity | Definition | Response SLA |
|----------|------------|-------------|
| Critical | Direct financial loss, key compromise | 1 hour |
| High | Auth bypass, data leak | 4 hours |
| Medium | Rate limit bypass, information disclosure | 24 hours |
| Low | Configuration improvements | 1 week |
| Info | Best practice recommendations | Next sprint |

## Test Execution

```bash
# 1. Start local environment
docker-compose up -d

# 2. Run cryptographic tests
cd apps/backend && npm test -- --testPathPattern='crypto.test'

# 3. Run API security tests
cd apps/backend && npm test -- --testPathPattern='security'

# 4. Run k6 load tests
k6 run security/testing/load-test.js

# 5. Check TLS
testssl --severity HIGH api.mogbank.io

# 6. Check headers
curl -I https://api.mogbank.io/health