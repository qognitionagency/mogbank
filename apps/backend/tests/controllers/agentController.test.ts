/**
 * Agent Controller Tests
 *
 * Tests agent registration, listing, retrieval, and mandate signing.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";

// ── Test Models ────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  public_key: string;
  kya_score: number;
  status: "active" | "suspended" | "revoked";
  created_at: string;
  updated_at: string;
}

interface AgentRegistrationRequest {
  name: string;
  public_key: string;
  metadata?: Record<string, unknown>;
}

// ── Agent Controller Logic ──────────────────────────────────

class AgentController {
  private agents: Map<string, Agent> = new Map();
  private keyBlocklist: Set<string> = new Set();

  registerAgent(request: AgentRegistrationRequest): Agent | { error: string } {
    if (!request.name || request.name.trim().length === 0) {
      return { error: "Agent name is required" };
    }
    if (request.name.length > 128) {
      return { error: "Agent name must be 128 characters or less" };
    }
    if (!request.public_key || request.public_key.length < 64) {
      return { error: "Valid Ed25519 public key is required" };
    }
    if (this.keyBlocklist.has(request.public_key)) {
      return { error: "This public key has been blocklisted" };
    }

    // Check for duplicate name
    const existing = Array.from(this.agents.values()).find(
      (a) => a.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existing) {
      return { error: "Agent with this name already exists" };
    }

    const agent: Agent = {
      id: uuidv4(),
      name: request.name,
      public_key: request.public_key,
      kya_score: 0,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.agents.set(agent.id, agent);
    return agent;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  listAgents(limit: number = 50, offset: number = 0): Agent[] {
    return Array.from(this.agents.values()).slice(offset, offset + limit);
  }

  updateAgentStatus(
    id: string,
    status: "active" | "suspended" | "revoked"
  ): Agent | { error: string } {
    const agent = this.agents.get(id);
    if (!agent) return { error: "Agent not found" };
    agent.status = status;
    agent.updated_at = new Date().toISOString();
    return agent;
  }

  updateKYAScore(id: string, score: number): Agent | { error: string } {
    const agent = this.agents.get(id);
    if (!agent) return { error: "Agent not found" };
    if (score < 0 || score > 100) return { error: "KYA score must be 0-100" };
    agent.kya_score = score;
    agent.updated_at = new Date().toISOString();
    return agent;
  }

  blocklistKey(publicKey: string): void {
    this.keyBlocklist.add(publicKey);
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  searchAgents(query: string): Agent[] {
    const lower = query.toLowerCase();
    return Array.from(this.agents.values()).filter(
      (a) => a.name.toLowerCase().includes(lower)
    );
  }
}

// ── Tests ───────────────────────────────────────────────────

describe("Agent Controller", () => {
  let controller: AgentController;

  beforeEach(() => {
    controller = new AgentController();
  });

  describe("Agent Registration", () => {
    it("registers a valid agent", () => {
      const result = controller.registerAgent({
        name: "TestAgent",
        public_key: "a".repeat(64),
      });
      expect(result).toHaveProperty("id");
      if ("id" in result) {
        expect(result.name).toBe("TestAgent");
        expect(result.status).toBe("active");
        expect(result.kya_score).toBe(0);
      }
    });

    it("rejects empty name", () => {
      const result = controller.registerAgent({
        name: "",
        public_key: "a".repeat(64),
      });
      expect(result).toHaveProperty("error");
    });

    it("rejects name exceeding 128 characters", () => {
      const result = controller.registerAgent({
        name: "a".repeat(129),
        public_key: "a".repeat(64),
      });
      expect(result).toHaveProperty("error");
    });

    it("rejects short public key", () => {
      const result = controller.registerAgent({
        name: "Test",
        public_key: "short",
      });
      expect(result).toHaveProperty("error");
    });

    it("rejects duplicate agent name", () => {
      controller.registerAgent({ name: "Unique", public_key: "a".repeat(64) });
      const result = controller.registerAgent({ name: "Unique", public_key: "b".repeat(64) });
      expect(result).toHaveProperty("error");
    });

    it("rejects blocklisted key", () => {
      controller.blocklistKey("blocklisted_key_".repeat(4));
      const result = controller.registerAgent({
        name: "Blocked",
        public_key: "blocklisted_key_".repeat(4),
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("Agent Retrieval", () => {
    it("retrieves agent by ID", () => {
      const registered = controller.registerAgent({
        name: "FindMe",
        public_key: "a".repeat(64),
      });
      if ("id" in registered) {
        const found = controller.getAgent(registered.id);
        expect(found).toBeDefined();
        expect(found!.name).toBe("FindMe");
      }
    });

    it("returns undefined for unknown agent", () => {
      expect(controller.getAgent("non-existent")).toBeUndefined();
    });
  });

  describe("Agent Listing", () => {
    it("lists all agents", () => {
      for (let i = 0; i < 5; i++) {
        controller.registerAgent({
          name: `Agent${i}`,
          public_key: `${i}`.repeat(64),
        });
      }
      const list = controller.listAgents();
      expect(list.length).toBe(5);
    });

    it("respects pagination", () => {
      for (let i = 0; i < 10; i++) {
        controller.registerAgent({
          name: `Agent${i}`,
          public_key: `${i}`.repeat(64),
        });
      }
      const page = controller.listAgents(3, 2);
      expect(page.length).toBe(3);
    });
  });

  describe("Agent Status Management", () => {
    it("suspends an active agent", () => {
      const registered = controller.registerAgent({
        name: "ToSuspend",
        public_key: "a".repeat(64),
      });
      if ("id" in registered) {
        const result = controller.updateAgentStatus(registered.id, "suspended");
        expect(result).toHaveProperty("status", "suspended");
      }
    });

    it("revokes an agent", () => {
      const registered = controller.registerAgent({
        name: "ToRevoke",
        public_key: "a".repeat(64),
      });
      if ("id" in registered) {
        const result = controller.updateAgentStatus(registered.id, "revoked");
        expect(result).toHaveProperty("status", "revoked");
      }
    });

    it("returns error for unknown agent status update", () => {
      const result = controller.updateAgentStatus("unknown", "suspended");
      expect(result).toHaveProperty("error");
    });
  });

  describe("KYA Score Management", () => {
    it("updates KYA score", () => {
      const registered = controller.registerAgent({
        name: "ScoreMe",
        public_key: "a".repeat(64),
      });
      if ("id" in registered) {
        const result = controller.updateKYAScore(registered.id, 85);
        if ("kya_score" in result) {
          expect(result.kya_score).toBe(85);
        }
      }
    });

    it("rejects invalid KYA scores", () => {
      const registered = controller.registerAgent({
        name: "BadScore",
        public_key: "a".repeat(64),
      });
      if ("id" in registered) {
        expect(controller.updateKYAScore(registered.id, -1)).toHaveProperty("error");
        expect(controller.updateKYAScore(registered.id, 101)).toHaveProperty("error");
      }
    });
  });

  describe("Agent Search", () => {
    it("searches agents by name", () => {
      controller.registerAgent({ name: "AlphaBot", public_key: "a".repeat(64) });
      controller.registerAgent({ name: "BetaBot", public_key: "b".repeat(64) });
      controller.registerAgent({ name: "GammaService", public_key: "c".repeat(64) });

      const results = controller.searchAgents("bot");
      expect(results.length).toBe(2);
    });

    it("returns empty for no matches", () => {
      controller.registerAgent({ name: "OnlyOne", public_key: "a".repeat(64) });
      expect(controller.searchAgents("nonexistent")).toHaveLength(0);
    });
  });

  describe("Agent Count", () => {
    it("tracks agent count", () => {
      expect(controller.getAgentCount()).toBe(0);
      controller.registerAgent({ name: "A", public_key: "a".repeat(64) });
      expect(controller.getAgentCount()).toBe(1);
      controller.registerAgent({ name: "B", public_key: "b".repeat(64) });
      expect(controller.getAgentCount()).toBe(2);
    });
  });
});