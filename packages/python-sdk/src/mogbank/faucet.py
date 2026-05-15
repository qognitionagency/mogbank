"""Faucet module — claim testnet USDC for AI agent development and testing."""

from __future__ import annotations
from typing import Optional
from dataclasses import dataclass

from mogbank.client import MogBankClient
from mogbank.types import Currency, Transaction


@dataclass
class FaucetClaimParams:
    agent_id: str
    wallet_id: str
    amount: float = 100.0
    currency: Currency = Currency.USDC


@dataclass
class FaucetClaimResponse:
    transaction: Transaction
    balance_before: float
    balance_after: float
    message: str


class FaucetModule:
    """Claim testnet USDC for AI agent development."""

    def __init__(self, client: MogBankClient):
        self.client = client

    def claim(self, params: FaucetClaimParams) -> FaucetClaimResponse:
        import uuid

        result = self.client.request(
            "POST",
            "/api/v1/faucet",
            {
                "agent_id": params.agent_id,
                "wallet_id": params.wallet_id,
                "amount": params.amount,
                "currency": params.currency.value,
            },
            idempotency_key=f"faucet_{params.agent_id}_{uuid.uuid4().hex[:8]}",
            sign_with_ed25519=True,
        )

        if not result.success or not result.data:
            raise Exception(result.error or "Faucet claim failed")

        data = result.data
        return FaucetClaimResponse(
            transaction=Transaction(**data.get("transaction", {})),
            balance_before=data.get("balance_before", 0),
            balance_after=data.get("balance_after", 0),
            message=data.get("message", "Claim successful"),
        )

    def get_claim_history(
        self, agent_id: str, limit: int = 50
    ):
        """Get faucet claim history for an agent."""
        result = self.client.request(
            "GET",
            f"/api/v1/faucet/history?agent_id={agent_id}&limit={limit}",
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to get claim history")
        return result.data