"""AutoGen Tools for MogBank — Conversational agents can bank autonomously."""

from __future__ import annotations

from typing import Optional, Type, Any, Dict, List
from pydantic import BaseModel, Field

from mogbank import MogBankClient
from mogbank.types import Currency


class TransferInput(BaseModel):
    to_agent_id: str = Field(description="Recipient agent ID")
    amount: float = Field(description="Amount of USDC")
    description: Optional[str] = Field(default=None, description="Memo")


class BalanceInput(BaseModel):
    wallet_id: Optional[str] = Field(default=None, description="Wallet ID")


class EscrowInput(BaseModel):
    seller_agent_id: str = Field(description="Seller agent ID")
    service_id: str = Field(description="Service ID")
    amount: float = Field(description="Amount to escrow")
    timeout_hours: int = Field(default=72, description="Timeout")


class FaucetInput(BaseModel):
    amount: float = Field(default=100.0, description="USDC to claim")


class RegisterInput(BaseModel):
    name: str = Field(description="Agent name")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Metadata")


def create_mogbank_transfer_tool(client: MogBankClient, wallet_id: str):
    """Create an AutoGen-compatible transfer tool function."""

    def mogbank_transfer(to_agent_id: str, amount: float, description: Optional[str] = None) -> str:
        try:
            result = client.transfer.send({
                "from_wallet_id": wallet_id,
                "to_agent_id": to_agent_id,
                "amount": amount,
                "currency": Currency.USDC,
                "description": description,
            })
            tx = result.transaction
            return f"[MogBank] Transfer #{tx.id}: {tx.amount} USDC → {to_agent_id} [{tx.status.value}]"
        except Exception as e:
            return f"[MogBank Error] Transfer failed: {e}"

    return mogbank_transfer


def create_mogbank_balance_tool(client: MogBankClient, wallet_id: str):
    """Create an AutoGen-compatible balance check tool function."""

    def mogbank_balance(wallet_id_override: Optional[str] = None) -> str:
        try:
            wid = wallet_id_override or wallet_id
            result = client.transfer.get_balance(wid)
            return f"[MogBank] Wallet {result.wallet_id}: {result.balance} {result.currency}"
        except Exception as e:
            return f"[MogBank Error] Balance check failed: {e}"

    return mogbank_balance


def create_mogbank_escrow_tool(client: MogBankClient, agent_id: str, wallet_id: str):
    """Create an AutoGen-compatible escrow tool function."""

    def mogbank_escrow(seller_agent_id: str, service_id: str, amount: float, timeout_hours: int = 72) -> str:
        try:
            result = client.marketplace.create_escrow({
                "buyer_agent_id": agent_id,
                "seller_agent_id": seller_agent_id,
                "service_id": service_id,
                "amount": amount,
                "timeout_hours": timeout_hours,
                "buyer_wallet_id": wallet_id,
            })
            e = result.escrow
            return f"[MogBank] Escrow #{e.id}: {e.amount} USDC held [{e.status.value}]"
        except Exception as e:
            return f"[MogBank Error] Escrow failed: {e}"

    return mogbank_escrow


def create_mogbank_faucet_tool(client: MogBankClient, agent_id: str, wallet_id: str):
    """Create an AutoGen-compatible faucet tool function."""

    def mogbank_faucet(amount: float = 100.0) -> str:
        try:
            result = client.faucet.claim({
                "agent_id": agent_id,
                "wallet_id": wallet_id,
                "amount": amount,
            })
            return f"[MogBank Faucet] +{amount} USDC claimed. Balance: {result.balance_after}"
        except Exception as e:
            return f"[MogBank Error] Faucet claim failed: {e}"

    return mogbank_faucet


def create_mogbank_register_tool(client: MogBankClient, private_key_hex: str, public_key_hex: str):
    """Create an AutoGen-compatible agent registration tool function."""

    def mogbank_register(name: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        try:
            agent = client.agent.register({
                "name": name,
                "public_key": public_key_hex,
                "metadata": metadata,
            })
            return (
                f"[MogBank] Agent registered: {agent.name} (ID: {agent.id})\n"
                f"KYA Score: {agent.kya_score}\n"
                f"API Key: {agent.api_key or 'N/A'}"
            )
        except Exception as e:
            return f"[MogBank Error] Registration failed: {e}"

    return mogbank_register


def get_all_mogbank_tools(
    client: MogBankClient,
    agent_id: str,
    wallet_id: str,
    private_key_hex: str = "",
    public_key_hex: str = "",
) -> List[Dict[str, Any]]:
    """Get all MogBank tools as AutoGen tool definitions for LLM function calling.

    Returns a list of dicts compatible with AutoGen's tool registration system.
    """
    tools = [
        {
            "type": "function",
            "function": {
                "name": "mogbank_transfer",
                "description": "Send USDC to another AI agent on MogBank",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "to_agent_id": {"type": "string", "description": "Recipient agent ID"},
                        "amount": {"type": "number", "description": "Amount of USDC to send"},
                        "description": {"type": "string", "description": "Payment memo"},
                    },
                    "required": ["to_agent_id", "amount"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mogbank_balance",
                "description": "Check USDC wallet balance on MogBank",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "wallet_id": {"type": "string", "description": "Wallet ID (optional)"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mogbank_escrow",
                "description": "Create an escrow payment for a marketplace service",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "seller_agent_id": {"type": "string", "description": "Seller agent ID"},
                        "service_id": {"type": "string", "description": "Service ID"},
                        "amount": {"type": "number", "description": "Amount to escrow"},
                        "timeout_hours": {"type": "integer", "description": "Escrow timeout hours"},
                    },
                    "required": ["seller_agent_id", "service_id", "amount"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mogbank_faucet",
                "description": "Claim testnet USDC from MogBank faucet",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": {"type": "number", "description": "USDC amount to claim"},
                    },
                },
            },
        },
    ]

    # Build callable handlers map
    tool_handlers = {
        "mogbank_transfer": create_mogbank_transfer_tool(client, wallet_id),
        "mogbank_balance": create_mogbank_balance_tool(client, wallet_id),
        "mogbank_escrow": create_mogbank_escrow_tool(client, agent_id, wallet_id),
        "mogbank_faucet": create_mogbank_faucet_tool(client, agent_id, wallet_id),
    }

    return tools, tool_handlers