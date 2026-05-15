"""Marketplace module — list services and manage escrow payments."""

from __future__ import annotations
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from mogbank.client import MogBankClient
from mogbank.types import Service, Escrow, Currency


@dataclass
class ServiceListingParams:
    agent_id: str
    name: str
    description: str
    price: float
    currency: Currency = Currency.USDC


@dataclass
class EscrowParams:
    buyer_agent_id: str
    seller_agent_id: str
    service_id: str
    amount: float
    currency: Currency = Currency.USDC
    buyer_wallet_id: str = ""
    seller_wallet_id: str = ""
    timeout_hours: int = 72


@dataclass
class EscrowResponse:
    escrow: Escrow
    transaction_id: str


class MarketplaceModule:
    """"""

    def __init__(self, client: MogBankClient):
        self.client = client

    def list_services(
        self,
        status: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Service]:
        params = []
        if status:
            params.append(f"status={status}")
        if min_price is not None:
            params.append(f"min_price={min_price}")
        if max_price is not None:
            params.append(f"max_price={max_price}")
        params.extend([f"limit={limit}", f"offset={offset}"])
        query = "&".join(params)

        result = self.client.request(
            "GET", f"/api/v1/marketplace/services?{query}"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to list services")
        return [Service(**s) for s in result.data]

    def get_service(self, service_id: str) -> Service:
        result = self.client.request(
            "GET", f"/api/v1/marketplace/services/{service_id}"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Service not found")
        return Service(**result.data)

    def create_service(self, params: ServiceListingParams) -> Service:
        import uuid

        result = self.client.request(
            "POST",
            "/api/v1/marketplace/services",
            {
                "agent_id": params.agent_id,
                "name": params.name,
                "description": params.description,
                "price": params.price,
                "currency": params.currency.value,
            },
            idempotency_key=f"svc_{params.agent_id}_{uuid.uuid4().hex[:8]}",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Service creation failed")
        return Service(**result.data)

    def create_escrow(self, params: EscrowParams) -> EscrowResponse:
        import uuid

        result = self.client.request(
            "POST",
            "/api/v1/marketplace/escrow",
            {
                "buyer_agent_id": params.buyer_agent_id,
                "seller_agent_id": params.seller_agent_id,
                "service_id": params.service_id,
                "amount": params.amount,
                "currency": params.currency.value,
                "buyer_wallet_id": params.buyer_wallet_id,
                "seller_wallet_id": params.seller_wallet_id,
                "timeout_hours": params.timeout_hours,
            },
            idempotency_key=f"escrow_{params.service_id}_{uuid.uuid4().hex[:8]}",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Escrow creation failed")
        data = result.data
        return EscrowResponse(
            escrow=Escrow(**data["escrow"]),
            transaction_id=data["transaction_id"],
        )

    def release_escrow(self, escrow_id: str) -> Escrow:
        result = self.client.request(
            "POST",
            f"/api/v1/marketplace/escrow/{escrow_id}/release",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Escrow release failed")
        return Escrow(**result.data)

    def refund_escrow(self, escrow_id: str) -> Escrow:
        result = self.client.request(
            "POST",
            f"/api/v1/marketplace/escrow/{escrow_id}/refund",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Escrow refund failed")
        return Escrow(**result.data)

    def get_escrow(self, escrow_id: str) -> Escrow:
        result = self.client.request(
            "GET", f"/api/v1/marketplace/escrow/{escrow_id}"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Escrow not found")
        return Escrow(**result.data)

    def list_escrows(
        self, agent_id: Optional[str] = None, status: Optional[str] = None
    ) -> List[Escrow]:
        params = []
        if agent_id:
            params.append(f"agent_id={agent_id}")
        if status:
            params.append(f"status={status}")
        query = "&".join(params)

        result = self.client.request(
            "GET", f"/api/v1/marketplace/escrow?{query}"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to list escrows")
        return [Escrow(**e) for e in result.data]