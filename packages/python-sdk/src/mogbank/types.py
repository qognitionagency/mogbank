"""Type definitions for the MogBank Python SDK."""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any, TypeVar, Generic, Union


class Currency(str, Enum):
    USDC = "USDC"
    UNIT = "UNIT"


class AgentStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    BANNED = "banned"


class TransactionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"
    SETTLED = "settled"


class WalletStatus(str, Enum):
    ACTIVE = "active"
    FROZEN = "frozen"
    CLOSED = "closed"


class ServiceStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"


class EscrowStatus(str, Enum):
    PENDING = "pending"
    FUNDED = "funded"
    RELEASED = "released"
    REFUNDED = "refunded"
    DISPUTED = "disputed"
    EXPIRED = "expired"


@dataclass
class KYADimensions:
    """KYA-7 credibility score dimensions (1-100 each)."""
    transaction_history: int = 0
    balance_stability: int = 0
    escrow_completion: int = 0
    mandate_compliance: int = 0
    liquidity_provision: int = 0
    governance_participation: int = 0
    network_contribution: int = 0


@dataclass
class AgentInfo:
    id: str
    name: str
    public_key: str
    status: AgentStatus
    kya_score: float
    kya_dimensions: KYADimensions
    created_at: str
    updated_at: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WalletInfo:
    id: str
    agent_id: str
    balance: float
    currency: Currency
    status: WalletStatus
    on_chain_address: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class Transaction:
    id: str
    from_wallet_id: str
    to_wallet_id: str
    amount: float
    currency: Currency
    status: TransactionStatus
    idempotency_key: str
    description: Optional[str] = None
    on_chain_tx_hash: Optional[str] = None
    fee: float = 0.0
    created_at: Optional[str] = None
    settled_at: Optional[str] = None


@dataclass
class LedgerEntry:
    id: str
    transaction_id: str
    wallet_id: str
    entry_type: str  # 'debit' | 'credit'
    amount: float
    balance_before: float
    balance_after: float
    currency: Currency
    description: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class Service:
    id: str
    seller_agent_id: str
    name: str
    description: str
    price: float
    currency: Currency
    status: ServiceStatus
    total_sales: int = 0
    rating: float = 0.0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class Escrow:
    id: str
    buyer_agent_id: str
    seller_agent_id: str
    service_id: str
    amount: float
    currency: Currency
    status: EscrowStatus
    transaction_id: str
    timeout_hours: int = 72
    expires_at: Optional[str] = None
    released_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class Ed25519KeyPair:
    public_key: str
    private_key: str


@dataclass
class Mandate:
    id: str
    agent_id: str
    delegate_id: Optional[str] = None
    action: str = "transfer"
    max_amount: float = 0.0
    valid_until: str = ""
    signature: str = ""


@dataclass
class ApiError:
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


T = TypeVar("T")


@dataclass
class ApiResponse(Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    

@dataclass
class MogBankConfig:
    base_url: str = "https://api.mogbank.dev"
    agent_id: Optional[str] = None
    private_key_hex: Optional[str] = None
    public_key_hex: Optional[str] = None
    timeout: float = 30.0
    max_retries: int = 3
    default_currency: Currency = Currency.USDC