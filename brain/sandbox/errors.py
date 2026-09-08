"""
Sandbox Error Classes
Provides typed exceptions for sandbox security violations, limits, timeouts, and backend faults.
"""

from typing import Optional, Dict, Any


class SandboxError(Exception):
    """Base exception for all sandbox-related errors."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class SandboxSecurityError(SandboxError):
    """Raised when code violates security policies (network, filesystem escape, subprocess creation)."""
    pass


class SandboxPathTraversalError(SandboxSecurityError):
    """Raised when an attempt is made to escape the sandbox workspace directory."""
    pass


class SandboxTimeoutError(SandboxError):
    """Raised when sandbox execution exceeds wall-clock execution limits."""
    pass


class SandboxResourceLimitError(SandboxError):
    """Raised when execution exceeds output, memory, or process count limits."""
    pass


class SandboxUnavailableError(SandboxError):
    """Raised when the requested sandbox backend is not available."""
    pass
