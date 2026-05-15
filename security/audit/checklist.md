# MogBank Security Audit Checklist

## 1. Authentication & Authorization
- [ ] Ed25519 mandate signing verified at every financial endpoint
- [ ] JWT tokens have appropriate expiry (1h access, 24h refresh)
- [ ] API keys are 256-bit random, stored hashed
- [ ] Rate limiting enforced per-agent and per-IP
- [ ] No hardcoded credentials in source code
- [ ] Session management follows OWASP guidelines

## 2. Cryptography
- [ ] Ed25519 keys generated from CSPRNG
- [ ] Private keys never logged or exposed in errors
- [ ] Canonical serialization used for mandate signing
- [ ] Signature verification is constant-time
- [ ] TLS 1.3 enforced (no TLS < 1.2 fallback)
- [ ] Key rotation pipeline functional

## 3. Input Validation
- [ ] All user inputs validated and sanitized
- [ ] Amount values validated (non-negative, precision)
- [ ] Ethereum addresses validated (checksummed)
- [ ] UUID/idempotency keys validated as UUIDv4
- [ ] No SQL injection (parameterized queries)
- [ ] No XSS (output encoding, CSP headers)

## 4. Blockchain Security
- [ ] USDC transfer amounts ≤ wallet balance
- [ ] Blockchain nonce management prevents replay
- [ ] Gas estimation with buffer (20% above estimate)
- [ ] Failed transactions logged and alerted
- [ ] Base L2 RPC endpoint redundancy
- [ ] DDSC deposit/withdraw validated on-chain

## 5. Infrastructure Security
- [ ] GKE nodes use COS (Container-Optimized OS)
- [ ] Shielded GKE nodes enabled
- [ ] Workload Identity for service accounts
- [ ] Private GKE cluster (no public node IPs)
- [ ] Cloud SQL with private IP only
- [ ] Redis with TLS (SERVER_AUTHENTICATION mode)
- [ ] Network policies restrict pod-to-pod traffic
- [ ] Pod Security Standards: restricted
- [ ] Secrets Manager for all credentials
- [ ] Cloud Armor WAF rules active

## 6. CI/CD Security
- [ ] npm audit / pip-audit passes
- [ ] CodeQL SAST analysis runs
- [ ] Secret scanning (TruffleHog + Gitleaks)
- [ ] Container images signed with cosign
- [ ] Trivy container vulnerability scanning
- [ ] SBOM generated and attached to images
- [ ] Dependency review on PRs
- [ ] Signed commits required

## 7. Data Protection
- [ ] PII encrypted at rest (Cloud SQL encryption)
- [ ] Agent credentials stored hashed
- [ ] Audit logs immutable (GCP Cloud Logging)
- [ ] Backup encryption enabled
- [ ] Point-in-time recovery enabled for Cloud SQL

## 8. Operational Security
- [ ] Structured logging (no sensitive data)
- [ ] Prometheus metrics for anomaly detection
- [ ] Alert on failed signature verifications
- [ ] Alert on rate limit breaches
- [ ] Incident response procedure documented
- [ ] Key rotation procedure documented

## Verification Commands

```bash
# Check for secrets in codebase
gitleaks detect --source . --verbose

# Run SAST
codeql database create codeql-db --language=javascript,typescript,python
codeql database analyze codeql-db --format=sarif --output=codeql-results.sarif

# Scan containers
trivy image ghcr.io/qognitionagency/mogbank/backend:latest

# Verify image signatures
cosign verify ghcr.io/qognitionagency/mogbank/backend:latest

# Test for common web vulnerabilities
npx @contrast/secure-headers check https://mogbank.io

# Check Terraform for misconfigurations
cd infrastructure/terraform && terraform init && terraform validate
checkov -d infrastructure/terraform