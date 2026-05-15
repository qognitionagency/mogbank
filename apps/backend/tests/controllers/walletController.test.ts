/**
 * Wallet Controller Tests
 *
 * Tests wallet creation, retrieval, balance checks, and wallet management.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";

interface Wallet {
  id: string;
  agent_id: string;
  address: string;
  balance: number;
  currency: string;
  status: "active" | "frozen" | "closed";
  created_at: string;
  updated_at: string;
}

class WalletController {
  private wallets: Map<string, Wallet> = new Map();

  createWallet(agentId: string, address?: string): Wallet {
    const id = uuidv4();
    const wallet: Wallet = {
      id,
      agent_id: agentId,
      address: address ?? `0x${uuidv4().replace(/-/g, "").slice(0, 40)}`,
      balance: 0,
      currency: "USDC",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.wallets.set(id, wallet);
    return wallet;
  }

  getWallet(id: string): Wallet | undefined {
    return this.wallets.get(id);
  }

  getWalletsByAgent(agentId: string): Wallet[] {
    return Array.from(this.wallets.values()).filter((w) => w.agent_id === agentId);
  }

  getBalance(id: string): number | { error: string } {
    const wallet = this.wallets.get(id);
    if (!wallet) return { error: "Wallet not found" };
    return wallet.balance;
  }

  updateBalance(id: string, amount: number): Wallet | { error: string } {
    const wallet = this.wallets.get(id);
    if (!wallet) return { error: "Wallet not found" };
    if (wallet.status !== "active") return { error: "Wallet is not active" };
    if (wallet.balance + amount < 0) return { error: "Insufficient balance" };
    wallet.balance += amount;
    wallet.updated_at = new Date().toISOString();
    return wallet;
  }

  freezeWallet(id: string): Wallet | { error: string } {
    const wallet = this.wallets.get(id);
    if (!wallet) return { error: "Wallet not found" };
    wallet.status = "frozen";
    wallet.updated_at = new Date().toISOString();
    return wallet;
  }

  unfreezeWallet(id: string): Wallet | { error: string } {
    const wallet = this.wallets.get(id);
    if (!wallet) return { error: "Wallet not found" };
    if (wallet.status !== "frozen") return { error: "Wallet is not frozen" };
    wallet.status = "active";
    wallet.updated_at = new Date().toISOString();
    return wallet;
  }

  closeWallet(id: string): Wallet | { error: string } {
    const wallet = this.wallets.get(id);
    if (!wallet) return { error: "Wallet not found" };
    if (wallet.balance > 0) return { error: "Cannot close wallet with positive balance" };
    wallet.status = "closed";
    wallet.updated_at = new Date().toISOString();
    return wallet;
  }

  listWallets(limit: number = 50, offset: number = 0): Wallet[] {
    return Array.from(this.wallets.values()).slice(offset, offset + limit);
  }
}

describe("Wallet Controller", () => {
  let controller: WalletController;
  let agentId: string;

  beforeEach(() => {
    controller = new WalletController();
    agentId = uuidv4();
  });

  describe("Wallet Creation", () => {
    it("creates a wallet for an agent", () => {
      const wallet = controller.createWallet(agentId);
      expect(wallet.id).toBeDefined();
      expect(wallet.agent_id).toBe(agentId);
      expect(wallet.balance).toBe(0);
      expect(wallet.currency).toBe("USDC");
      expect(wallet.status).toBe("active");
    });

    it("generates unique addresses", () => {
      const w1 = controller.createWallet(agentId);
      const w2 = controller.createWallet(agentId);
      expect(w1.address).not.toBe(w2.address);
      expect(w1.id).not.toBe(w2.id);
    });

    it("accepts a custom address", () => {
      const addr = "0x1234567890abcdef1234567890abcdef12345678";
      const wallet = controller.createWallet(agentId, addr);
      expect(wallet.address).toBe(addr);
    });
  });

  describe("Wallet Retrieval", () => {
    it("retrieves wallet by ID", () => {
      const wallet = controller.createWallet(agentId);
      const found = controller.getWallet(wallet.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(wallet.id);
    });

    it("returns undefined for unknown wallet", () => {
      expect(controller.getWallet("no-such-wallet")).toBeUndefined();
    });

    it("retrieves all wallets for an agent", () => {
      controller.createWallet(agentId);
      controller.createWallet(agentId);
      const otherAgent = uuidv4();
      controller.createWallet(otherAgent);

      const agentWallets = controller.getWalletsByAgent(agentId);
      expect(agentWallets.length).toBe(2);
    });
  });

  describe("Balance Management", () => {
    it("gets zero balance for new wallet", () => {
      const wallet = controller.createWallet(agentId);
      const balance = controller.getBalance(wallet.id);
      expect(balance).toBe(0);
    });

    it("updates balance correctly", () => {
      const wallet = controller.createWallet(agentId);
      const result = controller.updateBalance(wallet.id, 100);
      if ("balance" in result) {
        expect(result.balance).toBe(100);
      }
    });

    it("deducts balance correctly", () => {
      const wallet = controller.createWallet(agentId);
      controller.updateBalance(wallet.id, 100);
      const result = controller.updateBalance(wallet.id, -30);
      if ("balance" in result) {
        expect(result.balance).toBe(70);
      }
    });

    it("rejects overdraft", () => {
      const wallet = controller.createWallet(agentId);
      const result = controller.updateBalance(wallet.id, -50);
      expect(result).toHaveProperty("error");
    });

    it("returns error for balance check on unknown wallet", () => {
      const result = controller.getBalance("unknown");
      expect(result).toHaveProperty("error");
    });
  });

  describe("Wallet Status Management", () => {
    it("freezes an active wallet", () => {
      const wallet = controller.createWallet(agentId);
      const result = controller.freezeWallet(wallet.id);
      if ("status" in result) expect(result.status).toBe("frozen");
    });

    it("unfreezes a frozen wallet", () => {
      const wallet = controller.createWallet(agentId);
      controller.freezeWallet(wallet.id);
      const result = controller.unfreezeWallet(wallet.id);
      if ("status" in result) expect(result.status).toBe("active");
    });

    it("rejects unfreeze on active wallet", () => {
      const wallet = controller.createWallet(agentId);
      const result = controller.unfreezeWallet(wallet.id);
      expect(result).toHaveProperty("error");
    });

    it("prevents transfers from frozen wallet", () => {
      const wallet = controller.createWallet(agentId);
      controller.updateBalance(wallet.id, 100);
      controller.freezeWallet(wallet.id);
      const result = controller.updateBalance(wallet.id, -50);
      expect(result).toHaveProperty("error");
    });

    it("closes wallet with zero balance", () => {
      const wallet = controller.createWallet(agentId);
      const result = controller.closeWallet(wallet.id);
      if ("status" in result) expect(result.status).toBe("closed");
    });

    it("rejects closing wallet with positive balance", () => {
      const wallet = controller.createWallet(agentId);
      controller.updateBalance(wallet.id, 50);
      const result = controller.closeWallet(wallet.id);
      expect(result).toHaveProperty("error");
    });
  });

  describe("Listing", () => {
    it("lists wallets with pagination", () => {
      for (let i = 0; i < 5; i++) controller.createWallet(agentId);
      expect(controller.listWallets().length).toBe(5);
      expect(controller.listWallets(2, 1).length).toBe(2);
    });
  });
});