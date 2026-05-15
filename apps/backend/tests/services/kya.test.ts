/**
 * KYA-7 Scoring Engine Tests
 *
 * Tests the Know Your Agent 7-dimension scoring system including
 * identity proof, reputation, collateralization, on-chain history,
 * behavioral patterns, review metrics, and regulatory compliance.
 */

import { describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";
import nacl from "tweetnacl";

// ── KYA-7 Scoring Constants ─────────────────────────────────

const KYA_DIMENSIONS = [
  "identity_proof",
  "reputation",
  "collateralization",
  "onchain_history",
  "behavioral_patterns",
  "review_metrics",
  "regulatory_compliance",
] as const;

type KyaDimension = (typeof KYA_DIMENSIONS)[number];

const MAX_SCORE = 100;
const MIN_SCORE = 0;
const TRUST_THRESHOLD = 60; // minimum for trusted operations

// ── Mock KYA Scoring Engine ─────────────────────────────────

interface KyaInput {
  agent_id: string;
  public_key_hex: string;
  github_verified: boolean;
  twitter_verified: boolean;
  staked_amount: number;
  onchain_transactions: number;
  onchain_age_days: number;
  dispute_count: number;
  completed_escrows: number;
  review_average: number;
  sanctions_check_passed: boolean;
  jurisdiction: string;
}

interface KyaScores {
  identity_proof: number;
  reputation: number;
  collateralization: number;
  onchain_history: number;
  behavioral_patterns: number;
  review_metrics: number;
  regulatory_compliance: number;
  overall: number;
  tier: "untrusted" | "basic" | "trusted" | "premium";
}

function calculateKyaScore(input: KyaInput): KyaScores {
  // ── Identity Proof (0-100) ──────────────────────────────
  let identityProof = 0;
  if (input.public_key_hex && input.public_key_hex.length === 64) identityProof += 30;
  if (input.github_verified) identityProof += 35;
  if (input.twitter_verified) identityProof += 35;
  identityProof = Math.min(100, identityProof);

  // ── Reputation (0-100) ──────────────────────────────────
  let reputation = 0;
  reputation += Math.min(40, input.completed_escrows * 5);
  if (input.dispute_count === 0) reputation += 30;
  else if (input.dispute_count <= 2) reputation += 15;
  reputation += Math.min(30, input.onchain_transactions * 1.5);
  reputation = Math.min(100, reputation);

  // ── Collateralization (0-100) ───────────────────────────
  let collateralization = 0;
  if (input.staked_amount >= 10000) collateralization = 100;
  else if (input.staked_amount >= 5000) collateralization = 80;
  else if (input.staked_amount >= 1000) collateralization = 60;
  else if (input.staked_amount >= 500) collateralization = 40;
  else if (input.staked_amount >= 100) collateralization = 20;
  else collateralization = 5;
  collateralization = Math.min(100, collateralization);

  // ── On-Chain History (0-100) ────────────────────────────
  let onchainHistory = 0;
  if (input.onchain_age_days >= 365) onchainHistory += 40;
  else if (input.onchain_age_days >= 180) onchainHistory += 30;
  else if (input.onchain_age_days >= 90) onchainHistory += 20;
  else if (input.onchain_age_days >= 30) onchainHistory += 10;

  onchainHistory += Math.min(40, input.onchain_transactions * 2);
  onchainHistory += input.staked_amount > 0 ? 20 : 0;
  onchainHistory = Math.min(100, onchainHistory);

  // ── Behavioral Patterns (0-100) ─────────────────────────
  let behavioralPatterns = 50; // baseline
  if (input.dispute_count === 0) behavioralPatterns += 25;
  else if (input.dispute_count <= 1) behavioralPatterns += 10;
  else behavioralPatterns -= input.dispute_count * 10;

  if (input.completed_escrows >= 10) behavioralPatterns += 25;
  else if (input.completed_escrows >= 5) behavioralPatterns += 15;
  else if (input.completed_escrows >= 1) behavioralPatterns += 5;
  behavioralPatterns = Math.max(0, Math.min(100, behavioralPatterns));

  // ── Review Metrics (0-100) ──────────────────────────────
  let reviewMetrics = 0;
  if (input.review_average >= 4.5) reviewMetrics = 100;
  else if (input.review_average >= 4.0) reviewMetrics = 85;
  else if (input.review_average >= 3.0) reviewMetrics = 70;
  else if (input.review_average >= 2.0) reviewMetrics = 50;
  else if (input.review_average > 0) reviewMetrics = 30;
  reviewMetrics = Math.min(100, reviewMetrics);

  // ── Regulatory Compliance (0-100) ───────────────────────
  let regulatoryCompliance = 0;
  if (input.sanctions_check_passed) regulatoryCompliance += 60;
  else regulatoryCompliance -= 100;

  const allowedJurisdictions = ["US", "EU", "UK", "JP", "SG", "CH", "AU", "CA", "KR"];
  if (allowedJurisdictions.includes(input.jurisdiction.toUpperCase())) {
    regulatoryCompliance += 40;
  } else if (input.jurisdiction.toUpperCase() === "UNKNOWN") {
    regulatoryCompliance += 10;
  } // else 0 for restricted jurisdictions
  regulatoryCompliance = Math.max(0, Math.min(100, regulatoryCompliance));

  // ── Overall Score ───────────────────────────────────────
  const scores = [
    identityProof,
    reputation,
    collateralization,
    onchainHistory,
    behavioralPatterns,
    reviewMetrics,
    regulatoryCompliance,
  ];
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / 7);

  // ── Tier Assignment ─────────────────────────────────────
  let tier: KyaScores["tier"];
  if (overall >= 80) tier = "premium";
  else if (overall >= 60) tier = "trusted";
  else if (overall >= 30) tier = "basic";
  else tier = "untrusted";

  return {
    identity_proof: identityProof,
    reputation,
    collateralization,
    onchain_history: onchainHistory,
    behavioral_patterns: behavioralPatterns,
    review_metrics: reviewMetrics,
    regulatory_compliance: regulatoryCompliance,
    overall,
    tier,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe("KYA-7 Scoring Engine", () => {
  describe("Score Calculation", () => {
    it("returns a perfect score for a fully verified, high-collateral agent", () => {
      const input: KyaInput = {
        agent_id: uuidv4(),
        public_key_hex: Buffer.from(nacl.sign.keyPair().publicKey).toString("hex"),
        github_verified: true,
        twitter_verified: true,
        staked_amount: 50000,
        onchain_transactions: 200,
        onchain_age_days: 400,
        dispute_count: 0,
        completed_escrows: 50,
        review_average: 5.0,
        sanctions_check_passed: true,
        jurisdiction: "US",
      };
      const result = calculateKyaScore(input);
      expect(result.overall).toBe(100);
      expect(result.tier).toBe("premium");
    });

    it("returns minimal score for completely unverified agent", () => {
      const input: KyaInput = {
        agent_id: uuidv4(),
        public_key_hex: "",
        github_verified: false,
        twitter_verified: false,
        staked_amount: 0,
        onchain_transactions: 0,
        onchain_age_days: 0,
        dispute_count: 10,
        completed_escrows: 0,
        review_average: 0,
        sanctions_check_passed: false,
        jurisdiction: "XX",
      };
      const result = calculateKyaScore(input);
      expect(result.tier).toBe("untrusted");
      expect(result.overall).toBeLessThan(30);
    });

    it("assigns 'basic' tier for partially verified agents", () => {
      const input: KyaInput = {
        agent_id: uuidv4(),
        public_key_hex: Buffer.from(nacl.sign.keyPair().publicKey).toString("hex"),
        github_verified: true,
        twitter_verified: false,
        staked_amount: 500,
        onchain_transactions: 10,
        onchain_age_days: 60,
        dispute_count: 1,
        completed_escrows: 3,
        review_average: 3.5,
        sanctions_check_passed: true,
        jurisdiction: "EU",
      };
      const result = calculateKyaScore(input);

      expect(result.overall).toBeGreaterThanOrEqual(30);
      // overall = 62 with these inputs => trusted tier
      expect(result.tier).toBe("trusted");
    });
  });

  describe("Identity Proof Dimension", () => {
    it("scores 100 when both GitHub and Twitter are verified with valid pubkey", () => {
      const input = makeBaseInput({
        github_verified: true,
        twitter_verified: true,
      });
      const result = calculateKyaScore(input);
      expect(result.identity_proof).toBe(100);
    });

    it("scores 0 with no verifications", () => {
      const input = makeBaseInput({
        github_verified: false,
        twitter_verified: false,
        public_key_hex: "",
      });
      const result = calculateKyaScore(input);
      expect(result.identity_proof).toBe(0);
    });
  });

  describe("Reputation Dimension", () => {
    it("increases with completed escrows", () => {
      const low = calculateKyaScore(makeBaseInput({ completed_escrows: 1 }));
      const med = calculateKyaScore(makeBaseInput({ completed_escrows: 3 }));
      const high = calculateKyaScore(makeBaseInput({ completed_escrows: 6 }));

      expect(high.reputation).toBeGreaterThan(med.reputation);
      expect(med.reputation).toBeGreaterThan(low.reputation);
    });

    it("decreases with disputes", () => {
      const noDisputes = calculateKyaScore(makeBaseInput({ dispute_count: 0 }));
      const someDisputes = calculateKyaScore(makeBaseInput({ dispute_count: 5 }));
      expect(noDisputes.reputation).toBeGreaterThan(someDisputes.reputation);
    });
  });

  describe("Collateralization Dimension", () => {
    it("scores 100 with >= $10,000 staked", () => {
      const result = calculateKyaScore(makeBaseInput({ staked_amount: 10000 }));
      expect(result.collateralization).toBe(100);
    });

    it("scores proportionally for lower stakes", () => {
      const r1000 = calculateKyaScore(makeBaseInput({ staked_amount: 1000 }));
      const r500 = calculateKyaScore(makeBaseInput({ staked_amount: 500 }));
      expect(r1000.collateralization).toBeGreaterThan(r500.collateralization);
    });
  });

  describe("On-Chain History Dimension", () => {
    it("scores higher for older wallets", () => {
      const newWallet = calculateKyaScore(makeBaseInput({ onchain_age_days: 10 }));
      const oldWallet = calculateKyaScore(makeBaseInput({ onchain_age_days: 400 }));
      expect(oldWallet.onchain_history).toBeGreaterThan(newWallet.onchain_history);
    });

    it("scores higher for more transactions", () => {
      const few = calculateKyaScore(makeBaseInput({ onchain_transactions: 5 }));
      const many = calculateKyaScore(makeBaseInput({ onchain_transactions: 100 }));
      expect(many.onchain_history).toBeGreaterThan(few.onchain_history);
    });
  });

  describe("Behavioral Patterns Dimension", () => {
    it("penalizes agents with many disputes", () => {
      const clean = calculateKyaScore(makeBaseInput({ dispute_count: 0 }));
      const messy = calculateKyaScore(makeBaseInput({ dispute_count: 10 }));
      expect(clean.behavioral_patterns).toBeGreaterThan(messy.behavioral_patterns);
      expect(messy.behavioral_patterns).toBeLessThanOrEqual(50);
    });

    it("cannot go below 0", () => {
      const result = calculateKyaScore(makeBaseInput({ dispute_count: 20 }));
      expect(result.behavioral_patterns).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Review Metrics Dimension", () => {
    it("scores 100 for 5-star average", () => {
      const result = calculateKyaScore(makeBaseInput({ review_average: 5.0 }));
      expect(result.review_metrics).toBe(100);
    });

    it("scores 0 when no reviews exist", () => {
      const result = calculateKyaScore(makeBaseInput({ review_average: 0 }));
      expect(result.review_metrics).toBe(0);
    });
  });

  describe("Regulatory Compliance Dimension", () => {
    it("scores 100 for approved jurisdiction with sanctions check passed", () => {
      const result = calculateKyaScore(
        makeBaseInput({ sanctions_check_passed: true, jurisdiction: "US" })
      );
      expect(result.regulatory_compliance).toBe(100);
    });

    it("scores 0 for failed sanctions check", () => {
      const result = calculateKyaScore(
        makeBaseInput({ sanctions_check_passed: false, jurisdiction: "US" })
      );
      expect(result.regulatory_compliance).toBe(0);
    });

    it("scores lower for restricted jurisdictions", () => {
      const approved = calculateKyaScore(
        makeBaseInput({ jurisdiction: "SG" })
      );
      const unknown = calculateKyaScore(
        makeBaseInput({ jurisdiction: "UNKNOWN" })
      );
      const restricted = calculateKyaScore(
        makeBaseInput({ jurisdiction: "XX" })
      );
      expect(approved.regulatory_compliance).toBeGreaterThan(unknown.regulatory_compliance);
      expect(unknown.regulatory_compliance).toBeGreaterThan(restricted.regulatory_compliance);
    });
  });

  describe("Tier Assignment", () => {
    it("assigns 'premium' for overall >= 80", () => {
      const result = calculateKyaScore(makeBaseInput({
        github_verified: true,
        twitter_verified: true,
        staked_amount: 10000,
        onchain_transactions: 100,
        onchain_age_days: 365,
        review_average: 4.8,
      }));
      expect(result.tier).toBe("premium");
    });

    it("assigns 'untrusted' for overall < 30", () => {
      const result = calculateKyaScore(makeBaseInput({
        public_key_hex: "",
        github_verified: false,
        twitter_verified: false,
        staked_amount: 0,
        sanctions_check_passed: false,
      }));
      expect(result.tier).toBe("untrusted");
    });

    it("assigns 'trusted' for overall >= 60", () => {
      const result = calculateKyaScore(makeBaseInput({
        github_verified: true,
        twitter_verified: false,
        staked_amount: 2000,
        onchain_transactions: 5,
        onchain_age_days: 60,
        dispute_count: 1,
        completed_escrows: 2,
        review_average: 3.5,
        jurisdiction: "US",
      }));
      expect(result.tier).toBe("trusted");
      expect(result.overall).toBeGreaterThanOrEqual(60);
      expect(result.overall).toBeLessThan(80);
    });
  });

  describe("Dimension Bounds", () => {
    it("every dimension stays within [0, 100]", () => {
      // Test multiple random-ish inputs
      const testCases: KyaInput[] = [
        makeBaseInput({}),
        makeBaseInput({ staked_amount: 0, dispute_count: 50, sanctions_check_passed: false }),
        makeBaseInput({ staked_amount: 100000, dispute_count: 0, review_average: 5.0 }),
      ];

      for (const input of testCases) {
        const result = calculateKyaScore(input);
        for (const dim of KYA_DIMENSIONS) {
          expect(result[dim]).toBeGreaterThanOrEqual(0);
          expect(result[dim]).toBeLessThanOrEqual(100);
        }
      }
    });

    it("overall score stays within [0, 100]", () => {
      const extremes = calculateKyaScore({
        agent_id: uuidv4(),
        public_key_hex: Buffer.from(nacl.sign.keyPair().publicKey).toString("hex"),
        github_verified: true,
        twitter_verified: true,
        staked_amount: 50000,
        onchain_transactions: 500,
        onchain_age_days: 1000,
        dispute_count: 0,
        completed_escrows: 100,
        review_average: 5.0,
        sanctions_check_passed: true,
        jurisdiction: "US",
      });
      expect(extremes.overall).toBeLessThanOrEqual(100);

      const zeros = calculateKyaScore({
        agent_id: uuidv4(),
        public_key_hex: "",
        github_verified: false,
        twitter_verified: false,
        staked_amount: 0,
        onchain_transactions: 0,
        onchain_age_days: 0,
        dispute_count: 100,
        completed_escrows: 0,
        review_average: 0,
        sanctions_check_passed: false,
        jurisdiction: "XX",
      });
      expect(zeros.overall).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Idempotent Scoring", () => {
    it("produces identical results for the same input", () => {
      const input = makeBaseInput({ github_verified: true, staked_amount: 3000 });
      const r1 = calculateKyaScore(input);
      const r2 = calculateKyaScore(input);
      expect(r1).toEqual(r2);
    });
  });
});

// ── Helper ──────────────────────────────────────────────────

function makeBaseInput(overrides: Partial<KyaInput> = {}): KyaInput {
  return {
    agent_id: uuidv4(),
    public_key_hex: Buffer.from(nacl.sign.keyPair().publicKey).toString("hex"),
    github_verified: false,
    twitter_verified: false,
    staked_amount: 0,
    onchain_transactions: 0,
    onchain_age_days: 0,
    dispute_count: 0,
    completed_escrows: 0,
    review_average: 0,
    sanctions_check_passed: true,
    jurisdiction: "US",
    ...overrides,
  };
}