"""
Agent Execution Limits & Safety Bounds
Centralizes configurable resource and execution constraints.
"""

from dataclasses import dataclass
from typing import Dict, Any


@dataclass(frozen=True)
class AgentLimits:
    """
    Configurable safety and resource bounds for agent orchestration.
    """
    max_plan_steps: int = 20
    max_execution_depth: int = 5
    max_retries_per_step: int = 3
    max_total_retries: int = 10
    step_timeout_sec: float = 30.0
    task_timeout_sec: float = 300.0
    max_tool_calls_total: int = 50
    max_generated_output_tokens: int = 4096

    def to_dict(self) -> Dict[str, Any]:
        """Convert limits to dictionary."""
        return {
            "max_plan_steps": self.max_plan_steps,
            "max_execution_depth": self.max_execution_depth,
            "max_retries_per_step": self.max_retries_per_step,
            "max_total_retries": self.max_total_retries,
            "step_timeout_sec": self.step_timeout_sec,
            "task_timeout_sec": self.task_timeout_sec,
            "max_tool_calls_total": self.max_tool_calls_total,
            "max_generated_output_tokens": self.max_generated_output_tokens,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentLimits":
        """Reconstruct limits from dictionary."""
        return cls(
            max_plan_steps=data.get("max_plan_steps", 20),
            max_execution_depth=data.get("max_execution_depth", 5),
            max_retries_per_step=data.get("max_retries_per_step", 3),
            max_total_retries=data.get("max_total_retries", 10),
            step_timeout_sec=data.get("step_timeout_sec", 30.0),
            task_timeout_sec=data.get("task_timeout_sec", 300.0),
            max_tool_calls_total=data.get("max_tool_calls_total", 50),
            max_generated_output_tokens=data.get("max_generated_output_tokens", 4096),
        )
