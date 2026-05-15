"""Stream module — real-time balance and event streaming via WebSocket and SSE."""

from __future__ import annotations
import asyncio
import json
import logging
from typing import Optional, Callable, Awaitable, Any, Dict

import httpx

from mogbank.types import MogBankConfig

logger = logging.getLogger("mogbank.stream")


class StreamClient:
    """
    Real-time streaming client for MogBank.

    Supports:
    - WebSocket for balance updates, transaction events
    - SSE (Server-Sent Events) as fallback
    - Auto-reconnection with exponential backoff
    """

    def __init__(
        self,
        config: MogBankConfig,
        agent_id: Optional[str] = None,
        wallet_id: Optional[str] = None,
    ):
        self.config = config
        self.agent_id = agent_id or config.agent_id
        self.wallet_id = wallet_id

        ws_url = config.base_url.replace("https://", "wss://").replace("http://", "ws://")
        self.ws_url = f"{ws_url}/ws"
        self.sse_url = f"{config.base_url}/api/v1/stream"

        self._ws: Optional[Any] = None
        self._should_reconnect = True
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 60.0

        # Event handlers
        self._on_balance: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
        self._on_transaction: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
        self._on_error: Optional[Callable[[Exception], Awaitable[None]]] = None

    def on_balance(self, handler: Callable[[Dict[str, Any]], Awaitable[None]]):
        """Register a handler for real-time balance updates."""
        self._on_balance = handler

    def on_transaction(self, handler: Callable[[Dict[str, Any]], Awaitable[None]]):
        """Register a handler for transaction events."""
        self._on_transaction = handler

    def on_error(self, handler: Callable[[Exception], Awaitable[None]]):
        """Register a handler for stream errors."""
        self._on_error = handler

    async def connect_websocket(self) -> None:
        """Connect via WebSocket for real-time streaming."""
        try:
            import websockets
        except ImportError:
            logger.warning("websockets not installed, falling back to SSE")
            await self.connect_sse()
            return

        self._should_reconnect = True
        self._reconnect_delay = 1.0

        while self._should_reconnect:
            try:
                # Build connection URL with auth params
                url = self.ws_url
                params = []
                if self.agent_id:
                    params.append(f"agent_id={self.agent_id}")
                if self.wallet_id:
                    params.append(f"wallet_id={self.wallet_id}")
                if params:
                    url = f"{url}?{'&'.join(params)}"

                async with websockets.connect(url) as ws:
                    self._ws = ws
                    self._reconnect_delay = 1.0  # Reset on successful connection
                    logger.info(f"WebSocket connected: {url}")

                    async for message in ws:
                        try:
                            data = json.loads(message)
                            await self._handle_message(data)
                        except json.JSONDecodeError:
                            logger.warning(f"Invalid JSON from WebSocket: {message}")

            except asyncio.CancelledError:
                self._should_reconnect = False
                break
            except Exception as e:
                logger.warning(f"WebSocket disconnected: {e}")
                if self._on_error:
                    await self._on_error(e)

                if self._should_reconnect:
                    await asyncio.sleep(self._reconnect_delay)
                    self._reconnect_delay = min(
                        self._reconnect_delay * 2, self._max_reconnect_delay
                    )

    async def connect_sse(self) -> None:
        """Connect via SSE (Server-Sent Events) as a fallback."""
        self._should_reconnect = True
        self._reconnect_delay = 1.0

        params = []
        if self.agent_id:
            params.append(f"agent_id={self.agent_id}")
        if self.wallet_id:
            params.append(f"wallet_id={self.wallet_id}")
        url = self.sse_url
        if params:
            url = f"{url}?{'&'.join(params)}"

        while self._should_reconnect:
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(None),
                    headers={
                        "Accept": "text/event-stream",
                        "Cache-Control": "no-cache",
                    },
                ) as client:
                    async with client.stream("GET", url) as response:
                        response.raise_for_status()
                        self._reconnect_delay = 1.0
                        logger.info(f"SSE connected: {url}")

                        async for line in response.aiter_lines():
                            if not line.strip():
                                continue
                            if line.startswith("data:"):
                                data_str = line[len("data:"):].strip()
                                try:
                                    data = json.loads(data_str)
                                    await self._handle_message(data)
                                except json.JSONDecodeError:
                                    logger.warning(f"Invalid JSON from SSE: {data_str}")

            except Exception as e:
                logger.warning(f"SSE disconnected: {e}")
                if self._on_error:
                    await self._on_error(e)

                if self._should_reconnect:
                    await asyncio.sleep(self._reconnect_delay)
                    self._reconnect_delay = min(
                        self._reconnect_delay * 2, self._max_reconnect_delay
                    )

    async def _handle_message(self, data: Dict[str, Any]) -> None:
        """Dispatch incoming messages to registered handlers."""
        event_type = data.get("type", "")

        if event_type == "balance" and self._on_balance:
            await self._on_balance(data)
        elif event_type == "transaction" and self._on_transaction:
            await self._on_transaction(data)
        else:
            logger.debug(f"Unhandled event type: {event_type}")

    async def disconnect(self) -> None:
        """Disconnect the stream."""
        self._should_reconnect = False
        if self._ws:
            await self._ws.close()
            self._ws = None

    async def stream_balance(
        self, wallet_id: str
    ) -> None:
        """Begin streaming balance updates for a specific wallet."""
        self.wallet_id = wallet_id
        await self.connect_websocket()

    async def subscribe_transactions(self) -> None:
        """Subscribe to transaction events for the configured agent."""
        await self.connect_websocket()