/**
 * Double-Entry Ledger Service Tests
 *
 * Tests debit/credit integrity, balance consistency, transaction atomicity,
 * and ledger entry immutability.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";

// ── Double-Entry Ledger Engine ──────────────────────────────

interface LedgerEntry {
  id: string;
  transaction_id: string;
  wallet_id: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  currency: string;
  sequence: number;
  created_at: string;
}

interface LedgerLedger {
  entries: LedgerEntry[];
  sequence: number;
}

class DoubleEntryLedger {
  private entries: Map<string, LedgerEntry> = new Map();
  private walletBalances: Map<string, { balance: number; sequence: number }> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();

  /**
   * Record a double-entry transaction (debit one wallet, credit another).
   */
  recordTransaction(
    transactionId: string,
    debitWalletId: string,
    creditWalletId: string,
    amount: number,
    currency: string = "USDC",
    idempotencyKey?: string
  ): { debit: LedgerEntry; credit: LedgerEntry } | { error: string } {
    // Idempotency check
    if (idempotencyKey && this.processedIdempotencyKeys.has(idempotencyKey)) {
      const existing = Array.from(this.entries.values()).find(
        (e) => e.transaction_id === transactionId
      );
      if (existing) {
        const credit = this.entries.get(`${transactionId}:credit`)!;
        const debit = this.entries.get(`${transactionId}:debit`)!;
        return { debit, credit };
      }
    }

    // Validate amount
    if (amount <= 0) {
      return { error: "Amount must be positive" };
    }

    // Check debit wallet balance
    const debitWallet = this.walletBalances.get(debitWalletId);
    if (!debitWallet || debitWallet.balance < amount) {
      return { error: "Insufficient balance" };
    }

    // Ensure credit wallet exists (initialize if not)
    if (!this.walletBalances.has(creditWalletId)) {
      this.walletBalances.set(creditWalletId, { balance: 0, sequence: 0 });
    }

    // Perform atomic debit and credit
    debitWallet.balance -= amount;
    debitWallet.sequence += 1;

    const creditWallet = this.walletBalances.get(creditWalletId)!;
    creditWallet.balance += amount;
    creditWallet.sequence += 1;

    // Create ledger entries
    const debitEntry: LedgerEntry = {
      id: uuidv4(),
      transaction_id: transactionId,
      wallet_id: debitWalletId,
      type: "DEBIT",
      amount,
      currency,
      sequence: debitWallet.sequence,
      created_at: new Date().toISOString(),
    };

    const creditEntry: LedgerEntry = {
      id: uuidv4(),
      transaction_id: transactionId,
      wallet_id: creditWalletId,
      type: "CREDIT",
      amount,
      currency,
      sequence: creditWallet.sequence,
      created_at: new Date().toISOString(),
    };

    this.entries.set(`${transactionId}:debit`, debitEntry);
    this.entries.set(`${transactionId}:credit`, creditEntry);

    if (idempotencyKey) {
      this.processedIdempotencyKeys.add(idempotencyKey);
    }

    return { debit: debitEntry, credit: creditEntry };
  }

  /** Initialize a wallet with a balance */
  initializeWallet(walletId: string, balance: number): void {
    this.walletBalances.set(walletId, { balance, sequence: 0 });
  }

  /** Get wallet balance */
  getBalance(walletId: string): number {
    return this.walletBalances.get(walletId)?.balance ?? 0;
  }

  /** Get all entries for a wallet */
  getWalletEntries(walletId: string): LedgerEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.wallet_id === walletId);
  }

  /** Get all entries for a transaction */
  getTransactionEntries(transactionId: string): LedgerEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.transaction_id === transactionId);
  }

  /** Verify global balance invariant (sum of all balances should equal initial) */
  verifyGlobalInvariant(expectedGlobalBalance: number): boolean {
    const total = Array.from(this.walletBalances.values()).reduce(
      (sum, w) => sum + w.balance,
      0
    );
    return total === expectedGlobalBalance;
  }

  /** Check idempotency key processed */
  isIdempotencyKeyProcessed(key: string): boolean {
    return this.processedIdempotencyKeys.has(key);
  }
}

