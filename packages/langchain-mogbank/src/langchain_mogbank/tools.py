"""LangChain Tools for MogBank — AI agents can send USDC, check balances, manage escrow, and claim from faucet."""

from __future__ import annotations

from typing import Optional, Type, Any, Dict
from pydantic import BaseModel, Field

from langchain_core.tools import BaseTool
from langchain_core.callbacks import CallbackManagerForToolRun

from mogbank import MogBankClient, CryptoUtils
from mogbank.types import MogBankConfig, Currency


class TransferInput(BaseModel):
    """Input schema for MogBank transfer tool."""
    to_agent_id: str = Field(description="Recipient agent ID")
    amount: float = Field(description="Amount of USDC to send")
    description: Optional[str] = Field(default=None, description="Payment description/memo")
    currency: str = Field(default="USDC", description="Currency (USDC or UNIT)")


class BalanceInput(BaseModel):
    """Input schema for balance check tool."""
    wallet_id: Optional[str] = Field(default=None, description="Wallet ID to check (uses default if empty)")


class EscrowInput(BaseModel):
    """Input schema for escrow tool."""
    seller_agent_id: str = Field(description="Seller agent ID")
    service_id: str = Field(description="Service ID to purchase")
    amount: float = Field(description="Amount to place in escrow")
    timeout_hours: int = Field(default=72, description="Escrow timeout in hours")


class FaucetInput(BaseModel):
    """Input schema for faucet claim tool."""
    amount: float = Field(default=100.0, description="Amount of testnet USDC to claim")


class RegisterAgentInput(BaseModel):
    """Input schema for agent registration tool."""
    name: str = Field(description="Agent name/identifier")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata")


class MogBankTransferTool(BaseTool):
    """LangChain tool: Send USDC to another AI agent on MogBank."""
    name: str = "mogbank_transfer"
    description: str = (
        "Send USDC from your MogBank wallet to another AI agent. "
        "Use this to pay for services, settle obligations, or transfer value. "
        "Requires an idempotency key for safety."
    )
    args_schema: Type[BaseModel] = TransferInput

    client: MogBankClient
    wallet_id: str

    def _run(
        self,
        to_agent_id: str,
        amount: float,
        description: Optional[str] = None,
        currency: str = "USDC",
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        try:
            cur = Currency(currency)
            result = self.client.transfer.send({
                "from_wallet_id": self.wallet_id,
                "to_agent_id": to_agent_id,
                "amount": amount,
                "currency": cur,
                "description": description,
            })
            tx = result.transaction
            return (
                f"Transfer successful! Transaction ID: {tx.id}\n"
                f"Amount: {tx.amount} {tx.currency.value}\n"
                f"Status: {tx.status.value}\n"
                f"Settlement: {tx.on_chain_tx_hash or 'off-chain (ledger)'}"
            )
        except Exception as e:
            return f"Transfer failed: {e}"


class MogBankBalanceTool(BaseTool):
    """LangChain tool: Check wallet balance."""
    name: str = "mogbank_balance"
    description: str = (
        "Check the USDC balance of your MogBank wallet. "
        "Returns current balance, currency, and recent ledger history."
    )
    args_schema: Type[BaseModel] = BalanceInput

    client: MogBankClient
    wallet_id: str

    def _run(
        self,
        wallet_id: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        try:
            wid = wallet_id or self.wallet_id
            result = self.client.transfer.get_balance(wid)
            return (
                f"Wallet: {result.wallet_id}\n"
                f"Balance: {result.balance} {result.currency}\n"
                f"Recent entries: {len(result.ledger_history)}"
            )
        except Exception as e:
            return f"Balance check failed: {e}"


class MogBankEscrowTool(BaseTool):
    """LangChain tool: Create and manage escrow payments."""
    name: str = "mogbank_escrow"
    description: str = (
        "Create an escrow payment for a marketplace service. "
        "Funds are held until the seller delivers, then released. "
        "Can be refunded if the service is not delivered."
    )
    args_schema: Type[BaseModel] = EscrowInput

    client: MogBankClient
    agent_id: str
    wallet_id: str

    def _run(
        self,
        seller_agent_id: str,
        service_id: str,
        amount: float,
        timeout_hours: int = 72,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        try:
            result = self.client.marketplace.create_escrow({
                "buyer_agent_id": self.agent_id,
                "seller_agent_id": seller_agent_id,
                "service_id": service_id,
                "amount": amount,
                "timeout_hours": timeout_hours,
                "buyer_wallet_id": self.wallet_id,
            })
            escrow = result.escrow
            return (
                f"Escrow created! ID: {escrow.id}\n"
                f"Amount: {escrow.amount} {escrow.currency.value}\n"
                f"Status: {escrow.status.value}\n"
                f"Expires: {escrow.expires_at or 'N/A'}"
            )
        except Exception as e:
            return f"Escrow creation failed: {e}"


class MogBankFaucetTool(BaseTool):
    """LangChain tool: Claim testnet USDC from the faucet."""
    name: str = "mogbank_faucet"
    description: str = (
        "Claim testnet USDC from the MogBank faucet for development and testing. "
        "Use this when you need funds to test transfers or escrow flows."
    )
    args_schema: Type[BaseModel] = FaucetInput

    client: MogBankClient
    agent_id: str
    wallet_id: str

    def _run(
        self,
        amount: float = 100.0,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        try:
            result = self.client.faucet.claim({
                "agent_id": self.agent_id,
                "wallet_id": self.wallet_id,
                "amount": amount,
            })
            return (
                f"Faucet claim successful!\n"
                f"Amount: {amount} USDC\n"
                f"Balance before: {result.balance_before}\n"
                f"Balance after: {result.balance_after}"
            )
        except Exception as e:
            return f"Faucet claim failed: {e}"


class MogBankAgentTool(BaseTool):
    """LangChain tool: Register as an AI agent on MogBank."""
    name: str = "mogbank_register_agent"
    description: str = (
        "Register this AI agent on the MogBank network. "
        "Generates an Ed25519 keypair and creates the agent identity. "
        "Required before using other banking tools."
    )
    args_schema: Type[BaseModel] = RegisterAgentInput

    client: MogBankClient
    private_key_hex: str
    public_key_hex: str

    def _run(
        self,
        name: str,
        metadata: Optional[Dict[str, Any]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        try:
            agent = self.client.agent.register({
                "name": name,
                "public_key": self.public_key_hex,
                "metadata": metadata,
            })
            return (
                f"Agent registered!\n"
                f"ID: {agent.id}\n"
                f"Name: {agent.name}\n"
                f"Status: {agent.status.value}\n"
                f"KYA Score: {agent.kya_score}\n"
                f"API Key: {agent.api_key or 'N/A'}"
            )
        except Exception as e:
            return f"Agent registration failed: {e}"