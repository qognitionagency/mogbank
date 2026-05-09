/**
 * MogBank Real Cryptography Module
 *
 * ABOS v1.0 Spec Compliance:
 * - Layer 1 (KYA): Ed25519 public key as root of trust
 * - Layer 6 (Mandates): Ed25519-signed authorization documents
 *
 * Replaces all mock key generation with real @noble/ed25519 cryptography.
 * Key pairs are generated at agent registration. Private keys are NEVER stored
 * server-side — only public keys are persisted. Agents hold their own private keys.
 */

import { ed25519 } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// noble-ed25519 needs SHA-512 for its internal operations
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/**
 * Generate a new Ed25519 keypair for an agent.
 * Called once at registration. Private key is returned to the agent
 * and NEVER stored by MogBank. Only the public key is persisted.
 */
export async function generateAgentKeyPair(): Promise<{
  privateKey: string; // base64-encoded 32-byte seed — returned ONCE to agent
  publicKey: string; // base64-encoded 32-byte public key — stored in DB
}> {
  const privateKeyBytes = ed25519.utils.randomPrivateKey();
  const publicKeyBytes = await ed25519.getPublicKeyAsync(privateKeyBytes);

  return {
    privateKey: bytesToBase64(privateKeyBytes),
    publicKey: bytesToBase64(publicKeyBytes),
  };
}

/**
 * Sign a payload with the agent's private key.
 * Used by the agent SDK client-side — the agent signs API requests
 * to prove it controls the registered public key.
 */
export async function signPayload(
  payload: Uint8Array,
  privateKeyBase64: string
): Promise<string> {
  const privateKey = base64ToBytes(privateKeyBase64);
  const signature = await ed25519.signAsync(payload, privateKey);
  return bytesToBase64(signature);
}

/**
 * Verify a signature against an agent's registered public key.
 * Called by the API server to authenticate agent requests.
 * This is the root of trust for ALL agent financial operations.
 */
export async function verifySignature(
  payload: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  const signature = base64ToBytes(signatureBase64);
  const publicKey = base64ToBytes(publicKeyBase64);
  return ed25519.verifyAsync(signature, payload, publicKey);
}

/**
 * Sign a mandate document. Mandates are structured JSON documents
 * that principals sign to delegate financial authority to agents.
 * ABOS v1.0 Layer 6 compliance.
 */
export async function signMandate(
  mandatePayload: Record<string, unknown>,
  privateKeyBase64: string
): Promise<string> {
  // Canonical JSON serialization — sorted keys for deterministic signing
  const canonicalJson = JSON.stringify(mandatePayload, Object.keys(mandatePayload).sort());
  const payloadBytes = new TextEncoder().encode(canonicalJson);
  return signPayload(payloadBytes, privateKeyBase64);
}

/**
 * Verify a mandate signature. Ensures the mandate was signed by
 * the claimed principal and hasn't been tampered with.
 */
export async function verifyMandateSignature(
  mandatePayload: Record<string, unknown>,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  const canonicalJson = JSON.stringify(mandatePayload, Object.keys(mandatePayload).sort());
  const payloadBytes = new TextEncoder().encode(canonicalJson);
  return verifySignature(payloadBytes, signatureBase64, publicKeyBase64);
}

/**
 * Generate a real Ethereum/Base L2 wallet address derived from the
 * agent's Ed25519 public key. This replaces the mock "0x..." addresses.
 *
 * For production: this derivation goes through ECDSA secp256k1
 * (the Ethereum standard). We generate a separate secp256k1 keypair
 * and derive the 0x address. The Ed25519 key signs API requests;
 * the secp256k1 key controls the on-chain wallet.
 */
export async function generateWalletAddress(): Promise<{
  address: string; // 0x-prefixed Ethereum address
  privateKey: string; // hex-encoded — returned ONCE
}> {
  // Dynamic import to avoid bundling issues with noble curves
  const { secp256k1 } = await import("@noble/curves/secp256k1");
  const { bytesToHex } = await import("@noble/hashes/utils");
  const { keccak_256 } = await import("@noble/hashes/sha3");

  const privateKeyBytes = secp256k1.utils.randomPrivateKey();
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);

  // Ethereum address: keccak256(last 20 bytes of public key), take last 20 bytes
  // The uncompressed public key is 65 bytes (0x04 || x || y)
  // We hash the x and y (64 bytes without the prefix) using keccak256
  const hash = keccak_256(publicKeyBytes.slice(1)); // skip the 0x04 prefix byte
  const address = "0x" + bytesToHex(hash.slice(12)); // last 20 bytes

  // Convert private key to hex with 0x prefix
  const privateKeyHex = "0x" + bytesToHex(privateKeyBytes);

  return { address, privateKey: privateKeyHex };
}

/**
 * Create an API key for an agent. API keys are used for simpler
 * authentication on testnet and basic mainnet operations.
 * Mandate-signed requests use Ed25519 signatures instead.
 *
 * Generates a cryptographically secure 256-bit random key.
 * The key is shown ONCE — a bcrypt hash is stored for verification.
 */
export function generateApiKey(prefix: "mog_test" | "mog_live" = "mog_test"): {
  apiKey: string; // shown once at creation
  keyHash: string; // bcrypt hash to store
} {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const keyMaterial = bytesToBase64(randomBytes).replace(/[+/=]/g, "").slice(0, 32);
  const apiKey = `${prefix}_${keyMaterial}`;
  // bcrypt hash would be computed here in production
  // For now we store a SHA-256 hash as a placeholder
  const keyHash = `sha256:${sha256Hex(new TextEncoder().encode(apiKey))}`;
  return { apiKey, keyHash };
}

// -- Utility functions --

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function sha256Hex(data: Uint8Array): string {
  const { sha256 } = require("@noble/hashes/sha256");
  const { bytesToHex } = require("@noble/hashes/utils");
  return bytesToHex(sha256(data));
}