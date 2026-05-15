"""Ed25519 cryptographic utilities for the MogBank Python SDK."""

from __future__ import annotations
import hashlib
import json
import time
from typing import Optional, Dict, Any, Tuple

from nacl.signing import SigningKey, VerifyKey
from nacl.encoding import HexEncoder
from nacl.exceptions import BadSignatureError

from mogbank.types import Ed25519KeyPair, Mandate


class CryptoUtils:
    """Ed25519 signing, verification, and key management utilities."""

    @staticmethod
    def generate_keypair() -> Ed25519KeyPair:
        """Generate a new Ed25519 keypair for an AI agent."""
        signing_key = SigningKey.generate()
        verify_key = signing_key.verify_key
        return Ed25519KeyPair(
            public_key=verify_key.encode(HexEncoder).decode(),
            private_key=signing_key.encode(HexEncoder).decode(),
        )

    @staticmethod
    def sign_message(message: bytes, private_key_hex: str) -> str:
        """Sign a message with the agent's Ed25519 private key."""
        signing_key = SigningKey(private_key_hex, encoder=HexEncoder)
        signed = signing_key.sign(message)
        return signed.signature.hex()

    @staticmethod
    def verify_signature(message: bytes, signature_hex: str, public_key_hex: str) -> bool:
        """Verify an Ed25519 signature against a public key."""
        try:
            verify_key = VerifyKey(public_key_hex, encoder=HexEncoder)
            signature = bytes.fromhex(signature_hex)
            verify_key.verify(message, signature)
            return True
        except (BadSignatureError, ValueError):
            return False

    @staticmethod
    def create_mandate(
        agent_id: str,
        private_key_hex: str,
        action: str,
        max_amount: float,
        valid_until: str,
        delegate_id: Optional[str] = None,
        mandate_id: Optional[str] = None,
    ) -> Mandate:
        """Create an Ed25519-signed mandate authorizing an action."""
        import uuid

        mandate_data: Dict[str, Any] = {
            "id": mandate_id or str(uuid.uuid4()),
            "agent_id": agent_id,
            "action": action,
            "max_amount": max_amount,
            "valid_until": valid_until,
            "timestamp": int(time.time()),
        }
        if delegate_id:
            mandate_data["delegate_id"] = delegate_id

        message = json.dumps(mandate_data, sort_keys=True).encode()
        signature = CryptoUtils.sign_message(message, private_key_hex)

        return Mandate(
            id=mandate_data["id"],
            agent_id=agent_id,
            delegate_id=delegate_id,
            action=action,
            max_amount=max_amount,
            valid_until=valid_until,
            signature=signature,
        )

    @staticmethod
    def verify_mandate(mandate: Mandate, public_key_hex: str) -> bool:
        """Verify that a mandate's signature is valid."""
        mandate_data: Dict[str, Any] = {
            "id": mandate.id,
            "agent_id": mandate.agent_id,
            "action": mandate.action,
            "max_amount": mandate.max_amount,
            "valid_until": mandate.valid_until,
            "timestamp": 0,  # Will be ignored by backend's own timestamp check
        }
        if mandate.delegate_id:
            mandate_data["delegate_id"] = mandate.delegate_id

        # Reconstruct the signed message
        # Note: exact format must match agent's sign_mandate_for_agent
        message = json.dumps(mandate_data, sort_keys=True).encode()
        return CryptoUtils.verify_signature(message, mandate.signature, public_key_hex)

    @staticmethod
    def sign_request_body(body: Dict[str, Any], private_key_hex: str) -> str:
        """Sign an API request body with the agent's private key."""
        canonical = json.dumps(body, sort_keys=True).encode()
        return CryptoUtils.sign_message(canonical, private_key_hex)

    @staticmethod
    def create_idempotency_key(prefix: str) -> str:
        """Create a unique idempotency key for request deduplication."""
        import uuid
        return f"{prefix}_{uuid.uuid4().hex}"

    @staticmethod
    def hash_message(message: bytes) -> str:
        """SHA-256 hash a message."""
        return hashlib.sha256(message).hexdigest()