/**
 * MogBank Real Cryptography Module — Vercel Edge-Compatible
 *
 * ABOS v1.0 Spec Compliance:
 * - Layer 1 (KYA): Ed25519 public key as root of trust
 * - Layer 6 (Mandates): Ed25519-signed authorization documents
 *
 * Uses Web Crypto API (available in Edge/Node runtimes) + tweetnacl for Ed25519.
 * No require() calls. No Buffer dependency (uses Uint8Array).
 * Vercel Edge/Node runtimes both supported.
 */

import nacl from 'tweetnacl'

// Re-export nacl for consumers
export { nacl }

// -- Key Generation (Ed25519 via tweetnacl) --

export async function generateAgentKeyPair(): Promise<{
  privateKey: string
  publicKey: string
}> {
  const keyPair = nacl.sign.keyPair()
  return {
    privateKey: bytesToBase64(keyPair.secretKey),
    publicKey: bytesToBase64(keyPair.publicKey),
  }
}

// -- Signing / Verification (Ed25519 via tweetnacl) --

export async function signPayload(
  payload: Uint8Array,
  privateKeyBase64: string
): Promise<string> {
  const secretKey = base64ToBytes(privateKeyBase64)
  const signature = nacl.sign.detached(payload, secretKey)
  return bytesToBase64(signature)
}

export async function verifySignature(
  payload: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    const signature = base64ToBytes(signatureBase64)
    const publicKey = base64ToBytes(publicKeyBase64)
    return nacl.sign.detached.verify(payload, signature, publicKey)
  } catch {
    return false
  }
}

// -- Mandate Signing --

export async function signMandate(
  mandatePayload: Record<string, unknown>,
  privateKeyBase64: string
): Promise<string> {
  const canonicalJson = JSON.stringify(
    mandatePayload,
    Object.keys(mandatePayload).sort()
  )
  const payloadBytes = new TextEncoder().encode(canonicalJson)
  return signPayload(payloadBytes, privateKeyBase64)
}

export async function verifyMandateSignature(
  mandatePayload: Record<string, unknown>,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  const canonicalJson = JSON.stringify(
    mandatePayload,
    Object.keys(mandatePayload).sort()
  )
  const payloadBytes = new TextEncoder().encode(canonicalJson)
  return verifySignature(payloadBytes, signatureBase64, publicKeyBase64)
}

// -- Wallet Address Generation (Ethereum / Base L2 via Web Crypto) --

export async function generateWalletAddress(): Promise<{
  address: string
  privateKey: string
}> {
  // Generate ECDSA secp256k1 key pair via Web Crypto
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256', // Note: Web Crypto doesn't support secp256k1 natively; P-256 used here
    },
    true,
    ['sign', 'verify']
  )

  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  const publicKeyBytes = new Uint8Array(publicKeyRaw)

  // Generate a deterministic "Ethereum-style" address from the public key
  // Uses SHA-256 instead of keccak256 (Web Crypto compatible)
  const hash = await crypto.subtle.digest('SHA-256', publicKeyBytes)
  const address = '0x' + bytesToHex(new Uint8Array(hash).slice(0, 20))

  // Export private key as hex string
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  const privateKeyHex = '0x' + bytesToHex(new Uint8Array(pkcs8).slice(-32))

  return { address, privateKey: privateKeyHex }
}

// -- API Key Generation --

export function generateApiKey(
  prefix: 'mog_test' | 'mog_live' = 'mog_test'
): { apiKey: string; keyHash: string } {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const keyMaterial = bytesToBase64(randomBytes)
    .replace(/[+/=]/g, '')
    .slice(0, 32)
  const apiKey = `${prefix}_${keyMaterial}`

  // Hash the key for storage using Web Crypto
  const encoder = new TextEncoder()
  const keyBytes = encoder.encode(apiKey)
  // Synchronous hash via subtle crypto is async, use sync alternative:
  // We use tweetnacl's hash for deterministic output
  const hash = nacl.hash(keyBytes)
  const keyHash = `sha512:${bytesToHex(hash.slice(0, 32))}`

  return { apiKey, keyHash }
}

// -- Idempotency Key Hashing --

export function hashIdempotencyKey(key: string): string {
  const keyBytes = new TextEncoder().encode(key)
  const hash = nacl.hash(keyBytes)
  return bytesToHex(hash.slice(0, 32))
}

// -- Utility: Hex encoding (pure JS, no Buffer) --

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// -- Utility: Base64 (pure JS, no Buffer) --

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}