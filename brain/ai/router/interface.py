"""
Model Router Interface
Defines the abstract contract for all Model Router implementations in Fluffy.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any

from brain.ai.router.decision import RoutingDecision
from brain.ai.router.request import RoutingRequest


class ModelRouter(ABC):
    """
    Abstract Model Router interface.
    Decouples model selection logic from agent workflows and inference backends.
    """

    @abstractmethod
    def route(self, request: RoutingRequest) -> RoutingDecision:
        """
        Evaluate candidate models against the request, hardware, and runtime state,
        and select the optimal candidate with fallback options.

        Args:
            request: Task requirements and constraint specifications.

        Returns:
            RoutingDecision: Full structured decision including winning model,
                             backend, explainability metrics, and fallback list.

        Raises:
            RoutingError: When no viable candidate meets the hard constraints.
        """
        pass

    @abstractmethod
    def explain(self, decision: RoutingDecision) -> Dict[str, Any]:
        """
        Provide detailed explainability diagnostic metadata for a routing decision.

        Args:
            decision: A previously produced RoutingDecision.

        Returns:
            Dictionary containing structured diagnostics and score breakdowns.
        """
        pass
