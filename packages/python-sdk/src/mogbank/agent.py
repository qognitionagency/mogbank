"""Agent module — register, manage, and search AI agents on MogBank."""

from __future__ import annotations
from typing import Optional, List
from dataclasses import dataclass

from mogbank.client import MogBankClient
from mogbank.types import AgentInfo, AgentStatus, KYADimensions, ApiResponse, Currency


@dataclass
class AgentRegistrationParams:
    name: str
    public_key: str
    metadata: Optional[dict] = None


@dataclass
class AgentResponse(AgentInfo):
    api_key: Optional[str] = None


class AgentModule:
    """Manage AI agent registration and profile operations."""

    def __init__(self, client: MogBankClient):
        self.client = client

    def register(self, params: AgentRegistrationParams) -> AgentResponse:
        """Register a new AI agent on the MogBank network."""
        body = {
            "name": params.name,
            "public_key": params.public_key,
            "metadata": params.metadata or {},
        }
        result = self.client.request(
            "POST",
            "/api/v1/agents/register",
            body,
            idempotency_key=f"reg_{params.name}_{hash(params.public_key)}",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Agent registration failed")
        return AgentResponse(**result.data)

    def get(self, agent_id: str) -> AgentInfo:
        """Get agent details by ID."""
        result = self.client.request("GET", f"/api/v1/agents/{agent_id}")
        if not result.success or not result.data:
            raise Exception(result.error or "Agent not found")
        return AgentInfo(**result.data)

    def list_all(
        self,
        status: Optional[AgentStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AgentInfo]:
        """List all agents (admin view)."""
        params = []
        if status:
            params.append(f"status={status.value}")
        params.append(f"limit={limit}")
        params.append(f"offset={offset}")
        query = "&".join(params)

        result = self.client.request("GET", f"/api/v1/admin/agents?{query}")
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to list agents")
        return [AgentInfo(**a) for a in result.data]

    def update_status(self, agent_id: str, status: AgentStatus) -> AgentInfo:
        """Update agent status (admin only)."""
        result = self.client.request(
            "PATCH",
            f"/api/v1/admin/agents/{agent_id}",
            {"status": status.value},
            idempotency_key=f"sts_{agent_id}_{status.value}",
            sign_with_ed25519=True,
        )
        if not result.success or not result.data:
            raise Exception(result.error or "Status update failed")
        return AgentInfo(**result.data)

    def get_kya_score(self, agent_id: str) -> dict:
        """Get KYA-7 credibility score and dimension breakdown."""
        result = self.client.request("GET", f"/api/v1/agents/{agent_id}/kya")
        if not result.success or not result.data:
            raise Exception(result.error or "Failed to get KYA score")
        return result.data