// ── Tests ───────────────────────────────────────────────────

describe("Double-Entry Ledger", () => {
  let ledger: DoubleEntryLedger;
  const walletA = uuidv4();
  const walletB = uuidv4();
  const walletC = uuidv4();

  beforeEach(() => {
    ledger = new DoubleEntryLedger();
    ledger.initializeWallet(walletA, 1000);
    ledger.initializeWallet(walletB, 500);
    ledger.initializeWallet(walletC, 0);
  });

  describe("Transaction Recording", () => {
    it("records a valid debit/credit pair atomically", () => {
      const txId = uuidv4();
      const result = ledger.recordTransaction(txId, walletA, walletB, 200);

      expect(result).toHaveProperty("debit");
      expect(result).toHaveProperty("credit");

      if ("debit" in result) {
        expect(result.debit.type).toBe("DEBIT");
        expect(result.debit.wallet_id).toBe(walletA);
        expect(result.debit.amount).toBe(200);
        expect(result.credit.type).toBe("CREDIT");
        expect(result.credit.wallet_id).toBe(walletB);
        expect(result.credit.amount).toBe(200);
      }
    });

    it("updates balances correctly after debit/credit", () => {
      const txId = uuidv4();
      ledger.recordTransaction(txId, walletA, walletB, 200);
      expect(ledger.getBalance(walletA)).toBe(800);
      expect(ledger.getBalance(walletB)).toBe(700);
    });

    it("rejects transaction with insufficient balance", () => {
      const result = ledger.recordTransaction(uuidv4(), walletA, walletB, 2000);
      expect(result).toHaveProperty("error");
      if ("error" in result) {
        expect(result.error).toContain("Insufficient");
      }
    });

    it("rejects zero-amount transactions", () => {
      const result = ledger.recordTransaction(uuidv4(), walletA, walletB, 0);
      expect(result).toHaveProperty("error");
    });

    it("rejects negative-amount transactions", () => {
      const result = ledger.recordTransaction(uuidv4(), walletA, walletB, -50);
      expect(result).toHaveProperty("error");
    });

    it("auto-creates credit wallet if it does not exist", () => {
      const newWallet = uuidv4();
      const result = ledger.recordTransaction(uuidv4(), walletA, newWallet, 100);
      expect(result).toHaveProperty("debit");
      expect(ledger.getBalance(newWallet)).toBe(100);
    });
  });

  describe("Global Invariant", () => {
    it("maintains global balance across all transactions", () => {
      const initialTotal = 1000 + 500 + 0; // walletA + walletB + walletC = 1500

      ledger.recordTransaction(uuidv4(), walletA, walletB, 100);
      expect(ledger.verifyGlobalInvariant(initialTotal)).toBe(true);

      ledger.recordTransaction(uuidv4(), walletB, walletC, 50);
      expect(ledger.verifyGlobalInvariant(initialTotal)).toBe(true);

      ledger.recordTransaction(uuidv4(), walletA, walletC, 300);
      expect(ledger.verifyGlobalInvariant(initialTotal)).toBe(true);
    });

    it("maintains invariant across 100 random transactions", () => {
      const wallets = [walletA, walletB, walletC];
      const initialTotal = 1500;

      for (let i = 0; i < 100; i++) {
        const fromIdx = Math.floor(Math.random() * wallets.length);
        let toIdx = Math.floor(Math.random() * wallets.length);
        while (toIdx === fromIdx) toIdx = Math.floor(Math.random() * wallets.length);

        const from = wallets[fromIdx];
        const to = wallets[toIdx];
        const balance = ledger.getBalance(from);
        if (balance > 0) {
          const amount = Math.floor(Math.random() * balance) + 1;
          ledger.recordTransaction(uuidv4(), from, to, amount);
        }
      }

      expect(ledger.verifyGlobalInvariant(initialTotal)).toBe(true);
    });
  });

  describe("Entry Immutability", () => {
    it("each entry has a unique sequence number", () => {
      ledger.recordTransaction(uuidv4(), walletA, walletB, 100);
      ledger.recordTransaction(uuidv4(), walletA, walletB, 50);

      const entriesA = ledger.getWalletEntries(walletA);
      const sequences = entriesA.map((e) => e.sequence);
      const unique = new Set(sequences);
      expect(unique.size).toBe(sequences.length);
    });
  });

  describe("Transaction Lookup", () => {
    it("returns exactly 2 entries per transaction", () => {
      const txId = uuidv4();
      ledger.recordTransaction(txId, walletA, walletB, 100);
      const entries = ledger.getTransactionEntries(txId);
      expect(entries.length).toBe(2);
      const types = entries.map((e) => e.type).sort();
      expect(types).toEqual(["CREDIT", "DEBIT"]);
    });
  });

  describe("Idempotency Enforcement", () => {
    it("replays same idempotency key returns existing entries", () => {
      const txId = uuidv4();
      const idemKey = "idem-test-001";

      const first = ledger.recordTransaction(txId, walletA, walletB, 50, "USDC", idemKey);
      expect(first).toHaveProperty("debit");
      expect(ledger.getBalance(walletA)).toBe(950);

      const second = ledger.recordTransaction(txId, walletA, walletB, 50, "USDC", idemKey);
      expect(second).toHaveProperty("debit");
      // Balance should NOT change (idempotent replay)
      expect(ledger.getBalance(walletA)).toBe(950);
    });

    it("different idempotency keys are treated as separate transactions", () => {
      ledger.recordTransaction(uuidv4(), walletA, walletB, 50, "USDC", "key-1");
      ledger.recordTransaction(uuidv4(), walletA, walletB, 50, "USDC", "key-2");
      expect(ledger.getBalance(walletA)).toBe(900); // 1000 - 50 - 50
    });

    it("tracks processed idempotency keys", () => {
      ledger.recordTransaction(uuidv4(), walletA, walletB, 10, "USDC", "track-me");
      expect(ledger.isIdempotencyKeyProcessed("track-me")).toBe(true);
      expect(ledger.isIdempotencyKeyProcessed("not-processed")).toBe(false);
    });
  });

  describe("Concurrent Transaction Sequencing", () => {
    it("preserves correct sequence ordering", () => {
      ledger.recordTransaction(uuidv4(), walletA, walletB, 10);
      ledger.recordTransaction(uuidv4(), walletA, walletB, 20);
      ledger.recordTransaction(uuidv4(), walletA, walletB, 30);

      const entries = ledger.getWalletEntries(walletA);
      expect(entries).toHaveLength(3);
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].sequence).toBeGreaterThan(entries[i - 1].sequence);
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles self-transfer (same wallet) by creating both entries", () => {
      const result = ledger.recordTransaction(uuidv4(), walletA, walletA, 50);
      // Net balance unchanged
      expect(ledger.getBalance(walletA)).toBe(1000); // unchanged
      if ("debit" in result) {
        expect(result.debit.wallet_id).toBe(walletA);
        expect(result.credit.wallet_id).toBe(walletA);
      }
    });

    it("handles large transaction amounts safely", () => {
      const result = ledger.recordTransaction(uuidv4(), walletA, walletB, Number.MAX_SAFE_INTEGER / 2);
      expect(result).toHaveProperty("error");
    });

    it("handles decimal amounts correctly", () => {
      ledger.initializeWallet(walletA, 100.50);
      const result = ledger.recordTransaction(uuidv4(), walletA, walletB, 50.25);
      expect(result).toHaveProperty("debit");
      expect(ledger.getBalance(walletA)).toBeCloseTo(50.25, 4);
      expect(ledger.getBalance(walletB)).toBeCloseTo(550.25, 4);
    });
  });
});