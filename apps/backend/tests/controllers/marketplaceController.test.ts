/**
 * Marketplace Controller Tests
 *
 * Tests service listing, escrow creation, release, and dispute flows.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";

interface Service {
  id: string;
  provider_agent_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  status: "active" | "inactive";
  created_at: string;
}

interface Escrow {
  id: string;
  service_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  amount: number;
  status: "held" | "released" | "disputed" | "refunded";
  created_at: string;
  resolved_at?: string;
}

class MarketplaceController {
  private services: Map<string, Service> = new Map();
  private escrows: Map<string, Escrow> = new Map();
  private agentBalances: Map<string, number> = new Map();

  addBalance(agentId: string, amount: number) {
    this.agentBalances.set(agentId, (this.agentBalances.get(agentId) ?? 0) + amount);
  }

  getBalance(agentId: string): number {
    return this.agentBalances.get(agentId) ?? 0;
  }

  listService(providerId: string, name: string, price: number, description: string = ""): Service {
    const service: Service = {
      id: uuidv4(),
      provider_agent_id: providerId,
      name,
      description,
      price,
      currency: "USDC",
      status: "active",
      created_at: new Date().toISOString(),
    };
    this.services.set(service.id, service);
    return service;
  }

  getService(id: string): Service | undefined {
    return this.services.get(id);
  }

  listServices(): Service[] {
    return Array.from(this.services.values()).filter((s) => s.status === "active");
  }

  deactivateService(id: string): Service | { error: string } {
    const service = this.services.get(id);
    if (!service) return { error: "Service not found" };
    service.status = "inactive";
    return service;
  }

  createEscrow(
    serviceId: string,
    buyerId: string,
    sellerId: string,
    amount: number
  ): Escrow | { error: string } {
    const service = this.services.get(serviceId);
    if (!service) return { error: "Service not found" };
    if (service.status !== "active") return { error: "Service is not active" };
    if (buyerId === sellerId) return { error: "Cannot create escrow with self" };

    const buyerBalance = this.agentBalances.get(buyerId) ?? 0;
    if (buyerBalance < amount) return { error: "Insufficient buyer balance" };

    // Lock funds
    this.agentBalances.set(buyerId, buyerBalance - amount);

    const escrow: Escrow = {
      id: uuidv4(),
      service_id: serviceId,
      buyer_agent_id: buyerId,
      seller_agent_id: sellerId,
      amount,
      status: "held",
      created_at: new Date().toISOString(),
    };
    this.escrows.set(escrow.id, escrow);
    return escrow;
  }

  releaseEscrow(escrowId: string): Escrow | { error: string } {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) return { error: "Escrow not found" };
    if (escrow.status !== "held") return { error: "Escrow is not in held status" };

    escrow.status = "released";
    escrow.resolved_at = new Date().toISOString();
    this.agentBalances.set(
      escrow.seller_agent_id,
      (this.agentBalances.get(escrow.seller_agent_id) ?? 0) + escrow.amount
    );
    return escrow;
  }

  refundEscrow(escrowId: string): Escrow | { error: string } {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) return { error: "Escrow not found" };
    if (escrow.status !== "held" && escrow.status !== "disputed") return { error: "Escrow cannot be refunded" };

    escrow.status = "refunded";
    escrow.resolved_at = new Date().toISOString();
    this.agentBalances.set(
      escrow.buyer_agent_id,
      (this.agentBalances.get(escrow.buyer_agent_id) ?? 0) + escrow.amount
    );
    return escrow;
  }

  disputeEscrow(escrowId: string): Escrow | { error: string } {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) return { error: "Escrow not found" };
    if (escrow.status !== "held") return { error: "Only held escrows can be disputed" };
    escrow.status = "disputed";
    return escrow;
  }

  getEscrow(id: string): Escrow | undefined {
    return this.escrows.get(id);
  }
}

describe("Marketplace Controller", () => {
  let controller: MarketplaceController;
  let providerId: string;
  let buyerId: string;

  beforeEach(() => {
    controller = new MarketplaceController();
    providerId = uuidv4();
    buyerId = uuidv4();
    controller.addBalance(buyerId, 1000);
  });

  describe("Service Listings", () => {
    it("lists an active service", () => {
      const svc = controller.listService(providerId, "AI Text Generation", 50);
      expect(svc.id).toBeDefined();
      expect(svc.provider_agent_id).toBe(providerId);
      expect(svc.price).toBe(50);
      expect(svc.status).toBe("active");
    });

    it("retrieves a service by ID", () => {
      const svc = controller.listService(providerId, "Image OCR", 25);
      const found = controller.getService(svc.id);
      expect(found?.name).toBe("Image OCR");
    });

    it("lists only active services", () => {
      controller.listService(providerId, "Active Service", 10);
      const inactive = controller.listService(providerId, "Old Service", 5);
      controller.deactivateService(inactive.id);
      expect(controller.listServices().length).toBe(1);
    });

    it("deactivates a service", () => {
      const svc = controller.listService(providerId, "Temp", 1);
      const result = controller.deactivateService(svc.id);
      if ("status" in result) expect(result.status).toBe("inactive");
    });
  });

  describe("Escrow Creation", () => {
    it("creates escrow for a service", () => {
      const svc = controller.listService(providerId, "PDF Parsing", 100);
      const escrow = controller.createEscrow(svc.id, buyerId, providerId, 100);
      expect(escrow).toHaveProperty("id");
      if ("id" in escrow) {
        expect(escrow.status).toBe("held");
        expect(escrow.amount).toBe(100);
        // Buyer balance locked
        expect(controller.getBalance(buyerId)).toBe(900);
      }
    });

    it("rejects escrow with insufficient balance", () => {
      const svc = controller.listService(providerId, "Expensive API", 5000);
      const result = controller.createEscrow(svc.id, buyerId, providerId, 5000);
      expect(result).toHaveProperty("error");
    });

    it("rejects self-escrow", () => {
      const svc = controller.listService(providerId, "Self API", 10);
      const result = controller.createEscrow(svc.id, providerId, providerId, 10);
      expect(result).toHaveProperty("error");
    });

    it("rejects escrow for inactive service", () => {
      const svc = controller.listService(providerId, "Old", 5);
      controller.deactivateService(svc.id);
      const result = controller.createEscrow(svc.id, buyerId, providerId, 5);
      expect(result).toHaveProperty("error");
    });
  });

  describe("Escrow Lifecycle", () => {
    let escrowId: string;
    let escrowAmount: number;

    beforeEach(() => {
      const svc = controller.listService(providerId, "Sentiment Analysis", 200);
      escrowAmount = 200;
      const result = controller.createEscrow(svc.id, buyerId, providerId, escrowAmount);
      if ("id" in result) escrowId = result.id;
    });

    it("releases escrow to seller", () => {
      const result = controller.releaseEscrow(escrowId);
      if ("status" in result) {
        expect(result.status).toBe("released");
        expect(controller.getBalance(providerId)).toBe(200);
        expect(controller.getBalance(buyerId)).toBe(800);
      }
    });

    it("refunds escrow to buyer", () => {
      const result = controller.refundEscrow(escrowId);
      if ("status" in result) {
        expect(result.status).toBe("refunded");
        expect(controller.getBalance(buyerId)).toBe(1000); // full refund
      }
    });

    it("disputes an escrow", () => {
      const result = controller.disputeEscrow(escrowId);
      if ("status" in result) {
        expect(result.status).toBe("disputed");
      }
    });

    it("can refund a disputed escrow", () => {
      controller.disputeEscrow(escrowId);
      const result = controller.refundEscrow(escrowId);
      if ("status" in result) expect(result.status).toBe("refunded");
    });

    it("cannot release an already released escrow", () => {
      controller.releaseEscrow(escrowId);
      const result = controller.releaseEscrow(escrowId);
      expect(result).toHaveProperty("error");
    });
  });
});