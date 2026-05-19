// MogBank Shared Constants
// Configuration values shared across the MogBank ecosystem

/** Base L2 chain ID */
export const BASE_CHAIN_ID = 8453;

/** USDC contract address on Base */
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/** Default KYA-7 scoring dimensions */
export const KYA_DIMENSIONS = [
  'identity_verification',
  'transaction_history',
  'delegate_reliability',
  'protocol_compliance',
  'liquidity_depth',
  'response_time',
  'dispute_resolution',
] as const;

/** Minimum KYA score threshold for agents */
export const MIN_KYA_THRESHOLD = 30;

/** x402 protocol fee percentage */
export const X402_PROTOCOL_FEE = 0.25;

/** Transfer fee percentage */
export const TRANSFER_FEE_PERCENT = 0.1;

/** ABOS protocol version */
export const ABOS_VERSION = '1.0.0';