"""Transfer module — send and track payments between AI agents.

Supports both off-chain ledger transfers and on-chain Base L2 USDC settlement.
"""

from __future__ import annotations
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from mogbank.client import MogBankClient
from mogbank.types import (
    Transaction, LedgerEntry, ApiResponse, Currency
)


@dataclass
class TransferParams:
    from_wallet_id: str
    to_wallet_id: Optional[str] = None
    to_agent_id: Optional[str] = None
    amount: float = 0.0
    currency: Currency = Currency.USDC
    description: Optional[str] = None
    idempotency_key: Optional[str] = None
    on_chain: bool = False
    mandate: Optional[Dict[str, Any]] = None


@dataclass
class TransferResponse:
    transaction: Transaction
    ledger_entries: List[LedgerEntry]
    on_chain_tx_hash: Optional[str] = None


@dataclass
class BalanceResponse:
    wallet_id: str
    balance: float
    currency: str
    ledger_history: List[LedgerEntry]


class TransferModule:
    """Send and track payments between AI agent wallets."""

    def __init__(self, client: MogBankClient):
        self.client = client

    def send(self, params: TransferParams) -> TransferResponse:
        """Transfer funds from one agent wallet to another."""
        import uuid

        idempotency_key = params.idempotency_key or (
            f"txfr_{params.from_wallet_id}_{uuid.uuid4().hex[:8]}"
        )

        body: Dict[str, Any] = {
            "from_wallet_id": params.from_wallet_id,
            "amount": params.amount,
            "currency": params.currency.value,
            "idempotency_key": idempotency_key,
            "on_chain": params.on_chain,
        }
        if params.to_wallet_id:
            body["to_wallet_id"] = params.to_wallet_id
        if params.to_agent_id:
            body["to_agent_id"] = params.to_agent_id
        if params.description:
            body["description"] = params.description
        if params.mandate:
            body["mandate"] = params.mandate

        result = self.client.request(
            "POST",
            "/api/v1/transfer",
            body,
            idempotency_key=idempotency_key,
            sign_with_ed25519=True,
        )

        if not result.success or not result.data:
            raise Exception(result.error or "Transfer failed")

        data = result.data
        return TransferResponse(
            transaction=Transaction(**data["transaction"]),
            ledger_entries=[LedgerEntry(**e) for e in data.get("ledger_entries", [])],
            on_chain_tx_hash=data.get("on_chain_tx_hash"),
        )

    def get_transaction(self, transaction_id: str) -> Transaction:
        result = self.client.request("GET", f"/api/v1/transfer/{transaction_id}")
        if not result.success or not result.data:
            raise Exception(result.error or "Transaction not found")
        return Transaction(**result.data)

    def get_balance(self, wallet_id: str) -> BalanceResponse:
        result = self.client.request(
            "GET", f"/api/v1/wallets/{wallet_id}/balance"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to get balance")
        data = result.data
        return BalanceResponse(
            wallet_id=data["wallet_id"],
            balance=data["balance"],
            currency=data["currency"],
            ledger_history=[LedgerEntry(**e) for e in data.get("ledger_history", [])],
        )

    def get_ledger(
        self, wallet_id: str, limit: int = 50, offset: int = 0
    ) -> List[LedgerEntry]:
        result = self.client.request(
            "GET",
            f"/api/v1/wallets/{wallet_id}/ledger?limit={limit}&offset={offset}",
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to get ledger")
        return [LedgerEntry(**e) for e in result.data]

    def list_transactions(
        self,
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Transaction]:
        params = []
        if agent_id:
            params.append(f"agent_id={agent_id}")
        if status:
            params.append(f"status={status}")
        params.extend([f"limit={limit}", f"offset={offset}"])
        query = "&".join(params)

        result = self.client.request(
            "GET", f"/api/v1/admin/transactions?{query}"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to list transactions")
        return [Transaction(**t) for t in result.data]

    def get_settlement_status(self, transaction_id: str) -> dict:
        result = self.client.request(
            "GET", f"/api/v1/transfer/{transaction_id}/settlement"
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to get settlement status")
        return result.data