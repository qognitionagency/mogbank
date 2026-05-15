/**
 * KYA-7 Scoring Engine
 *
 * Know Your Agent — 7-dimensional scoring protocol (ABOS v1.0 Layer 1).
 * Scores each agent registration across 7 weighted dimensions to produce
 * a 0–100 compliance score that gates access to financial services.
 */
import { logger } from '../utils/logger';

export interface KYAInput {
  email?: string;
  company_name?: string;
  jurisdiction?: string;
  framework?: string;
  capabilities?: string[];
  endpoint_url?: string;
  openapi_schema?: string;
  principal_address?: string;
  agent_type?: string;
}

export interface KYABreakdown {
  principal_identity: number;
  email_domain: number;
  agent_metadata: number;
  use_case: number;
  jurisdiction_risk: number;
  technical_capability: number;
  verification_mode: number;
}

export interface KYAResult {
  score: number;
  status: 'verified' | 'pending' | 'suspended';
  breakdown: KYABreakdown;
}

// Safe TLDs and personal email domains that indicate lower trust
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'mail.com',
  'yandex.com',
]);

// High-risk jurisdictions (generic list, not legal advice)
const HIGH_RISK_JURISDICTIONS = new Set([
  'ir', 'kp', 'sy', 'cu', 've', 'mm', 'ye',
]);

// Medium-risk jurisdictions
const MEDIUM_RISK_JURISDICTIONS = new Set([
  'ru', 'cn', 'by', 'zw', 'sd', 'ht', 'lb',
]);

// Maximum scores per dimension
const DIMENSION_MAX = {
  principal_identity: 15,
  email_domain: 10,
  agent_metadata: 15,
  use_case: 20,
  jurisdiction_risk: 15,
  technical_capability: 15,
  verification_mode: 10,
};

// Verification thresholds
const VERIFIED_THRESHOLD = 60;
const SUSPENDED_THRESHOLD = 20;

/**
 * Score principal identity — verifiable human/organization standing behind the agent.
 */
function scorePrincipalIdentity(input: KYAInput): number {
  let score = 0;

  // Has a principal address
  if (input.principal_address && input.principal_address.length > 10) {
    score += 5;
  }

  // Has a company name
  if (input.company_name) {
    score += 6;
  }

  // Looks like a real company (not just a first name)
  if (input.company_name && input.company_name.length > 3 && /\s/.test(input.company_name)) {
    score += 2;
  }

  // Bonus for organization association
  if (input.company_name && !/^[A-Z][a-z]+$/.test(input.company_name)) {
    score += 2;
  }

  return Math.min(score, DIMENSION_MAX.principal_identity);
}

/**
 * Score email domain — organizational email domains score higher than personal ones.
 */
function scoreEmailDomain(input: KYAInput): number {
  let score = 0;

  if (!input.email) return 3; // no email = minimal score

  const parts = input.email.split('@');
  if (parts.length !== 2) return 3;

  const domain = parts[1].toLowerCase();

  // Personal email = base score
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
    return 4;
  }

  // Organizational domain — bonus
  score = 6;

  // Well-known enterprise domains
  if (domain.endsWith('.gov') || domain.endsWith('.edu')) {
    score = 10;
  } else if (domain.endsWith('.org') || domain.endsWith('.foundation')) {
    score = 8;
  }

  return Math.min(score, DIMENSION_MAX.email_domain);
}

/**
 * Score agent metadata — richness of agent self-description.
 */
function scoreAgentMetadata(input: KYAInput): number {
  let score = 5;

  if (input.framework) {
    score += 3;
  }

  if (input.capabilities && input.capabilities.length > 0) {
    score += 4;
    if (input.capabilities.length >= 3) {
      score += 2;
    }
  }

  if (input.agent_type && input.agent_type !== 'custom') {
    score += 1;
  }

  return Math.min(score, DIMENSION_MAX.agent_metadata);
}

/**
 * Score use case — higher score for clearly defined, low-risk use cases.
 */
function scoreUseCase(input: KYAInput): number {
  // Without access to a real classification model, use heuristics
  let score = 12; // default medium

  // Capability-based heuristics
  if (input.capabilities) {
    const caps = input.capabilities.map((c) => c.toLowerCase());

    const highRiskPatterns = ['trading', 'swap', 'arbitrage', 'leveraged', 'options'];
    const lowRiskPatterns = ['payments', 'checkout', 'billing', 'invoicing'];

    let highRiskHits = 0;
    let lowRiskHits = 0;

    for (const cap of caps) {
      for (const p of highRiskPatterns) {
        if (cap.includes(p)) highRiskHits++;
      }
      for (const p of lowRiskPatterns) {
        if (cap.includes(p)) lowRiskHits++;
      }
    }

    if (highRiskHits > 0) score -= 4;
    if (lowRiskHits > 0) score += 4;
  }

  return Math.max(0, Math.min(score, DIMENSION_MAX.use_case));
}

/**
 * Score jurisdiction risk — jurisdictional risk scoring.
 */
function scoreJurisdictionRisk(input: KYAInput): number {
  if (!input.jurisdiction) return 8; // unknown = medium-low

  const j = input.jurisdiction.toLowerCase().trim();

  if (HIGH_RISK_JURISDICTIONS.has(j)) return 2;
  if (MEDIUM_RISK_JURISDICTIONS.has(j)) return 7;

  // Low-risk jurisdictions
  const lowRisk = ['us', 'gb', 'ch', 'de', 'fr', 'jp', 'ca', 'au', 'sg', 'ae', 'nl', 'se', 'dk', 'no', 'fi'];
  if (lowRisk.includes(j)) return 14;

  return 10; // default
}

/**
 * Score technical capability — presence of API specs, endpoints, etc.
 */
function scoreTechnicalCapability(input: KYAInput): number {
  let score = 5;

  if (input.endpoint_url) {
    score += 4;

    // HTTPS endpoint is preferred
    if (input.endpoint_url.startsWith('https://')) {
      score += 2;
    }
  }

  if (input.openapi_schema) {
    score += 4;
  }

  return Math.min(score, DIMENSION_MAX.technical_capability);
}

/**
 * Score verification mode — based on current environment (testnet/mainnet).
 */
function scoreVerificationMode(): number {
  // Testnet = medium score; mainnet would require KYC verification
  const isTestnet = process.env.NODE_ENV !== 'production' || process.env.TESTNET === 'true';
  return isTestnet ? 5 : 7;
}

/**
 * Compute the full KYA-7 score for an agent registration.
 */
export function calculateKYAScore(input: KYAInput): KYAResult {
  const breakdown: KYABreakdown = {
    principal_identity: scorePrincipalIdentity(input),
    email_domain: scoreEmailDomain(input),
    agent_metadata: scoreAgentMetadata(input),
    use_case: scoreUseCase(input),
    jurisdiction_risk: scoreJurisdictionRisk(input),
    technical_capability: scoreTechnicalCapability(input),
    verification_mode: scoreVerificationMode(),
  };

  const score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  let status: KYAResult['status'];
  if (score >= VERIFIED_THRESHOLD) {
    status = 'verified';
  } else if (score < SUSPENDED_THRESHOLD) {
    status = 'suspended';
  } else {
    status = 'pending';
  }

  logger.info('KYA-7 score calculated', { score, status, breakdown });

  return { score, status, breakdown };
}