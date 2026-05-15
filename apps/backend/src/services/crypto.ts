/**
 * MogBank Backend Cryptography Service
 *
 * Handles Ed25519 signature verification, mandate signature verification,
 * and all cryptographic operations on the server side.
 * Agents sign with their private keys client-side; this service verifies.
 */
import { ed25519 } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { logger } from '../utils/logger';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

// In-memory cache for agent public keys (reduces DB lookups)
const publicKeyCache = new Map<string, string>();

export function cacheAgentPublicKey(agentId: string, publicKeyBase64: string): void {
  publicKeyCache.set(agentId, publicKeyBase64);
}

export function evictCachedPublicKey(agentId: string): void {
  publicKeyCache.delete(agentId);
}

/**
 * Verify an Ed25519 signature from an agent.
 * This is the root of trust for all agent-initiated operations.
 */
export async function verifyAgentSignature(
  payload: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    const signature = base64ToBytes(signatureBase64);
    const publicKey = base64ToBytes(publicKeyBase64);
    return await ed25519.verifyAsync(signature, payload, publicKey);
  } catch (error) {
    logger.error('Signature verification failed', error);
    return false;
  }
}

/**
 * Verify a mandate document signature.
 * Ensures the mandate JSON was signed by the claimed principal.
 */
export async function verifyMandateSignature(
  mandatePayload: Record<string, unknown>,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  const canonicalJson = JSON.stringify(
    mandatePayload,
    Object.keys(mandatePayload).sort()
  );
  const payloadBytes = new TextEncoder().encode(canonicalJson);
  return verifyAgentSignature(payloadBytes, signatureBase64, publicKeyBase64);
}

/**
 * Construct the canonical payload that an agent should sign for API requests.
 */
export function buildSigningPayload(request: {
  method: string;
  path: string;
  body: Record<string, unknown>;
  timestamp: string;
  nonce: string;
}): Uint8Array {
  const payloadObj = {
    method: request.method,
    path: request.path,
    body: JSON.stringify(request.body, Object.keys(request.body).sort()),
    timestamp: request.timestamp,
    nonce: request.nonce,
  };
  const canonical = JSON.stringify(payloadObj, Object.keys(payloadObj).sort());
  return new TextEncoder().encode(canonical);
}

/**
 * Verify the full API request signature (timestamp in headers, body hash).
 */
export async function verifyRequestSignature(
  method: string,
  path: string,
  body: Record<string, unknown>,
  signatureBase64: string,
  publicKeyBase64: string,
  timestamp: string,
  nonce: string
): Promise<boolean> {
  const payload = buildSigningPayload({ method, path, body, timestamp, nonce });
  return verifyAgentSignature(payload, signatureBase64, publicKeyBase64);
}

/**
 * Hash an idempotency key for storage and lookup.
 */
export function hashIdempotencyKey(key: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(key)));
}

// -- Utilities --

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export { bytesToBase64, base64ToBytes, sha256, bytesToHex };