"""
Sandbox Execution Result Model
Structured outcome model returned by sandbox backends to the SandboxManager and UnifiedToolRuntime.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class SandboxExecutionResult:
    """Outcome of an isolated sandbox code execution."""
    execution_id: str
    success: bool
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    output: Any = None
    duration_ms: float = 0.0
    error: Optional[str] = None
    error_type: Optional[str] = None
    truncated: bool = False
    resource_usage: Dict[str, Any] = field(default_factory=dict)
    files_created: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def ok(
        cls,
        execution_id: str,
        stdout: str = "",
        output: Any = None,
        duration_ms: float = 0.0,
        files_created: Optional[List[str]] = None,
        truncated: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "SandboxExecutionResult":
        return cls(
            execution_id=execution_id,
            success=True,
            exit_code=0,
            stdout=stdout,
            stderr="",
            output=output if output is not None else stdout,
            duration_ms=duration_ms,
            error=None,
            error_type=None,
            truncated=truncated,
            files_created=files_created or [],
            metadata=metadata or {},
        )

    @classmethod
    def fail(
        cls,
        execution_id: str,
        error: str,
        error_type: str = "execution_error",
        exit_code: Optional[int] = -1,
        stdout: str = "",
        stderr: str = "",
        duration_ms: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "SandboxExecutionResult":
        return cls(
            execution_id=execution_id,
            success=False,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr or error,
            output=None,
            duration_ms=duration_ms,
            error=error,
            error_type=error_type,
            metadata=metadata or {},
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "success": self.success,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "output": self.output,
            "duration_ms": self.duration_ms,
            "error": self.error,
            "error_type": self.error_type,
            "truncated": self.truncated,
            "resource_usage": self.resource_usage,
            "files_created": self.files_created,
            "metadata": self.metadata,
        }
