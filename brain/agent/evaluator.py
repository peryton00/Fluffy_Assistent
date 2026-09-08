"""
Goal Evaluation Engine
Evaluates whether executed plan observations fulfill the task's overarching goal.
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional

from brain.agent.state import AgentState
from brain.agent.step import StepStatus


@dataclass
class EvaluationResult:
    """Outcome of goal satisfaction evaluation."""
    is_complete: bool
    summary: str
    needs_replan: bool = False
    feedback: Optional[str] = None


class GoalEvaluator:
    """
    Evaluates goal progress deterministically or with optional model assistance.
    """

    @classmethod
    def evaluate(cls, state: AgentState) -> EvaluationResult:
        """
        Evaluate task completion based on plan state and observations.
        Defaults to deterministic evaluation first.
        """
        task = state.task
        plan = state.plan

        if not plan or not plan.steps:
            return EvaluationResult(
                is_complete=False,
                summary="No plan exists for task.",
                needs_replan=True,
            )

        # 1. Check for permanently failed steps
        failed_steps = [s for s in plan.steps if s.status == StepStatus.FAILED]
        if failed_steps:
            err_summary = "; ".join(f"{s.step_id}: {s.error}" for s in failed_steps)
            return EvaluationResult(
                is_complete=False,
                summary=f"Task has failed steps: {err_summary}",
                needs_replan=True,
            )

        # 2. Check if all required steps completed
        if plan.is_all_completed():
            last_step = plan.steps[-1]
            last_obs = state.observations.get(last_step.step_id)
            out_summary = "Task completed successfully."
            if last_obs and last_obs.output:
                out_summary = str(last_obs.output)

            return EvaluationResult(
                is_complete=True,
                summary=out_summary,
                needs_replan=False,
            )

        # 3. Steps still pending
        pending_count = sum(1 for s in plan.steps if s.status not in (StepStatus.COMPLETED, StepStatus.SKIPPED))
        return EvaluationResult(
            is_complete=False,
            summary=f"Task in progress ({pending_count} steps remaining).",
            needs_replan=False,
        )
