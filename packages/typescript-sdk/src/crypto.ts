/**
 * Ed25519 cryptographic utilities for the MogBank SDK.
 *
 * Handles key generation, signing, verification, and mandate creation.
 * Uses tweetnacl for Ed25519 which is widely supported and audited.
 */
import { Ed25519KeyPair } from './types';

export class CryptoUtils {
  /**
   * Generate a new Ed25519 key pair for an AI agent.
   * Returns base64-encoded keys.
   */
  static async generateKeyPair(): Promise<Ed25519KeyPair> {
    const nacl = await import('tweetnacl');
    const naclUtil = await import('tweetnacl-util');

    const keyPair = nacl.sign.keyPair();

    return {
      publicKey: naclUtil.encodeBase64(keyPair.publicKey),
      secretKey: naclUtil.encodeBase64(keyPair.secretKey),
    };
  }

  /**
   * Generate a new Ed25519 key pair synchronously (if nacl is already loaded).
   */
  static generateKeyPairSync(): Ed25519KeyPair {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nacl = require('tweetnacl');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const naclUtil = require('tweetnacl-util');

    const keyPair = nacl.sign.keyPair();

    return {
      publicKey: naclUtil.encodeBase64(keyPair.publicKey),
      secretKey: naclUtil.encodeBase64(keyPair.secretKey),
    };
  }

  /**
   * Sign a message with an Ed25519 secret key.
   * Returns the base64-encoded signature.
   */
  static async signMessage(message: string, secretKeyBase64: string): Promise<string> {
    const nacl = await import('tweetnacl');
    const naclUtil = await import('tweetnacl-util');

    const messageBytes = naclUtil.decodeUTF8(message);
    const secretKey = naclUtil.decodeBase64(secretKeyBase64);

    const signature = nacl.sign.detached(messageBytes, secretKey);
    return naclUtil.encodeBase64(signature);
  }

  /**
   * Verify a message signature against a public key.
   */
  static async verifySignature(
    message: string,
    signatureBase64: string,
    publicKeyBase64: string
  ): Promise<boolean> {
    const nacl = await import('tweetnacl');
    const naclUtil = await import('tweetnacl-util');

    const messageBytes = naclUtil.decodeUTF8(message);
    const signature = naclUtil.decodeBase64(signatureBase64);
    const publicKey = naclUtil.decodeBase64(publicKeyBase64);

    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  }

  /**
   * Create a signed mandate authorizing a payment action.
   *
   * A mandate is an Ed25519-signed JSON payload that authorizes
   * a specific agent action (transfer, delegate, etc.) within
   * specified parameters.
   */
  static async createMandate(
    agentId: string,
    action: string,
    maxAmount: number,
    validUntil: Date,
    secretKeyBase64: string,
    delegateId?: string
  ): Promise<{
    id: string;
    agent_id: string;
    delegate_id?: string;
    action: string;
    max_amount: number;
    valid_until: string;
    signature: string;
  }> {
    const id = `mandate_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const payload = {
      id,
      agent_id: agentId,
      delegate_id: delegateId,
      action,
      max_amount: maxAmount,
      valid_until: validUntil.toISOString(),
      currency: 'USDC',
      valid_from: new Date().toISOString(),
    };

    const message = JSON.stringify(payload);
    const signature = await this.signMessage(message, secretKeyBase64);

    return { ...payload, signature };
  }

  /**
   * Create a transfer authorization message for x402 protocol.
   */
  static createTransferAuthorization(
    fromAgentId: string,
    toAgentId: string,
    amount: number,
    currency: string
  ): string {
    const timestamp = Date.now();
    return JSON.stringify({
      protocol: 'x402-v1',
      type: 'transfer_authorization',
      from: fromAgentId,
      to: toAgentId,
      amount,
      currency,
      timestamp,
      nonce: `${timestamp}_${Math.random().toString(36).substring(2, 10)}`,
    });
  }

  /**
   * Hash an Ed25519 public key for agent registration.
   * Uses SHA-256 of the public key, returning hex string.
   */
  static async hashPublicKey(publicKeyBase64: string): Promise<string> {
    const naclUtil = await import('tweetnacl-util');
    const publicKeyBytes = naclUtil.decodeBase64(publicKeyBase64);

    // Use Web Crypto API for SHA-256
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: simple hash for non-browser environments
    const { createHash } = await import('crypto');
    return createHash('sha256').update(publicKeyBytes).digest('hex');
  }
}