/**
 * Faucet Controller Tests
 *
 * Tests testnet USDC claiming, rate limiting, daily caps, and claim tracking.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";

interface FaucetClaim {
  id: string;
  agent_id: string;
  amount: number;
  currency: string;
  claimed_at: string;
  ip_address?: string;
}

class FaucetController {
  private claims: FaucetClaim[] = [];
  private agentBalances: Map<string, number> = new Map();
  private dailyLimitPerAgent = 100;
  private globalDailyLimit = 10000;
  private claimAmount = 10;

  constructor() {}

  claim(agentId: string, ipAddress?: string): FaucetClaim | { error: string } {
    // Rate limit: per-agent daily cap
    const today = new Date().toISOString().slice(0, 10);
    const todayClaims = this.claims.filter(
      (c) => c.agent_id === agentId && c.claimed_at.startsWith(today)
    );
    const todayTotal = todayClaims.reduce((sum, c) => sum + c.amount, 0);

    if (todayTotal + this.claimAmount > this.dailyLimitPerAgent) {
      return { error: "Daily claim limit reached for this agent" };
    }

    // Global daily cap
    const globalTodayTotal = this.claims
      .filter((c) => c.claimed_at.startsWith(today))
      .reduce((sum, c) => sum + c.amount, 0);

    if (globalTodayTotal + this.claimAmount > this.globalDailyLimit) {
      return { error: "Global faucet daily limit reached" };
    }

    // Credit the agent
    const currentBalance = this.agentBalances.get(agentId) ?? 0;
    this.agentBalances.set(agentId, currentBalance + this.claimAmount);

    const claim: FaucetClaim = {
      id: uuidv4(),
      agent_id: agentId,
      amount: this.claimAmount,
      currency: "USDC",
      claimed_at: new Date().toISOString(),
      ip_address: ipAddress,
    };

    this.claims.push(claim);
    return claim;
  }

  getBalance(agentId: string): number {
    return this.agentBalances.get(agentId) ?? 0;
  }

  getClaimsForAgent(agentId: string): FaucetClaim[] {
    return this.claims.filter((c) => c.agent_id === agentId);
  }

  getClaimsToday(): FaucetClaim[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.claims.filter((c) => c.claimed_at.startsWith(today));
  }

  getTotalClaimedToday(): number {
    return this.getClaimsToday().reduce((sum, c) => sum + c.amount, 0);
  }
}

describe("Faucet Controller", () => {
  let controller: FaucetController;
  let agentId: string;

  beforeEach(() => {
    controller = new FaucetController();
    agentId = uuidv4();
  });

  describe("Faucet Claims", () => {
    it("claims testnet USDC", () => {
      const result = controller.claim(agentId);
      expect(result).toHaveProperty("id");
      if ("id" in result) {
        expect(result.amount).toBe(10);
        expect(result.currency).toBe("USDC");
        expect(result.agent_id).toBe(agentId);
      }
    });

    it("increments agent balance on claim", () => {
      controller.claim(agentId);
      expect(controller.getBalance(agentId)).toBe(10);
      controller.claim(agentId);
      expect(controller.getBalance(agentId)).toBe(20);
    });

    it("tracks claims per agent", () => {
      controller.claim(agentId);
      controller.claim(agentId);
      const claims = controller.getClaimsForAgent(agentId);
      expect(claims.length).toBe(2);
    });

    it("enforces per-agent daily limit", () => {
      for (let i = 0; i < 10; i++) {
        const result = controller.claim(agentId);
        if ("error" in result) break;
      }
      const result = controller.claim(agentId);
      expect(result).toHaveProperty("error");
      if ("error" in result) {
        expect(result.error).toContain("limit reached");
      }
    });

    it("tracks global daily total", () => {
      const agent2 = uuidv4();
      controller.claim(agentId);
      controller.claim(agent2);
      expect(controller.getTotalClaimedToday()).toBe(20);
    });
  });

  describe("Edge Cases", () => {
    it("different agents have independent balances", () => {
      const agent2 = uuidv4();
      controller.claim(agentId);
      controller.claim(agent2);
      controller.claim(agent2);
      expect(controller.getBalance(agentId)).toBe(10);
      expect(controller.getBalance(agent2)).toBe(20);
    });

    it("new agents start with zero balance", () => {
      expect(controller.getBalance("unknown")).toBe(0);
    });
  });
});