/**
 * Ed25519 Cryptographic Service Tests
 *
 * Tests mandate signing/verification, key management, and signature integrity.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import nacl from "tweetnacl";
import { v4 as uuidv4 } from "uuid";

// ── Test helpers ────────────────────────────────────────────

function createEd25519Keypair(): { publicKey: Buffer; secretKey: Buffer } {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(kp.publicKey),
    secretKey: Buffer.from(kp.secretKey),
  };
}

function signMessage(message: string, secretKey: Buffer): string {
  const encoder = new TextEncoder();
  const msgBytes = encoder.encode(message);
  const sig = nacl.sign.detached(msgBytes, Uint8Array.from(secretKey));
  return Buffer.from(sig).toString("hex");
}

function verifySignature(message: string, signature: string, publicKey: Buffer): boolean {
  try {
    const encoder = new TextEncoder();
    const msgBytes = encoder.encode(message);
    const sigBytes = Uint8Array.from(Buffer.from(signature, "hex"));
    return nacl.sign.detached.verify(msgBytes, sigBytes, Uint8Array.from(publicKey));
  } catch {
    return false;
  }
}

// ── Tests ───────────────────────────────────────────────────

describe("Ed25519 Cryptographic Service", () => {
  let kp: { publicKey: Buffer; secretKey: Buffer };

  beforeAll(() => {
    kp = createEd25519Keypair();
  });

  describe("Key Generation", () => {
    it("generates a valid Ed25519 keypair", () => {
      expect(kp.publicKey).toBeDefined();
      expect(kp.secretKey).toBeDefined();
      expect(kp.publicKey.length).toBe(32);
      expect(kp.secretKey.length).toBe(64); // 32 seed + 32 public
    });

    it("generates unique keypairs each time", () => {
      const kp1 = createEd25519Keypair();
      const kp2 = createEd25519Keypair();
      expect(Buffer.from(kp1.publicKey).toString("hex")).not.toBe(
        Buffer.from(kp2.publicKey).toString("hex")
      );
      expect(Buffer.from(kp1.secretKey).toString("hex")).not.toBe(
        Buffer.from(kp2.secretKey).toString("hex")
      );
    });

    it("secret key contains the public key as its second half", () => {
      const pubFromSecret = kp.secretKey.subarray(32);
      expect(Buffer.from(pubFromSecret).toString("hex")).toBe(
        Buffer.from(kp.publicKey).toString("hex")
      );
    });
  });

  describe("Message Signing", () => {
    it("signs a message and produces a 64-byte hex signature", () => {
      const message = "transfer:from:agent-123:to:agent-456:amount:100USDC";
      const sig = signMessage(message, kp.secretKey);
      expect(sig).toBeDefined();
      expect(sig.length).toBe(128); // 64 bytes = 128 hex chars
      expect(/^[0-9a-f]{128}$/.test(sig)).toBe(true);
    });

    it("produces deterministic signatures for the same message and key", () => {
      const message = "agent-registration:agent-xyz";
      const sig1 = signMessage(message, kp.secretKey);
      const sig2 = signMessage(message, kp.secretKey);
      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different messages", () => {
      const sig1 = signMessage("message-1", kp.secretKey);
      const sig2 = signMessage("message-2", kp.secretKey);
      expect(sig1).not.toBe(sig2);
    });

    it("signs empty messages", () => {
      const sig = signMessage("", kp.secretKey);
      expect(sig.length).toBe(128);
    });

    it("signs large messages (10KB)", () => {
      const message = "x".repeat(10240);
      const sig = signMessage(message, kp.secretKey);
      expect(sig.length).toBe(128);
    });
  });

  describe("Signature Verification", () => {
    it("verifies a valid signature", () => {
      const message = "escrow:create:service-abc:amount:50USDC";
      const sig = signMessage(message, kp.secretKey);
      const valid = verifySignature(message, sig, kp.publicKey);
      expect(valid).toBe(true);
    });

    it("rejects a signature with a tampered message", () => {
      const message = "mandate:approve:tx-123";
      const sig = signMessage(message, kp.secretKey);
      const valid = verifySignature("mandate:approve:tx-456", sig, kp.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects a signature with a wrong public key", () => {
      const message = "transfer:100USDC";
      const sig = signMessage(message, kp.secretKey);
      const otherKp = createEd25519Keypair();
      const valid = verifySignature(message, sig, otherKp.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects a tampered signature (flipped bit)", () => {
      const message = "test-message";
      const sig = signMessage(message, kp.secretKey);
      // Flip last bit of signature
      const sigBytes = Buffer.from(sig, "hex");
      sigBytes[sigBytes.length - 1] ^= 0x01;
      const valid = verifySignature(message, sigBytes.toString("hex"), kp.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects an empty signature", () => {
      const valid = verifySignature("message", "", kp.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects an invalid hex signature", () => {
      const valid = verifySignature("message", "not-a-valid-hex-sig!!!", kp.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe("Mandate Signing (Agent Authorization)", () => {
    it("signs and verifies a mandate authorization", () => {
      const mandate = {
        agent_id: uuidv4(),
        action: "transfer",
        max_amount: 5000,
        currency: "USDC",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        nonce: uuidv4(),
      };
      const mandateString = JSON.stringify(mandate, Object.keys(mandate).sort());
      const sig = signMessage(mandateString, kp.secretKey);
      const valid = verifySignature(mandateString, sig, kp.publicKey);
      expect(valid).toBe(true);
    });

    it("detects mandate tampering (amount changed)", () => {
      const mandate = JSON.stringify({
        agent_id: "agent-001",
        max_amount: 1000,
      });
      const sig = signMessage(mandate, kp.secretKey);
      const tampered = JSON.stringify({
        agent_id: "agent-001",
        max_amount: 99999,
      });
      const valid = verifySignature(tampered, sig, kp.publicKey);
      expect(valid).toBe(false);
    });

    it("detects mandate tampering (agent_id changed)", () => {
      const mandate = JSON.stringify({ agent_id: "agent-A", action: "read" });
      const sig = signMessage(mandate, kp.secretKey);
      const tampered = JSON.stringify({ agent_id: "agent-B", action: "read" });
      const valid = verifySignature(tampered, sig, kp.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe("X-API-Signature Header Verification", () => {
    it("signs a payload and verifies the x-api-signature header", () => {
      const payload = JSON.stringify({
        from_wallet_id: uuidv4(),
        to_agent_id: uuidv4(),
        amount: 250,
        currency: "USDC",
      });
      const sig = signMessage(payload, kp.secretKey);
      const valid = verifySignature(payload, sig, kp.publicKey);
      expect(valid).toBe(true);
    });

    it("fails signature verification if payload ordering changes", () => {
      const payload1 = JSON.stringify({ a: 1, b: 2 });
      const sig = signMessage(payload1, kp.secretKey);
      const payload2 = JSON.stringify({ b: 2, a: 1 }); // different order
      const valid = verifySignature(payload2, sig, kp.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe("Credential Signing (x402)", () => {
    it("signs and verifies an x402 credential", () => {
      const credential = {
        id: uuidv4(),
        issuer: "mogbank",
        subject: `agent:${uuidv4()}`,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        scopes: ["transfer", "read:balance", "escrow:create"],
      };
      const credString = JSON.stringify(credential);
      const sig = signMessage(credString, kp.secretKey);

      expect(sig.length).toBe(128);
      const valid = verifySignature(credString, sig, kp.publicKey);
      expect(valid).toBe(true);
    });
  });

  describe("Cross-key Interactions", () => {
    it("agent-A signature is rejected by agent-B's public key", () => {
      const alice = createEd25519Keypair();
      const bob = createEd25519Keypair();

      const message = "pay:bob:100USDC";
      const aliceSig = signMessage(message, alice.secretKey);
      expect(verifySignature(message, aliceSig, alice.publicKey)).toBe(true);
      expect(verifySignature(message, aliceSig, bob.publicKey)).toBe(false);
    });

    it("multiple agents can independently sign and verify", () => {
      const agents = Array.from({ length: 10 }, () => createEd25519Keypair());
      const messages = agents.map((a, i) => `msg-${i}:agent-${i}`);

      for (let i = 0; i < agents.length; i++) {
        const sig = signMessage(messages[i], agents[i].secretKey);
        expect(verifySignature(messages[i], sig, agents[i].publicKey)).toBe(true);
        // Should NOT verify with other agent's keys
        const j = (i + 1) % agents.length;
        expect(verifySignature(messages[i], sig, agents[j].publicKey)).toBe(false);
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles unicode messages", () => {
      const message = "转账:代理-张三:金额:1000USDC 🔥";
      const sig = signMessage(message, kp.secretKey);
      expect(verifySignature(message, sig, kp.publicKey)).toBe(true);
    });

    it("handles long hex key representation", () => {
      const pubHex = Buffer.from(kp.publicKey).toString("hex");
      expect(pubHex.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(pubHex)).toBe(true);

      const recoveredPub = Buffer.from(pubHex, "hex");
      const message = "key-recovery-test";
      const sig = signMessage(message, kp.secretKey);
      expect(verifySignature(message, sig, recoveredPub)).toBe(true);
    });
  });
});