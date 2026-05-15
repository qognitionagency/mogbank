"""
MogBank Python SDK — Agent Banking Infrastructure Client.

Provides type-safe access to all MogBank APIs for AI agents.
Supports Ed25519 cryptographic signatures, x402 protocol,
real-time streaming, and Base L2 USDC settlement.
"""

from mogbank.client import MogBankClient, MogBankError
from mogbank.crypto import CryptoUtils
from mogbank.stream import StreamClient

from mogbank.agent import AgentModule, AgentRegistrationParams, AgentResponse
from mogbank.wallet import WalletModule, CreateWalletParams, WalletResponse
from mogbank.transfer import (
    TransferModule,
    TransferParams,
    TransferResponse,
    BalanceResponse,
)
from mogbank.marketplace import (
    MarketplaceModule,
    ServiceListingParams,
    EscrowParams,
    EscrowResponse,
)
from mogbank.faucet import FaucetModule, FaucetClaimParams, FaucetClaimResponse

from mogbank.types import (
    Currency,
    AgentStatus,
    TransactionStatus,
    WalletStatus,
    ServiceStatus,
    EscrowStatus,
    KYADimensions,
    AgentInfo,
    WalletInfo,
    Transaction,
    LedgerEntry,
    Service,
    Escrow,
    ApiError,
    ApiResponse,
    MogBankConfig,
    Ed25519KeyPair,
    Mandate,
)

__version__ = "1.0.0"
__all__ = [
    "MogBankClient",
    "MogBankError",
    "CryptoUtils",
    "StreamClient",
    "AgentModule",
    "AgentRegistrationParams",
    "AgentResponse",
    "WalletModule",
    "CreateWalletParams",
    "WalletResponse",
    "TransferModule",
    "TransferParams",
    "TransferResponse",
    "BalanceResponse",
    "MarketplaceModule",
    "ServiceListingParams",
    "EscrowParams",
    "EscrowResponse",
    "FaucetModule",
    "FaucetClaimParams",
    "FaucetClaimResponse",
]