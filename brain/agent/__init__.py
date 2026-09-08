"""
Agent & Orchestration Package for Fluffy Assistant
"""

# Production Agent Orchestration Architecture
from brain.agent.task import TaskStatus, AgentTask
from brain.agent.step import StepStatus, PlanStep
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.observation import StepObservation
from brain.agent.state import AgentState
from brain.agent.limits import AgentLimits
from brain.agent.events import AgentEventType, AgentEvent, EventEmitter
from brain.agent.recovery import FailureType, RecoveryAction, FailureClassifier, RecoveryManager
from brain.agent.evaluator import GoalEvaluator, EvaluationResult
from brain.agent.execution import StepExecutor
from brain.agent.interface import AgentResult, AgentOrchestratorInterface
from brain.agent.orchestrator import AgentOrchestrator

# Legacy & Parser Compatibility Exports
from brain.agent.command_parser import Intent, Command, CommandParser
from brain.agent.llm_command_parser import (
    CommandUnderstanding,
    LLMCommandParser,
    get_llm_parser,
)
from brain.agent.intent_router import IntentRouter, get_intent_router
from brain.agent.interpreter import interpret
from brain.agent.recommender import recommend

__all__ = [
    # Production Agent Orchestration
    "TaskStatus",
    "AgentTask",
    "StepStatus",
    "PlanStep",
    "AgentPlan",
    "PlanValidator",
    "StepObservation",
    "AgentState",
    "AgentLimits",
    "AgentEventType",
    "AgentEvent",
    "EventEmitter",
    "FailureType",
    "RecoveryAction",
    "FailureClassifier",
    "RecoveryManager",
    "GoalEvaluator",
    "EvaluationResult",
    "StepExecutor",
    "AgentResult",
    "AgentOrchestratorInterface",
    "AgentOrchestrator",
    # Legacy & Parser
    "Intent",
    "Command",
    "CommandParser",
    "CommandUnderstanding",
    "LLMCommandParser",
    "get_llm_parser",
    "IntentRouter",
    "get_intent_router",
    "interpret",
    "recommend",
]
