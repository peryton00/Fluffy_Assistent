"""
Sandbox Execution Request Model
Explicit, typed model for requesting untrusted code execution.
"""

import uuid
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional

from brain.sandbox.definitions import SandboxLanguage, SandboxProvenance, SandboxExecutionMode
from brain.sandbox.policy import SandboxPolicy


@dataclass
class SandboxExecutionRequest:
    """Typed request representing an untrusted code execution job."""
    source_code: str
    language: SandboxLanguage = SandboxLanguage.PYTHON
    execution_id: str = field(default_factory=lambda: f"sbx_{uuid.uuid4().hex[:12]}")
    mode: SandboxExecutionMode = SandboxExecutionMode.SECURE
    arguments: List[str] = field(default_factory=list)
    stdin: Optional[str] = None
    provenance: SandboxProvenance = SandboxProvenance.MODEL
    policy: Optional[SandboxPolicy] = None
    timeout: Optional[float] = None
    task_id: Optional[str] = None
    step_id: Optional[str] = None
    correlation_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def get_effective_policy(self) -> SandboxPolicy:
        """Return explicitly set policy or default policy corresponding to requested mode."""
        if self.policy is not None:
            return self.policy

        if self.mode == SandboxExecutionMode.RESTRICTED:
            self.policy = SandboxPolicy.restricted()
        elif self.mode == SandboxExecutionMode.HOST:
            self.policy = SandboxPolicy.host(allow_host_execution=False)
        else:
            self.policy = SandboxPolicy.default_strict()

        return self.policy

    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "language": self.language.value,
            "mode": self.mode.value,
            "source_code": self.source_code,
            "arguments": self.arguments,
            "stdin": self.stdin,
            "provenance": self.provenance.value,
            "timeout": self.timeout,
            "task_id": self.task_id,
            "step_id": self.step_id,
            "correlation_id": self.correlation_id,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SandboxExecutionRequest":
        lang_str = data.get("language", "python")
        lang = SandboxLanguage(lang_str) if lang_str in SandboxLanguage._value2member_map_ else SandboxLanguage.PYTHON
        
        mode_str = data.get("mode", "secure")
        mode = SandboxExecutionMode(mode_str) if mode_str in SandboxExecutionMode._value2member_map_ else SandboxExecutionMode.SECURE

        prov_str = data.get("provenance", "model")
        prov = SandboxProvenance(prov_str) if prov_str in SandboxProvenance._value2member_map_ else SandboxProvenance.MODEL

        return cls(
            source_code=data.get("source_code", data.get("code", "")),
            language=lang,
            execution_id=data.get("execution_id", f"sbx_{uuid.uuid4().hex[:12]}"),
            mode=mode,
            arguments=data.get("arguments", []),
            stdin=data.get("stdin"),
            provenance=prov,
            timeout=float(data["timeout"]) if "timeout" in data and data["timeout"] is not None else None,
            task_id=data.get("task_id"),
            step_id=data.get("step_id"),
            correlation_id=data.get("correlation_id"),
            metadata=data.get("metadata", {}),
        )
