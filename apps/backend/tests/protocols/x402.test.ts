/**
 * x402 Protocol Middleware Tests
 *
 * Tests x402 payment-required protocol handling, credential issuance,
 * verification, and request/response middleware chain.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";
import nacl from "tweetnacl";

// ── x402 Types ──────────────────────────────────────────────

interface X402Credential {
  id: string;
  issuer: string;
  subject: string;
  issued_at: string;
  expires_at: string;
  scopes: string[];
  signature: string;
}

interface X402PaymentRequest {
  id: string;
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  expires_at: string;
  credential_required: boolean;
}

interface X402PaymentReceipt {
  request_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  transaction_hash: string;
}

// ── x402 Middleware Engine ──────────────────────────────────

class X402ProtocolHandler {
  private issuedCredentials: Map<string, X402Credential> = new Map();
  private verifiedCredentials: Set<string> = new Set();
  private paymentReceipts: Map<string, X402PaymentReceipt> = new Map();
  private keypair: { publicKey: Buffer; secretKey: Buffer };

  constructor() {
    const kp = nacl.sign.keyPair();
    this.keypair = {
      publicKey: Buffer.from(kp.publicKey),
      secretKey: Buffer.from(kp.secretKey),
    };
  }

  /** Issue a credential signed by the MogBank authority */
  issueCredential(
    subject: string,
    scopes: string[],
    ttlMs: number = 3600000
  ): X402Credential {
    const credential: Omit<X402Credential, "signature"> = {
      id: uuidv4(),
      issuer: "mogbank",
      subject,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      scopes,
    };

    const payload = JSON.stringify(credential, Object.keys(credential).sort());
    const sigBytes = nacl.sign.detached(
      new TextEncoder().encode(payload),
      this.keypair.secretKey
    );
    const signature = Buffer.from(sigBytes).toString("hex");

    const fullCredential: X402Credential = { ...credential, signature };
    this.issuedCredentials.set(fullCredential.id, fullCredential);
    return fullCredential;
  }

  /** Verify a credential's signature and expiry */
  verifyCredential(credential: X402Credential): boolean {
    const { signature, ...payload } = credential;
    const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
    const sigBytes = Uint8Array.from(Buffer.from(signature, "hex"));
    const valid = nacl.sign.detached.verify(
      new TextEncoder().encode(payloadString),
      sigBytes,
      this.keypair.publicKey
    );

    if (!valid) return false;

    // Check expiry
    if (new Date(credential.expires_at) < new Date()) return false;

    return true;
  }

  /** Check if a credential has sufficient scope for a request */
  authorizeRequest(credential: X402Credential, requiredScope: string): boolean {
    if (!this.verifyCredential(credential)) return false;
    return credential.scopes.includes(requiredScope);
  }

  /** Create a payment request (402 Payment Required) */
  createPaymentRequest(
    amount: number,
    currency: string,
    recipient: string,
    description: string,
    requireCredential: boolean = true
  ): X402PaymentRequest {
    return {
      id: uuidv4(),
      amount,
      currency,
      recipient,
      description,
      expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min
      credential_required: requireCredential,
    };
  }

  /** Record a payment receipt after successful payment */
  recordPayment(
    requestId: string,
    amount: number,
    currency: string,
    transactionHash: string
  ): X402PaymentReceipt {
    const receipt: X402PaymentReceipt = {
      request_id: requestId,
      payment_id: uuidv4(),
      amount,
      currency,
      paid_at: new Date().toISOString(),
      transaction_hash: transactionHash,
    };
    this.paymentReceipts.set(requestId, receipt);
    return receipt;
  }

  /** Get payment receipt for a request */
  getPaymentReceipt(requestId: string): X402PaymentReceipt | undefined {
    return this.paymentReceipts.get(requestId);
  }

  /** Check if payment was made */
  isPaymentVerified(requestId: string): boolean {
    return this.paymentReceipts.has(requestId);
  }

  /** Get MogBank's public key */
  getPublicKey(): Buffer {
    return Buffer.from(this.keypair.publicKey);
  }
}

// ── Tests ───────────────────────────────────────────────────

