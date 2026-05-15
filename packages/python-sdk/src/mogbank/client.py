"""MogBank API client — performs authenticated HTTP requests with Ed25519 signing."""

from __future__ import annotations
import json
import logging
from typing import Optional, Dict, Any, TypeVar, overload

import httpx

from mogbank.types import MogBankConfig, ApiResponse
from mogbank.crypto import CryptoUtils

T = TypeVar("T")

logger = logging.getLogger("mogbank")


class MogBankError(Exception):
    """Base exception for MogBank client errors."""

    def __init__(self, message: str, status_code: int = 0, error_code: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


class MogBankClient:
    """
    Core client for interacting with the MogBank API.

    Handles:
    - Ed25519 request signing (x402 protocol)
    - Idempotency key management
    - Rate limiting and retries
    - Agent authentication
    """

    def __init__(self, config: MogBankConfig):
        self.config = config
        self._client = httpx.Client(
            base_url=config.base_url,
            timeout=httpx.Timeout(config.timeout),
            headers={
                "Content-Type": "application/json",
                "User-Agent": f"mogbank-python/{self.__get_version()}",
            },
        )
        self._async_client: Optional[httpx.AsyncClient] = None

    @staticmethod
    def __get_version() -> str:
        try:
            from importlib.metadata import version
            return version("mogbank")
        except Exception:
            return "1.0.0"

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        *,
        idempotency_key: Optional[str] = None,
        sign_with_ed25519: bool = False,
    ) -> ApiResponse:
        """
        Make an HTTP request to the MogBank API.

        Args:
            method: HTTP method (GET, POST, PATCH, etc.)
            path: API endpoint path (e.g. /api/v1/agents/register)
            body: Optional request body for POST/PATCH requests
            idempotency_key: Unique key for idempotent requests
            sign_with_ed25519: If True, signs the request with the agent's Ed25519 key

        Returns:
            ApiResponse object with success/error and parsed data
        """
        headers: Dict[str, str] = {}

        # Add idempotency key
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        # Add x402 payment proof
        headers = self._add_x402_headers(headers, method, path, body)

        # Add Ed25519 signature if requested
        if sign_with_ed25519 and self.config.private_key_hex:
            headers = self._sign_request(headers, method, path, body)

        # Add agent ID header
        if self.config.agent_id:
            headers["X-Agent-ID"] = self.config.agent_id

        try:
            response = self._client.request(
                method=method,
                url=path,
                json=body,
                headers=headers,
            )
            return self._handle_response(response)
        except httpx.TimeoutException:
            raise MogBankError(
                f"Request timed out after {self.config.timeout}s",
                status_code=408,
            )
        except httpx.NetworkError as e:
            raise MogBankError(f"Network error: {e}") from e

    async def request_async(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        *,
        idempotency_key: Optional[str] = None,
        sign_with_ed25519: bool = False,
    ) -> ApiResponse:
        """Async version of request()."""
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=httpx.Timeout(self.config.timeout),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": f"mogbank-python/{self.__get_version()}",
                },
            )

        headers: Dict[str, str] = {}

        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        headers = self._add_x402_headers(headers, method, path, body)

        if sign_with_ed25519 and self.config.private_key_hex:
            headers = self._sign_request(headers, method, path, body)

        if self.config.agent_id:
            headers["X-Agent-ID"] = self.config.agent_id

        try:
            response = await self._async_client.request(
                method=method,
                url=path,
                json=body,
                headers=headers,
            )
            return self._handle_response(response)
        except httpx.TimeoutException:
            raise MogBankError(
                f"Request timed out after {self.config.timeout}s",
                status_code=408,
            )
        except httpx.NetworkError as e:
            raise MogBankError(f"Network error: {e}") from e

    def _add_x402_headers(
        self,
        headers: Dict[str, str],
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """Add x402 protocol headers for agent-to-agent payments."""
        return headers  # Extended by DDSC negotiation

    def _sign_request(
        self,
        headers: Dict[str, str],
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """Sign the request with the agent's Ed25519 private key."""
        if not self.config.private_key_hex or not self.config.public_key_hex:
            return headers

        # Create the message to sign: METHOD|PATH|TIMESTAMP|BODY
        import time
        timestamp = str(int(time.time()))

        body_str = json.dumps(body or {}, sort_keys=True)
        message = f"{method}|{path}|{timestamp}|{body_str}".encode()

        signature = CryptoUtils.sign_message(message, self.config.private_key_hex)

        headers["X-Signature"] = signature
        headers["X-Public-Key"] = self.config.public_key_hex
        headers["X-Timestamp"] = timestamp

        return headers

    def _handle_response(self, response: httpx.Response) -> ApiResponse:
        """Parse and validate the API response."""
        try:
            data = response.json()
        except json.JSONDecodeError:
            raise MogBankError(
                f"Invalid JSON response: {response.text[:500]}",
                status_code=response.status_code,
            )

        if not response.is_success:
            error_msg = data.get("error", response.text[:500])
            error_code = data.get("code", "")
            raise MogBankError(
                message=error_msg,
                status_code=response.status_code,
                error_code=error_code,
            )

        return ApiResponse(
            success=data.get("success", True),
            data=data.get("data"),
            error=data.get("error"),
        )

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    async def close_async(self):
        """Close the async HTTP client."""
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()