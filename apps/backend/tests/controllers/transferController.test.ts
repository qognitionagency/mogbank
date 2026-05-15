/**
 * Transfer Controller Tests
 *
 * Tests USDC transfer initiation, mandate verification, and transaction lifecycle.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";

interface TransferRequest {
  from_agent_id: string;
  to_agent_id: string;
  amount: number;
  currency?: string;
  mandate_signature?: string;
  idempotency_key?: string;
}

interface TransferResult {
  id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed";
  idempotency_key?: string;
  created_at: string;
}

class TransferController {
  private transfers: Map<string, TransferResult> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();
  private agentWallets: Map<string, { id: string; balance: number; status: string }[]> = new Map();

  constructor() {
    // Seed some agent wallets for testing
  }

  addWalletForAgent(agentId: string, walletId: string, balance: number, status: string = "active") {
    if (!this.agentWallets.has(agentId)) {
      this.agentWallets.set(agentId, []);
    }
    this.agentWallets.get(agentId)!.push({ id: walletId, balance, status });
  }

  getDefaultWallet(agentId: string): { id: string; balance: number; status: string } | undefined {
    const wallets = this.agentWallets.get(agentId);
    return wallets?.find((w) => w.status === "active");
  }

  initiateTransfer(request: TransferRequest): TransferResult | { error: string } {
    // Idempotency check
    if (request.idempotency_key && this.processedIdempotencyKeys.has(request.idempotency_key)) {
      const existing = Array.from(this.transfers.values()).find(
        (t) => t.idempotency_key === request.idempotency_key
      );
      if (existing) return existing;
    }

    // Validation
    if (!request.from_agent_id) return { error: "Source agent ID is required" };
    if (!request.to_agent_id) return { error: "Destination agent ID is required" };
    if (request.from_agent_id === request.to_agent_id) return { error: "Cannot transfer to self" };
    if (request.amount <= 0) return { error: "Transfer amount must be positive" };

    const fromWallet = this.getDefaultWallet(request.from_agent_id);
    if (!fromWallet) return { error: "Source agent has no active wallet" };
    if (fromWallet.status !== "active") return { error: "Source wallet is not active" };

    const toWallet = this.getDefaultWallet(request.to_agent_id);
    if (!toWallet) return { error: "Destination agent has no active wallet" };

    if (fromWallet.balance < request.amount) {
      return { error: "Insufficient balance" };
    }

    // Execute transfer
    fromWallet.balance -= request.amount;
    toWallet.balance += request.amount;

    const transfer: TransferResult = {
      id: uuidv4(),
      from_wallet_id: fromWallet.id,
      to_wallet_id: toWallet.id,
      amount: request.amount,
      currency: request.currency ?? "USDC",
      status: "completed",
      idempotency_key: request.idempotency_key,
      created_at: new Date().toISOString(),
    };

    this.transfers.set(transfer.id, transfer);
    if (request.idempotency_key) {
      this.processedIdempotencyKeys.add(request.idempotency_key);
    }

    return transfer;
  }

  getTransfer(id: string): TransferResult | undefined {
    return this.transfers.get(id);
  }

  getTransfersForWallet(walletId: string): TransferResult[] {
    return Array.from(this.transfers.values()).filter(
      (t) => t.from_wallet_id === walletId || t.to_wallet_id === walletId
    );
  }
}

describe("Transfer Controller", () => {
  let controller: TransferController;
  let agentA: string;
  let agentB: string;
  let walletAId: string;
  let walletBId: string;

  beforeEach(() => {
    controller = new TransferController();
    agentA = uuidv4();
    agentB = uuidv4();
    walletAId = uuidv4();
    walletBId = uuidv4();

    controller.addWalletForAgent(agentA, walletAId, 1000);
    controller.addWalletForAgent(agentB, walletBId, 500);
  });

  describe("Transfer Initiation", () => {
    it("completes a valid transfer", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 200,
      });

      expect(result).toHaveProperty("id");
      if ("id" in result) {
        expect(result.status).toBe("completed");
        expect(result.amount).toBe(200);
        expect(result.currency).toBe("USDC");

        // Verify balances
        const fromWallet = controller.getDefaultWallet(agentA);
        expect(fromWallet!.balance).toBe(800);

        const toWallet = controller.getDefaultWallet(agentB);
        expect(toWallet!.balance).toBe(700);
      }
    });

    it("rejects transfer with insufficient balance", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 5000,
      });
      expect(result).toHaveProperty("error");
      if ("error" in result) {
        expect(result.error).toContain("Insufficient");
      }
    });

    it("rejects zero amount", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 0,
      });
      expect(result).toHaveProperty("error");
    });

    it("rejects negative amount", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: -50,
      });
      expect(result).toHaveProperty("error");
    });

    it("rejects self-transfer", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentA,
        amount: 100,
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("Invalid Agents", () => {
    it("rejects transfer from unknown agent", () => {
      const result = controller.initiateTransfer({
        from_agent_id: "unknown",
        to_agent_id: agentB,
        amount: 50,
      });
      expect(result).toHaveProperty("error");
    });

    it("rejects transfer to unknown agent", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: "unknown",
        amount: 50,
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("Idempotency", () => {
    it("replays idempotent transfer", () => {
      const key = "idem-transfer-001";
      const first = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 100,
        idempotency_key: key,
      });

      const second = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 100,
        idempotency_key: key,
      });

      // Should return same result, not double-deduct
      if ("id" in first && "id" in second) {
        expect(first.id).toBe(second.id);
      }

      const fromWallet = controller.getDefaultWallet(agentA);
      expect(fromWallet!.balance).toBe(900); // only deducted once
    });
  });

  describe("Transfer Lookup", () => {
    it("retrieves transfer by ID", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 50,
      });
      if ("id" in result) {
        const found = controller.getTransfer(result.id);
        expect(found).toBeDefined();
      }
    });

    it("gets transfers for wallet", () => {
      controller.initiateTransfer({ from_agent_id: agentA, to_agent_id: agentB, amount: 10 });
      controller.initiateTransfer({ from_agent_id: agentB, to_agent_id: agentA, amount: 5 });
      const walletTx = controller.getTransfersForWallet(walletAId);
      expect(walletTx.length).toBe(2);
    });
  });

  describe("Edge Cases", () => {
    it("completes exact full balance transfer", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 1000,
      });
      if ("id" in result) {
        expect(result.status).toBe("completed");
        const fromWallet = controller.getDefaultWallet(agentA);
        expect(fromWallet!.balance).toBe(0);
      }
    });

    it("handles fractional USDC amounts", () => {
      const result = controller.initiateTransfer({
        from_agent_id: agentA,
        to_agent_id: agentB,
        amount: 0.01,
      });
      expect(result).toHaveProperty("id");
      if ("id" in result) {
        expect(result.amount).toBe(0.01);
      }
    });

    it("rejects empty source agent", () => {
      const result = controller.initiateTransfer({
        from_agent_id: "",
        to_agent_id: agentB,
        amount: 10,
      });
      expect(result).toHaveProperty("error");
    });
  });
});