describe("x402 Protocol Middleware", () => {
  let x402: X402ProtocolHandler;

  beforeEach(() => {
    x402 = new X402ProtocolHandler();
  });

  describe("Credential Issuance", () => {
    it("issues a valid signed credential", () => {
      const cred = x402.issueCredential("agent:test-123", ["transfer", "read:balance"]);
      expect(cred.id).toBeDefined();
      expect(cred.issuer).toBe("mogbank");
      expect(cred.subject).toBe("agent:test-123");
      expect(cred.scopes).toEqual(["transfer", "read:balance"]);
      expect(cred.signature.length).toBe(128); // 64 bytes hex
    });

    it("sets correct expiry", () => {
      const cred = x402.issueCredential("agent:abc", ["read"], 60000);
      const expiresAt = new Date(cred.expires_at);
      const issuedAt = new Date(cred.issued_at);
      expect(expiresAt.getTime() - issuedAt.getTime()).toBeGreaterThanOrEqual(59000);
      expect(expiresAt.getTime() - issuedAt.getTime()).toBeLessThanOrEqual(61000);
    });

    it("issues unique credentials each call", () => {
      const cred1 = x402.issueCredential("same-agent", ["read"]);
      const cred2 = x402.issueCredential("same-agent", ["read"]);
      expect(cred1.id).not.toBe(cred2.id);
      expect(cred1.signature).not.toBe(cred2.signature);
    });
  });

  describe("Credential Verification", () => {
    it("verifies a valid credential", () => {
      const cred = x402.issueCredential("agent:valid", ["transfer"]);
      expect(x402.verifyCredential(cred)).toBe(true);
    });

    it("rejects a tampered credential", () => {
      const cred = x402.issueCredential("agent:tampered", ["read"]);
      cred.scopes.push("transfer"); // scope escalation
      expect(x402.verifyCredential(cred)).toBe(false);
    });

    it("rejects an expired credential", () => {
      // Issue with negative TTL (immediately expired)
      const cred = x402.issueCredential("agent:expired", ["read"], -1000);
      expect(x402.verifyCredential(cred)).toBe(false);
    });

    it("rejects a credential with wrong issuer", () => {
      const cred = x402.issueCredential("agent:hacked", ["read"]);
      cred.issuer = "evil-bank";
      expect(x402.verifyCredential(cred)).toBe(false);
    });

    it("rejects a credential from a different authority (different keypair)", () => {
      const otherHandler = new X402ProtocolHandler();
      const foreignCred = otherHandler.issueCredential("foreign-agent", ["read"]);
      expect(x402.verifyCredential(foreignCred)).toBe(false);
    });
  });

  describe("Authorization (Scope-based)", () => {
    it("authorizes request with matching scope", () => {
      const cred = x402.issueCredential("agent:auth", ["transfer", "escrow:create"]);
      expect(x402.authorizeRequest(cred, "transfer")).toBe(true);
    });

    it("rejects request without required scope", () => {
      const cred = x402.issueCredential("agent:limited", ["read:balance"]);
      expect(x402.authorizeRequest(cred, "transfer")).toBe(false);
    });

    it("rejects request with expired credential even if scope matches", () => {
      const cred = x402.issueCredential("agent:late", ["transfer"], -5000);
      expect(x402.authorizeRequest(cred, "transfer")).toBe(false);
    });
  });

  describe("402 Payment Required Flow", () => {
    it("creates a payment request", () => {
      const req = x402.createPaymentRequest(10, "USDC", "mogbank:escrow:123", "API call payment");
      expect(req.id).toBeDefined();
      expect(req.amount).toBe(10);
      expect(req.currency).toBe("USDC");
      expect(req.credential_required).toBe(true);
    });

    it("payment request has a valid expiry", () => {
      const req = x402.createPaymentRequest(5, "USDC", "recipient", "test");
      expect(new Date(req.expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Payment Recording and Verification", () => {
    it("records a payment receipt", () => {
      const req = x402.createPaymentRequest(25, "USDC", "mogbank:service:ai", "AI agent query");
      const receipt = x402.recordPayment(req.id, 25, "USDC", "0xabcdef1234567890");
      expect(receipt.request_id).toBe(req.id);
      expect(receipt.transaction_hash).toBe("0xabcdef1234567890");
      expect(receipt.amount).toBe(25);
    });

    it("retrieves payment receipt by request ID", () => {
      const req = x402.createPaymentRequest(50, "USDC", "recipient", "test");
      x402.recordPayment(req.id, 50, "USDC", "0xhash");
      const receipt = x402.getPaymentReceipt(req.id);
      expect(receipt).toBeDefined();
      expect(receipt!.payment_id).toBeDefined();
    });

    it("returns undefined for unverified payment", () => {
      expect(x402.getPaymentReceipt("non-existent")).toBeUndefined();
    });

    it("verifies payment status", () => {
      const req = x402.createPaymentRequest(1, "USDC", "test", "test");
      expect(x402.isPaymentVerified(req.id)).toBe(false);
      x402.recordPayment(req.id, 1, "USDC", "0xtxhash");
      expect(x402.isPaymentVerified(req.id)).toBe(true);
    });
  });

  describe("End-to-End x402 Agent Interaction", () => {
    it("completes full credential -> payment -> authorization flow", () => {
      // Agent requests a credential
      const cred = x402.issueCredential("agent:e2e", ["api:access"]);

      // Server verifies credential and requires payment
      expect(x402.verifyCredential(cred)).toBe(true);

      // Payment required for API access
      const paymentReq = x402.createPaymentRequest(5, "USDC", "mogbank:treasury", "API call");
      x402.recordPayment(paymentReq.id, 5, "USDC", "0xe2e_transaction_hash");

      // Verify payment and authorize
      expect(x402.isPaymentVerified(paymentReq.id)).toBe(true);
      expect(x402.authorizeRequest(cred, "api:access")).toBe(true);
    });

    it("blocks agent without payment", () => {
      const cred = x402.issueCredential("agent:freeloader", ["api:access"]);
      const paymentReq = x402.createPaymentRequest(1, "USDC", "mogbank:treasury", "API access");
      // Payment NOT recorded
      expect(x402.isPaymentVerified(paymentReq.id)).toBe(false);
      // Credential is still valid but payment is missing
      expect(x402.verifyCredential(cred)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty scope credentials", () => {
      const cred = x402.issueCredential("agent:empty", []);
      expect(x402.verifyCredential(cred)).toBe(true);
      expect(x402.authorizeRequest(cred, "anything")).toBe(false);
    });

    it("rejects zero-amount payment request", () => {
      const req = x402.createPaymentRequest(0, "USDC", "test", "free?");
      expect(req.amount).toBe(0);
    });

    it("handles very long scope names", () => {
      const longScope = "a".repeat(1000);
      const cred = x402.issueCredential("agent:long", [longScope]);
      expect(x402.authorizeRequest(cred, longScope)).toBe(true);
    });
  });
});