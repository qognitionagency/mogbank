"""Wallet module — manage agent wallets, balances, and deposit addresses."""

from __future__ import annotations
from typing import Optional, List
from dataclasses import dataclass

from mogbank.client import MogBankClient
from mogbank.types import WalletInfo, WalletStatus, ApiResponse, Currency


@dataclass
class CreateWalletParams:
    agent_id: str
    currency: Currency = Currency.USDC


@dataclass
class WalletResponse(WalletInfo):
    pass


class WalletModule:
    def __init__(self, client: MogBankClient):
        self.client = client

    def create(self, params: CreateWalletParams) -> WalletInfo:
        result = self.client.request(
            "POST",
            "/api/v1/wallets",
            {
                "agent_id": params.agent_id,
                "currency": params.currency.value,
            },
            idempotency_key=f"wallet_create_{params.agent_id}_{hash(str(params))}",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Wallet creation failed")
        return WalletInfo(**result.data)

    def list(self, agent_id: str) -> List[WalletInfo]:
        result = self.client.request(
            "GET", f"/api/v1/wallets?agent_id={agent_id}"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to list wallets")
        return [WalletInfo(**w) for w in result.data]

    def get(self, wallet_id: str) -> WalletInfo:
        result = self.client.request("GET", f"/api/v1/wallets/{wallet_id}")
        if not result.success or not result.data:
            raise Exception(result.error or "Wallet not found")
        return WalletInfo(**result.data)

    def balance(self, wallet_id: str) -> dict:
        wallet = self.get(wallet_id)
        return {"balance": wallet.balance, "currency": wallet.currency.value}

    def list_all(self) -> List[WalletInfo]:
        result = self.client.request("GET", "/api/v1/admin/wallets")
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to list wallets")
        return [WalletInfo(**w) for w in result.data]

    def set_status(self, wallet_id: str, status: WalletStatus) -> WalletInfo:
        result = self.client.request(
            "POST",
            f"/api/v1/wallets/{wallet_id}/status",
            {"status": status.value},
            idempotency_key=f"wallet_sts_{wallet_id}_{status.value}",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Status update failed")
        return WalletInfo(**result.data)