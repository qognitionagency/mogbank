"""CrewAI Tools for MogBank — Multi-agent teams can transact in USDC."""

from __future__ import annotations

from typing import Optional, Type, Any, Dict
from pydantic import BaseModel, Field

from crewai_tools import BaseTool

from mogbank import MogBankClient
from mogbank.types import Currency


class TransferInput(BaseModel):
    to_agent_id: str = Field(description="Recipient agent ID")
    amount: float = Field(description="Amount of USDC to send")
    description: Optional[str] = Field(default=None, description="Payment memo")


class BalanceInput(BaseModel):
    wallet_id: Optional[str] = Field(default=None, description="Wallet ID (default if empty)")


class EscrowInput(BaseModel):
    seller_agent_id: str = Field(description="Seller agent ID")
    service_id: str = Field(description="Service ID")
    amount: float = Field(description="Amount to escrow")
    timeout_hours: int = Field(default=72, description="Escrow timeout")


class FaucetInput(BaseModel):
    amount: float = Field(default=100.0, description="USDC amount to claim")


class MogBankTransferTool(BaseTool):
    name: str = "mogbank_transfer"
    description: str = "Send USDC to another AI agent on MogBank"
    args_schema: Type[BaseModel] = TransferInput

    client: MogBankClient
    wallet_id: str

    def _run(self, to_agent_id: str, amount: float, description: Optional[str] = None) -> str:
        try:
            result = self.client.transfer.send({
                "from_wallet_id": self.wallet_id,
                "to_agent_id": to_agent_id,
                "amount": amount,
                "currency": Currency.USDC,
                "description": description,
            })
            tx = result.transaction
            return f"Transfer success! TxID: {tx.id}, Amount: {tx.amount} USDC, Status: {tx.status.value}"
        except Exception as e:
            return f"Transfer failed: {e}"


class MogBankBalanceTool(BaseTool):
    name: str = "mogbank_balance"
    description: str = "Check USDC wallet balance on MogBank"
    args_schema: Type[BaseModel] = BalanceInput

    client: MogBankClient
    wallet_id: str

    def _run(self, wallet_id: Optional[str] = None) -> str:
        try:
            wid = wallet_id or self.wallet_id
            result = self.client.transfer.get_balance(wid)
            return f"Balance: {result.balance} {result.currency} (Wallet: {result.wallet_id})"
        except Exception as e:
            return f"Balance check failed: {e}"


class MogBankEscrowTool(BaseTool):
    name: str = "mogbank_escrow"
    description: str = "Create escrow payment for marketplace services on MogBank"
    args_schema: Type[BaseModel] = EscrowInput

    client: MogBankClient
    agent_id: str
    wallet_id: str

    def _run(self, seller_agent_id: str, service_id: str, amount: float, timeout_hours: int = 72) -> str:
        try:
            result = self.client.marketplace.create_escrow({
                "buyer_agent_id": self.agent_id,
                "seller_agent_id": seller_agent_id,
                "service_id": service_id,
                "amount": amount,
                "timeout_hours": timeout_hours,
                "buyer_wallet_id": self.wallet_id,
            })
            e = result.escrow
            return f"Escrow created! ID: {e.id}, Amount: {e.amount} USDC, Status: {e.status.value}"
        except Exception as e:
            return f"Escrow failed: {e}"


class MogBankFaucetTool(BaseTool):
    name: str = "mogbank_faucet"
    description: str = "Claim testnet USDC from MogBank faucet"
    args_schema: Type[BaseModel] = FaucetInput

    client: MogBankClient
    agent_id: str
    wallet_id: str

    def _run(self, amount: float = 100.0) -> str:
        try:
            result = self.client.faucet.claim({
                "agent_id": self.agent_id,
                "wallet_id": self.wallet_id,
                "amount": amount,
            })
            return f"Faucet claim success! +{amount} USDC, Balance: {result.balance_after}"
        except Exception as e:
            return f"Faucet claim failed: {e}"