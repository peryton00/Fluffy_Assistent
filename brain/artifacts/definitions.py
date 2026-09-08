"""
Artifact Subsystem Definitions and Enumerations
Defines artifact types, lifecycle states, overwrite policies, and health metrics for local deliverable generation.
"""

from enum import Enum


class ArtifactType(str, Enum):
    """Supported artifact formats."""
    TXT = "txt"
    MARKDOWN = "markdown"
    JSON = "json"
    CSV = "csv"
    DOCX = "docx"
    XLSX = "xlsx"
    PPTX = "pptx"
    CODE = "code"


class ArtifactStatus(str, Enum):
    """Artifact creation and lifecycle status."""
    REQUESTED = "requested"
    GENERATING = "generating"
    VALIDATING = "validating"
    COMMITTING = "committing"
    READY = "ready"
    FAILED = "failed"
    DELETED = "deleted"


class OverwritePolicy(str, Enum):
    """Policy for handling destination filename collisions."""
    DENY = "deny"        # Refuse to overwrite; fail with error
    REPLACE = "replace"  # Atomically overwrite existing file with backup protection
    VERSION = "version"  # Create a numbered version (e.g. filename (1).ext)


class ValidationStatus(str, Enum):
    """Status of post-generation structural validation."""
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ArtifactHealthStatus(str, Enum):
    """Health status of the artifact generation subsystem."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"
