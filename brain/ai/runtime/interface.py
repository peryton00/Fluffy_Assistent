"""
AI Model Runtime Interface
Primary protocol connecting the Agent layer to local inference backends.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import threading
from typing import Iterator, List, Optional, Dict, Any

from brain.ai.runtime.health import RuntimeHealth


@dataclass
class CancellationHandle:
    """Thread-safe cancellation handle for in-flight inference operations."""
    _cancelled: bool = False
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def cancel(self) -> None:
        """Signal cancellation."""
        with self._lock:
            self._cancelled = True

    @property
    def is_cancelled(self) -> bool:
        """Check if cancellation has been requested."""
        with self._lock:
            return self._cancelled


@dataclass
class GenerationRequest:
    """Request payload for model generation."""
    prompt: str
    model_id: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.7
    top_p: float = 0.95
    stop_sequences: List[str] = field(default_factory=list)
    task_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationResponse:
    """Response payload returned upon completion of model generation."""
    text: str
    model_id: str
    backend_id: str
    finish_reason: str = "stop"
    usage: Dict[str, int] = field(default_factory=dict)
    latency_ms: float = 0.0


@dataclass
class GenerationChunk:
    """Incremental chunk yielded during streaming inference."""
    delta: str
    model_id: str
    is_final: bool = False
    finish_reason: Optional[str] = None


class AIModelRuntime(ABC):
    """
    Abstract AI Model Runtime interface.
    The single point of entry for the Agent layer to interact with local AI models.
    """

    @abstractmethod
    def load(self, model_id: str, options: Optional[Dict[str, Any]] = None) -> bool:
        """
        Load a model into memory/accelerator.
        Transitions state: AVAILABLE -> LOADING -> READY.
        """
        pass

    @abstractmethod
    def unload(self, model_id: str) -> bool:
        """
        Unload a model from memory.
        Transitions state: READY/LOADED -> UNLOADING -> UNLOADED.
        """
        pass

    @abstractmethod
    def generate(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> GenerationResponse:
        """
        Execute synchronous/non-streaming inference.
        """
        pass

    @abstractmethod
    def stream(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> Iterator[GenerationChunk]:
        """
        Execute streaming inference yielding incremental token chunks.
        """
        pass

    @abstractmethod
    def health(self) -> RuntimeHealth:
        """
        Query runtime diagnostic health and hardware status.
        """
        pass

    @abstractmethod
    def cancel(self, task_id: str) -> bool:
        """
        Cancel an active task by task_id.
        """
        pass
