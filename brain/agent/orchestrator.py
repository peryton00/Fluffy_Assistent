"""
Agent Orchestrator Engine
Coordinates task planning, dependency scheduling, safe step execution, confirmation, and recovery.
"""

import time
from typing import Dict, Any, Optional, Set

from brain.agent.evaluator import GoalEvaluator
from brain.agent.events import AgentEvent, AgentEventType, EventEmitter
from brain.agent.execution import StepExecutor
from brain.agent.interface import AgentOrchestratorInterface, AgentResult
from brain.agent.limits import AgentLimits
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.recovery import FailureClassifier, RecoveryAction, RecoveryManager
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus


class AgentOrchestrator(AgentOrchestratorInterface):
    """
    Production-grade, stateful, observable Agent Orchestrator.
    Executes multi-step tasks deterministically with dependency-aware scheduling.
    """

    def __init__(
        self,
        executor: Optional[StepExecutor] = None,
        limits: Optional[AgentLimits] = None,
        event_emitter: Optional[EventEmitter] = None,
    ):
        self.executor = executor or StepExecutor()
        self.limits = limits or AgentLimits()
        self.events = event_emitter or EventEmitter()
        self._states: Dict[str, AgentState] = {}
        self._total_retries: Dict[str, int] = {}

    def get_state(self, task_id: str) -> Optional[AgentState]:
        """Retrieve task state by ID."""
        return self._states.get(task_id)

    def run(self, task: AgentTask, plan: Optional[AgentPlan] = None) -> AgentResult:
        """
        Execute an AgentTask through controlled planning, dependency scheduling, and execution.
        """
        start_time = time.perf_counter()
        state = AgentState(task=task)
        self._states[task.task_id] = state
        self._total_retries[task.task_id] = 0

        self._emit(AgentEventType.TASK_CREATED, task.task_id, payload={"request": task.user_request})

        # 1. Planning Phase
        if plan is None:
            self._emit(AgentEventType.TASK_PLANNING_STARTED, task.task_id)
            task.transition_to(TaskStatus.PLANNING)
            plan = self._create_default_plan(task)

        # Validate plan
        is_valid, plan_err = PlanValidator.validate(plan, max_steps=self.limits.max_plan_steps)
        if not is_valid:
            task.transition_to(TaskStatus.FAILED, reason=plan_err or "Invalid plan")
            task.error = plan_err
            self._emit(AgentEventType.TASK_FAILED, task.task_id, payload={"error": plan_err})
            return AgentResult(
                task_id=task.task_id,
                status=task.status,
                success=False,
                summary=f"Plan validation failed: {plan_err}",
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
                state=state,
                error=plan_err,
            )

        state.plan = plan
        task.transition_to(TaskStatus.READY)
        self._emit(AgentEventType.PLAN_CREATED, task.task_id, payload={"step_count": len(plan.steps)})

        # 2. Transition to EXECUTING
        task.transition_to(TaskStatus.EXECUTING)

        # 3. Enter execution loop
        return self._execution_loop(state, start_time)

    def resume(self, task_id: str, confirmed: bool, confirmation_id: Optional[str] = None) -> AgentResult:
        """
        Resume a task suspended in WAITING_CONFIRMATION state.
        """
        state = self._states.get(task_id)
        if not state:
            raise ValueError(f"Task '{task_id}' not found in orchestrator states.")

        task = state.task
        if task.status != TaskStatus.WAITING_CONFIRMATION:
            raise ValueError(f"Cannot resume task '{task_id}': not in WAITING_CONFIRMATION state (current: {task.status.value}).")

        start_time = time.perf_counter()

        # Resolve confirmation payload
        conf_data = None
        if confirmation_id:
            conf_data = state.resolve_confirmation(confirmation_id)
            if not conf_data:
                raise ValueError(f"Invalid or mismatched confirmation_id '{confirmation_id}' for task '{task_id}'.")
        elif state.pending_confirmations:
            first_conf_id = list(state.pending_confirmations.keys())[0]
            conf_data = state.resolve_confirmation(first_conf_id)

        target_step_id = conf_data.get("step_id") if conf_data else state.current_step_id
        target_step = state.plan.get_step(target_step_id) if state.plan and target_step_id else None

        if not confirmed:
            # User declined confirmation
            if target_step:
                target_step.mark_failed("User declined confirmation.")
            task.transition_to(TaskStatus.FAILED, reason="User declined confirmation.")
            self._emit(AgentEventType.TASK_FAILED, task.task_id, payload={"reason": "User declined confirmation."})
            return AgentResult(
                task_id=task.task_id,
                status=task.status,
                success=False,
                summary="Task cancelled because user declined confirmation.",
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
                state=state,
            )

        # User approved confirmation -> resume execution
        task.transition_to(TaskStatus.EXECUTING)
        self._emit(AgentEventType.TASK_RESUMED, task.task_id, payload={"confirmed_step": target_step_id})

        if target_step:
            # Execute confirmed step
            obs = self.executor.execute_step(target_step, state, confirmed=True)
            state.record_observation(obs)
            if obs.success:
                self._emit(AgentEventType.STEP_COMPLETED, task.task_id, target_step.step_id)
            else:
                self._emit(AgentEventType.STEP_FAILED, task.task_id, target_step.step_id, payload={"error": obs.error})

        return self._execution_loop(state, start_time)

    def cancel(self, task_id: str) -> bool:
        """Cancel an in-flight or waiting task."""
        state = self._states.get(task_id)
        if not state:
            return False

        task = state.task
        if not task.is_terminal:
            task.transition_to(TaskStatus.CANCELLED, reason="Cancelled by user/agent request.")
            self._emit(AgentEventType.TASK_CANCELLED, task.task_id)
            return True
        return False

    def _execution_loop(self, state: AgentState, start_time: float) -> AgentResult:
        """Controlled dependency-aware execution loop."""
        task = state.task
        plan = state.plan
        task_id = task.task_id

        while not task.is_terminal:
            # Check task timeout
            elapsed_sec = time.perf_counter() - start_time
            if elapsed_sec > self.limits.task_timeout_sec:
                task.transition_to(TaskStatus.FAILED, reason="Task execution timed out.")
                task.error = f"Exceeded task timeout limit of {self.limits.task_timeout_sec}s."
                self._emit(AgentEventType.TASK_FAILED, task_id, payload={"error": task.error})
                break

            # Find ready steps whose dependencies have completed
            completed_ids = set(state.completed_steps)
            ready_steps = plan.get_ready_steps(completed_ids)

            if not ready_steps:
                # No steps ready to run. Check if all completed or if we are stuck
                if plan.is_all_completed():
                    eval_res = GoalEvaluator.evaluate(state)
                    if eval_res.is_complete and not task.is_terminal:
                        task.transition_to(TaskStatus.COMPLETED)
                        self._emit(AgentEventType.TASK_COMPLETED, task_id, payload={"summary": eval_res.summary})
                    break
                else:
                    # Stalled or circular deadlock
                    task.transition_to(TaskStatus.FAILED, reason="No remaining steps can be executed.")
                    task.error = "Unmet dependencies or failed prerequisite steps prevented further execution."
                    self._emit(AgentEventType.TASK_FAILED, task_id, payload={"error": task.error})
                    break

            # Execute the next ready step
            step = ready_steps[0]
            step.mark_executing()
            state.current_step_id = step.step_id

            self._emit(AgentEventType.STEP_STARTED, task_id, step.step_id, payload={"objective": step.objective})

            obs = self.executor.execute_step(step, state, confirmed=False)
            state.record_observation(obs)

            # Check for WAITING_CONFIRMATION suspension
            if obs.metadata.get("waiting_confirmation"):
                task.transition_to(TaskStatus.WAITING_CONFIRMATION)
                conf_id = obs.metadata.get("confirmation_id")
                msg = obs.metadata.get("message")
                self._emit(AgentEventType.STEP_WAITING_CONFIRMATION, task_id, step.step_id, payload={
                    "confirmation_id": conf_id,
                    "message": msg,
                })
                return AgentResult(
                    task_id=task_id,
                    status=task.status,
                    success=False,
                    summary="Task requires user confirmation before proceeding.",
                    observations=state.observations,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                    state=state,
                    waiting_confirmation=True,
                    confirmation_id=conf_id,
                    confirmation_message=msg,
                )

            # Check if step execution succeeded or failed
            if obs.success:
                self._emit(AgentEventType.STEP_COMPLETED, task_id, step.step_id, payload={"output": str(obs.output)[:200]})
            else:
                self._emit(AgentEventType.STEP_FAILED, task_id, step.step_id, payload={"error": obs.error})
                # Handle recovery
                failure_type = FailureClassifier.classify(obs.error, obs.metadata)
                action = RecoveryManager.determine_action(
                    failure_type=failure_type,
                    step=step,
                    total_retries=self._total_retries.get(task_id, 0),
                    limits=self.limits,
                )

                if action == RecoveryAction.RETRY:
                    self._total_retries[task_id] = self._total_retries.get(task_id, 0) + 1
                    step.status = StepStatus.PENDING
                    self._emit(AgentEventType.STEP_RETRIED, task_id, step.step_id, payload={"attempt": step.attempt_count})
                    continue
                elif action == RecoveryAction.FALLBACK_MODEL and step.model_requirement:
                    # Switch to fallback model requirement and retry
                    step.model_requirement["preferred_model"] = None
                    step.status = StepStatus.PENDING
                    continue
                else:
                    # Non-recoverable failure -> terminate task
                    task.transition_to(TaskStatus.FAILED, reason=obs.error or "Step execution failed")
                    task.error = obs.error
                    self._emit(AgentEventType.TASK_FAILED, task_id, payload={"error": obs.error})
                    break

            # Evaluate goal completion
            eval_result = GoalEvaluator.evaluate(state)
            if eval_result.is_complete:
                if not task.is_terminal:
                    task.transition_to(TaskStatus.COMPLETED)
                    self._emit(AgentEventType.TASK_COMPLETED, task_id, payload={"summary": eval_result.summary})
                break

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        success = (task.status == TaskStatus.COMPLETED)
        eval_final = GoalEvaluator.evaluate(state)
        summary = eval_final.summary if success else (task.error or "Task execution finished.")

        return AgentResult(
            task_id=task.task_id,
            status=task.status,
            success=success,
            summary=summary,
            observations=state.observations,
            duration_ms=duration_ms,
            state=state,
            error=task.error,
        )

    def _create_default_plan(self, task: AgentTask) -> AgentPlan:
        """Create a standard plan from the user request."""
        # Check if task specifies Rust capability or local tool directly
        tool_req = (
            task.context.get("tool_requirement") or
            task.context.get("parameters", {}).get("tool_requirement")
        )
        model_req = (
            task.context.get("model_requirement") or
            task.context.get("parameters", {}).get("model_requirement")
        )

        step = PlanStep(
            objective=task.goal or task.user_request,
            tool_requirement=tool_req,
            model_requirement=model_req,
            input_parameters=task.context.get("parameters", {}),
        )
        return AgentPlan(
            task_id=task.task_id,
            goal=task.goal or task.user_request,
            steps=[step],
        )

    def _emit(self, event_type: AgentEventType, task_id: str, step_id: Optional[str] = None, payload: Optional[Dict[str, Any]] = None) -> None:
        """Helper to emit structured events."""
        event = AgentEvent(
            event_type=event_type,
            task_id=task_id,
            step_id=step_id,
            payload=payload or {},
        )
        self.events.emit(event)
