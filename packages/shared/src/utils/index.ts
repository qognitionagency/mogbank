// MogBank Shared Utilities
// Helper functions shared across the MogBank ecosystem

/** Sleep/delay utility */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Format USDC amount with 6 decimals */
export function formatUsdc(amount: number, decimals = 6): string {
  return (amount / 10 ** decimals).toFixed(2);
}

/** Parse USDC amount to smallest unit */
export function parseUsdc(amount: string, decimals = 6): bigint {
  const [int, frac = ''] = amount.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(int + padded);
}

/** Generate a random nonce */
export function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Validate an Ethereum address */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Truncate hex string for display */
export function truncateHex(hex: string, prefix = 6, suffix = 4): string {
  if (hex.length <= prefix + suffix + 3) return hex;
  return `${hex.slice(0, prefix)}...${hex.slice(-suffix)}`;
}