"""
Artifact Runtime Facade
The central capability facade orchestrating deliverable generation, structural validation, and atomic commits.
"""

import time
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any, Union

from brain.artifacts.definitions import (
    ArtifactType,
    ArtifactStatus,
    ValidationStatus,
    ArtifactHealthStatus,
    OverwritePolicy,
)
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.models import ArtifactMetadata, ArtifactManifestRecord
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.results import ArtifactResult
from brain.artifacts.health import ArtifactHealth
from brain.artifacts.permissions import ArtifactPermissionPolicy
from brain.artifacts.storage.paths import ArtifactPathManager
from brain.artifacts.storage.atomic import AtomicWriteTransaction
from brain.artifacts.storage.manifest import ArtifactManifestManager
from brain.artifacts.lifecycle import ArtifactRegistry


class ArtifactRuntime:
    """
    Central local-first Artifact Generation Runtime for Fluffy Assistant.
    Enforces transactional, validated deliverable creation across formats.
    """

    def __init__(
        self,
        config: Optional[ArtifactConfig] = None,
        registry: Optional[ArtifactRegistry] = None,
        manifest_manager: Optional[ArtifactManifestManager] = None,
    ):
        self.config = config or ArtifactConfig()
        self.registry = registry or ArtifactRegistry()
        self.manifest = manifest_manager or (
            ArtifactManifestManager(self.config.get_manifest_db_path()) if self.config.enable_manifest else None
        )

    def generate_artifact(self, request: ArtifactRequest) -> ArtifactResult:
        """
        Execute deliverable generation request:
        1. Validate destination path safety.
        2. Resolve generator and validator.
        3. Inherit and resolve security classification.
        4. Execute atomic generation and validation transaction.
        5. Record audit manifest.
        6. Return ArtifactResult.
        """
        start_time = time.perf_counter()
        artifact_id = f"art_{uuid.uuid4().hex[:12]}"

        # 1. Target Directory & Path Safety
        dest_dir_str = request.destination_dir if request.destination_dir else str(self.config.get_effective_workspace_dir())
        if not ArtifactPathManager.is_safe_destination(dest_dir_str, workspace_root=self.config.workspace_dir):
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ArtifactResult(
                success=False,
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                status=ArtifactStatus.FAILED,
                validation_status=ValidationStatus.FAILED,
                error=f"Access denied: Destination path failed security validation: {dest_dir_str}",
                duration_ms=duration_ms,
            )

        base_dir = Path(dest_dir_str).resolve()

        # 2. Extension & Filename resolution
        default_ext = f".{request.artifact_type.value}"
        if request.artifact_type == ArtifactType.MARKDOWN:
            default_ext = ".md"
        elif request.artifact_type == ArtifactType.CODE and request.language:
            lang_map = {
                "python": ".py", "rust": ".rs", "javascript": ".js",
                "typescript": ".ts", "cpp": ".cpp", "c": ".c",
                "java": ".java", "html": ".html", "css": ".css",
            }
            default_ext = lang_map.get(request.language.lower(), ".py")

        clean_filename = ArtifactPathManager.sanitize_filename(request.name, default_ext=default_ext)
        target_path = base_dir / clean_filename

        # 3. Resolve Classification
        effective_classification = ArtifactPermissionPolicy.resolve_classification(
            explicit_classification=request.classification,
        )

        # 4. Resolve Generator and Validator
        generator = self.registry.get_generator(request.artifact_type)
        if not generator:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ArtifactResult(
                success=False,
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                status=ArtifactStatus.FAILED,
                validation_status=ValidationStatus.FAILED,
                error=f"No generator found for artifact type '{request.artifact_type.value}'",
                duration_ms=duration_ms,
            )

        if not generator.is_available:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ArtifactResult(
                success=False,
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                status=ArtifactStatus.FAILED,
                validation_status=ValidationStatus.FAILED,
                error=f"Generator '{generator.name}' is unavailable (missing local dependencies)",
                duration_ms=duration_ms,
            )

        validator = self.registry.get_validator(request.artifact_type)

        # 5. Execute Atomic Transaction
        def write_callback(temp_file: Path) -> None:
            generator.generate_to_path(request, temp_file)

        def validate_callback(temp_file: Path) -> bool:
            if not validator:
                return True
            return validator.validate(temp_file)

        try:
            final_path, content_hash, size_bytes = AtomicWriteTransaction.commit_transaction(
                target_path=target_path,
                write_callback=write_callback,
                validate_callback=validate_callback,
                overwrite_policy=request.overwrite_policy,
            )
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            # 6. Record Audit Manifest
            record = ArtifactManifestRecord(
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                file_path=str(final_path),
                filename=final_path.name,
                size_bytes=size_bytes,
                content_hash=content_hash,
                created_at=time.time(),
                status=ArtifactStatus.READY,
                validation_status=ValidationStatus.PASSED,
                classification=effective_classification,
                generator_name=generator.name,
                source_documents=request.sources,
                metadata=request.metadata.to_dict() if request.metadata else {},
            )
            if self.manifest:
                self.manifest.record_artifact(record)

            return ArtifactResult(
                success=True,
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                file_path=str(final_path),
                filename=final_path.name,
                size_bytes=size_bytes,
                content_hash=content_hash,
                status=ArtifactStatus.READY,
                validation_status=ValidationStatus.PASSED,
                classification=effective_classification,
                sources=request.sources,
                duration_ms=duration_ms,
                metadata=record.metadata,
            )

        except FileExistsError as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ArtifactResult(
                success=False,
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                status=ArtifactStatus.FAILED,
                validation_status=ValidationStatus.FAILED,
                error=str(e),
                duration_ms=duration_ms,
            )
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ArtifactResult(
                success=False,
                artifact_id=artifact_id,
                artifact_type=request.artifact_type,
                status=ArtifactStatus.FAILED,
                validation_status=ValidationStatus.FAILED,
                error=f"Artifact creation failed: {str(e)}",
                duration_ms=duration_ms,
            )

    def check_health(self) -> ArtifactHealth:
        """Perform non-destructive health diagnostics."""
        matrix = self.registry.get_availability_matrix()
        all_avail = all(matrix.values())
        any_avail = any(matrix.values())

        if all_avail:
            status = ArtifactHealthStatus.HEALTHY
        elif any_avail:
            status = ArtifactHealthStatus.DEGRADED
        else:
            status = ArtifactHealthStatus.UNAVAILABLE

        total_count = self.manifest.count_artifacts() if self.manifest else 0

        return ArtifactHealth(
            status=status,
            supported_formats=[t.value for t in self.registry.list_supported_types()],
            generator_availability=matrix,
            is_offline_compliant=True,
            total_artifacts_generated=total_count,
            last_checked=time.time(),
        )


# Global singleton
_global_artifact_runtime: Optional[ArtifactRuntime] = None


def get_artifact_runtime() -> ArtifactRuntime:
    """Retrieve global ArtifactRuntime singleton."""
    global _global_artifact_runtime
    if _global_artifact_runtime is None:
        _global_artifact_runtime = ArtifactRuntime()
    return _global_artifact_runtime
