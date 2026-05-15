/** Jest setup — global mocks and test helpers for MogBank backend tests. */

import { jest } from "@jest/globals";

// ── Environment ─────────────────────────────────────────────
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/mogbank_test";
process.env.REDIS_URL = "redis://localhost:6379/1";
process.env.BASE_RPC_URL = "https://sepolia.base.org";
process.env.USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e79295418933741e69DEF";
process.env.DDSC_ADDRESS = "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd";
process.env.JWT_SECRET = "test-secret-key-for-tests-only";
process.env.FAUCET_DAILY_LIMIT = "1000";
process.env.MAX_TRANSFER_AMOUNT = "10000";

// ── Global test utilities ───────────────────────────────────

/**
 * Generate a random Ed25519 test keypair.
 */
export function generateTestKeypair(): { publicKey: Buffer; privateKey: Buffer } {
  const nacl = require("tweetnacl");
  const kp = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(kp.publicKey),
    privateKey: Buffer.from(kp.secretKey),
  };
}

/**
 * Create a mock Express request with optional overrides.
 */
export function mockRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    query: {},
    params: {},
    body: {},
    ip: "127.0.0.1",
    ...overrides,
  } as any;
}

/**
 * Create a mock Express response with spy methods.
 */
export function mockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.write = jest.fn().mockReturnValue(true);
  return res;
}

/**
 * Create a mock NextFunction.
 */
export function mockNext() {
  return jest.fn() as any;
}

/**
 * Build a mock database client (pg Pool).
 */
export function mockDb() {
  return {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  } as any;
}

/**
 * Build a mock Redis client.
 */
export function mockRedis() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    setex: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
  } as any;
}

/**
 * Build a mock WebSocket.
 */
export function mockWebSocket() {
  return {
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    readyState: 1, // OPEN
    OPEN: 1,
  } as any;
}

/**
 * Generate a valid UUID v4.
 */
export function generateUUID(): string {
  const { v4 } = require("uuid");
  return v4();
}