"""
Unified Sandbox Security Policy
Integrates execution modes, resource limits, filesystem boundaries, environment sanitization, network policy, and process containment.
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass, field

from brain.sandbox.definitions import SandboxExecutionMode
from brain.sandbox.limits import SandboxLimits
from brain.sandbox.filesystem import SandboxFilesystemPolicy
from brain.sandbox.environment import SandboxEnvironmentPolicy
from brain.sandbox.network import SandboxNetworkPolicy
from brain.sandbox.process import SandboxProcessPolicy


@dataclass
class SandboxPolicy:
    """
    Complete security, execution mode, and resource policy for a sandbox execution.
    """
    mode: SandboxExecutionMode = SandboxExecutionMode.SECURE
    allow_host_execution: bool = False
    limits: SandboxLimits = field(default_factory=SandboxLimits)
    filesystem: SandboxFilesystemPolicy = field(default_factory=SandboxFilesystemPolicy)
    environment: SandboxEnvironmentPolicy = field(default_factory=SandboxEnvironmentPolicy)
    network: SandboxNetworkPolicy = field(default_factory=SandboxNetworkPolicy)
    process: SandboxProcessPolicy = field(default_factory=SandboxProcessPolicy)

    def validate(self) -> None:
        """Validate internal policy consistency."""
        if self.limits.timeout_seconds <= 0:
            self.limits.timeout_seconds = 5.0
        if self.limits.timeout_seconds > self.limits.max_timeout_seconds:
            self.limits.timeout_seconds = self.limits.max_timeout_seconds

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode.value,
            "allow_host_execution": self.allow_host_execution,
            "limits": self.limits.to_dict(),
            "network": self.network.to_dict(),
            "process": self.process.to_dict(),
        }

    @classmethod
    def default_strict(cls) -> "SandboxPolicy":
        """Construct the default high-security offline strict policy (SECURE mode)."""
        return cls(
            mode=SandboxExecutionMode.SECURE,
            allow_host_execution=False,
            limits=SandboxLimits(),
            filesystem=SandboxFilesystemPolicy(),
            environment=SandboxEnvironmentPolicy(),
            network=SandboxNetworkPolicy(allow_network=False),
            process=SandboxProcessPolicy(allow_subprocesses=False),
        )

    @classmethod
    def restricted(cls) -> "SandboxPolicy":
        """
        Construct a conservative RESTRICTED policy.
        Preserves isolated workspace, network denial, process creation denial, and environment sanitization.
        """
        return cls(
            mode=SandboxExecutionMode.RESTRICTED,
            allow_host_execution=False,
            limits=SandboxLimits(),
            filesystem=SandboxFilesystemPolicy(),
            environment=SandboxEnvironmentPolicy(),
            network=SandboxNetworkPolicy(allow_network=False),
            process=SandboxProcessPolicy(allow_subprocesses=False),
        )

    @classmethod
    def host(cls, allow_host_execution: bool = False) -> "SandboxPolicy":
        """
        Construct a HOST execution policy.
        Requires explicit administrative enablement (allow_host_execution=True).
        """
        return cls(
            mode=SandboxExecutionMode.HOST,
            allow_host_execution=allow_host_execution,
            limits=SandboxLimits(),
            filesystem=SandboxFilesystemPolicy(),
            environment=SandboxEnvironmentPolicy(),
            network=SandboxNetworkPolicy(allow_network=True),
            process=SandboxProcessPolicy(allow_subprocesses=True),
        )
