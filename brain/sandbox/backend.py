"""
Sandbox Backend Interface, Subprocess Isolation, and Host Execution Implementation
Provides platform-independent backend contracts and concrete execution backends.
"""

from abc import ABC, abstractmethod
import os
import sys
import json
import time
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.results import SandboxExecutionResult
from brain.sandbox.health import SandboxHealth
from brain.sandbox.definitions import (
    SandboxHealthStatus,
    SandboxLifecycleState,
    SandboxSecurityLevel,
    SandboxBackendCapabilities,
)
from brain.sandbox.cancellation import SandboxCancellationManager
from brain.sandbox.errors import SandboxTimeoutError, SandboxUnavailableError, SandboxSecurityError


class SandboxBackend(ABC):
    """Abstract interface for all sandbox isolation and execution backends."""

    @property
    @abstractmethod
    def capabilities(self) -> SandboxBackendCapabilities:
        """Return backend isolation capabilities."""
        pass

    @property
    @abstractmethod
    def security_level(self) -> SandboxSecurityLevel:
        """Return backend security boundary level."""
        pass

    @abstractmethod
    def execute(self, request: SandboxExecutionRequest, workspace_dirs: Dict[str, Path]) -> SandboxExecutionResult:
        """Execute request inside isolation/execution boundary."""
        pass

    @abstractmethod
    def cancel(self, execution_id: str) -> bool:
        """Terminate in-flight execution."""
        pass

    @abstractmethod
    def check_health(self) -> SandboxHealth:
        """Perform non-destructive health check."""
        pass

    @abstractmethod
    def cleanup(self, execution_id: str) -> None:
        """Clean up backend resources for an execution."""
        pass


class SubprocessIsolationBackend(SandboxBackend):
    """
    Production-grade OS subprocess isolation backend.
    Enforces sanitized environments, process tree lifecycle, runner-level security hooks, and hard timeouts.
    Security Level: RUNTIME_CONTAINED.
    """

    def __init__(
        self,
        python_executable: Optional[str] = None,
        cancellation_manager: Optional[SandboxCancellationManager] = None,
    ):
        self.python_executable = python_executable or sys.executable
        self.cancellation = cancellation_manager or SandboxCancellationManager()
        self._health = SandboxHealth(available_languages=["python"])

    @property
    def capabilities(self) -> SandboxBackendCapabilities:
        return SandboxBackendCapabilities(
            filesystem_isolation=True,
            network_isolation=True,
            process_isolation=True,
            environment_isolation=True,
            resource_limits=True,
            process_tree_termination=True,
            native_os_isolation=False,
            security_level=SandboxSecurityLevel.RUNTIME_CONTAINED,
        )

    @property
    def security_level(self) -> SandboxSecurityLevel:
        return SandboxSecurityLevel.RUNTIME_CONTAINED

    def execute(self, request: SandboxExecutionRequest, workspace_dirs: Dict[str, Path]) -> SandboxExecutionResult:
        """Execute Python code in an isolated subprocess with hard limits."""
        start_time = time.perf_counter()
        exec_id = request.execution_id
        policy = request.get_effective_policy()
        limits = policy.limits

        # 1. Resolve Runner Path
        runner_path = Path(__file__).parent / "runner.py"
        if not runner_path.exists():
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=f"Sandbox runner script not found at '{runner_path}'",
                error_type="backend_error",
                duration_ms=duration_ms,
            )

        # 2. Write payload to input/payload.json
        input_dir = workspace_dirs["input"]
        work_dir = workspace_dirs["work"]
        output_dir = workspace_dirs["output"]
        payload_file = input_dir / "payload.json"
        result_file = output_dir / "result.json"

        payload_data = {
            "execution_id": exec_id,
            "source_code": request.source_code,
            "arguments": request.arguments,
            "allow_network": policy.network.allow_network,
            "allow_subprocess": policy.process.allow_subprocesses,
            "work_dir": str(work_dir),
            "output_result_file": str(result_file),
        }

        try:
            with open(payload_file, "w", encoding="utf-8") as f:
                json.dump(payload_data, f)
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=f"Failed to write sandbox payload: {str(e)}",
                error_type="filesystem_error",
                duration_ms=duration_ms,
            )

        # 3. Build sanitized environment
        env = policy.environment.build_sanitized_environment(str(work_dir))

        # 4. Resolve effective timeout
        effective_timeout = limits.get_effective_timeout(request.timeout)

        # 5. Spawn isolated subprocess
        cmd = [self.python_executable, str(runner_path), str(payload_file)]
        creationflags = 0
        if sys.platform == "win32":
            # CREATE_NO_WINDOW (0x08000000) and CREATE_NEW_PROCESS_GROUP (0x00000200)
            creationflags = 0x08000000 | 0x00000200

        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(work_dir),
                env=env,
                text=True,
                encoding="utf-8",
                creationflags=creationflags,
            )
            self.cancellation.register_process(exec_id, proc)

            stdin_data = request.stdin or ""
            stdout_str, stderr_str = proc.communicate(input=stdin_data, timeout=effective_timeout)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            # Check for result file generated by runner
            parsed_result = None
            if result_file.exists():
                try:
                    with open(result_file, "r", encoding="utf-8") as f:
                        parsed_result = json.load(f)
                except Exception:
                    pass

            raw_stdout = (parsed_result.get("stdout") if parsed_result and parsed_result.get("stdout") is not None else stdout_str) or ""
            raw_stderr = (parsed_result.get("stderr") if parsed_result and parsed_result.get("stderr") is not None else stderr_str) or ""

            # Output truncation checks
            truncated = False
            if len(raw_stdout.encode("utf-8")) > limits.max_stdout_bytes:
                raw_stdout = raw_stdout.encode("utf-8")[:limits.max_stdout_bytes].decode("utf-8", errors="ignore") + "\n[OUTPUT TRUNCATED]"
                truncated = True
            if len(raw_stderr.encode("utf-8")) > limits.max_stderr_bytes:
                raw_stderr = raw_stderr.encode("utf-8")[:limits.max_stderr_bytes].decode("utf-8", errors="ignore") + "\n[STDERR TRUNCATED]"
                truncated = True

            # Scan files created in work/ and output/
            files_created = policy.filesystem.list_output_files(workspace_dirs["root"])

            if parsed_result:
                success = parsed_result.get("success", proc.returncode == 0)
                err_msg = parsed_result.get("error") if not success else None
                err_type = parsed_result.get("error_type") if not success else None
                output_val = parsed_result.get("output")
                if output_val is None or output_val == "":
                    output_val = raw_stdout.strip()

                res = SandboxExecutionResult(
                    execution_id=exec_id,
                    success=success,
                    exit_code=proc.returncode,
                    stdout=raw_stdout,
                    stderr=raw_stderr,
                    output=output_val,
                    duration_ms=duration_ms,
                    error=err_msg,
                    error_type=err_type,
                    truncated=truncated,
                    files_created=files_created,
                )
            else:
                success = (proc.returncode == 0)
                res = SandboxExecutionResult(
                    execution_id=exec_id,
                    success=success,
                    exit_code=proc.returncode,
                    stdout=raw_stdout,
                    stderr=raw_stderr,
                    output=raw_stdout.strip() if success else None,
                    duration_ms=duration_ms,
                    error=raw_stderr.strip() if not success else None,
                    error_type="execution_error" if not success else None,
                    truncated=truncated,
                    files_created=files_created,
                )

            is_sec_viol = (res.error_type == "security_denied" or "SecurityPolicyViolation" in res.stderr)
            self._health.record_execution(res.success, duration_ms, res.error, is_sec_viol)
            return res

        except subprocess.TimeoutExpired:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            self.cancellation.cancel(exec_id)
            err_msg = f"Sandbox execution timed out after {effective_timeout}s."
            self._health.record_execution(False, duration_ms, err_msg)
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=err_msg,
                error_type="timeout",
                exit_code=-1,
                duration_ms=duration_ms,
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            err_msg = f"Sandbox execution failed: {str(e)}"
            self._health.record_execution(False, duration_ms, err_msg)
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=err_msg,
                error_type="backend_error",
                duration_ms=duration_ms,
            )

        finally:
            self.cancellation.unregister_process(exec_id)

    def cancel(self, execution_id: str) -> bool:
        """Cancel running execution."""
        return self.cancellation.cancel(execution_id)

    def check_health(self) -> SandboxHealth:
        """Return health status."""
        return self._health

    def cleanup(self, execution_id: str) -> None:
        """Clean up process tracking."""
        self.cancellation.unregister_process(execution_id)


class HostExecutionBackend(SandboxBackend):
    """
    Direct host execution backend.
    Executes Python code on the host without in-process runtime containment.
    SECURITY LEVEL: UNCONFINED.
    Requires explicit administrative authorization and mandatory confirmation for model-generated code.
    """

    def __init__(
        self,
        python_executable: Optional[str] = None,
        cancellation_manager: Optional[SandboxCancellationManager] = None,
    ):
        self.python_executable = python_executable or sys.executable
        self.cancellation = cancellation_manager or SandboxCancellationManager()
        self._health = SandboxHealth(available_languages=["python"])

    @property
    def capabilities(self) -> SandboxBackendCapabilities:
        return SandboxBackendCapabilities(
            filesystem_isolation=False,
            network_isolation=False,
            process_isolation=False,
            environment_isolation=False,
            resource_limits=True,
            process_tree_termination=True,
            native_os_isolation=False,
            security_level=SandboxSecurityLevel.UNCONFINED,
        )

    @property
    def security_level(self) -> SandboxSecurityLevel:
        return SandboxSecurityLevel.UNCONFINED

    def execute(self, request: SandboxExecutionRequest, workspace_dirs: Dict[str, Path]) -> SandboxExecutionResult:
        """Execute Python code directly on the host using a temporary script file."""
        start_time = time.perf_counter()
        exec_id = request.execution_id
        policy = request.get_effective_policy()
        limits = policy.limits

        work_dir = workspace_dirs["work"]
        script_file = work_dir / "host_script.py"

        try:
            with open(script_file, "w", encoding="utf-8") as f:
                f.write(request.source_code)
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=f"Failed to write host execution script: {str(e)}",
                error_type="filesystem_error",
                duration_ms=duration_ms,
            )

        effective_timeout = limits.get_effective_timeout(request.timeout)
        cmd = [self.python_executable, str(script_file)] + list(request.arguments)

        creationflags = 0
        if sys.platform == "win32":
            creationflags = 0x08000000 | 0x00000200

        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(work_dir),
                text=True,
                encoding="utf-8",
                creationflags=creationflags,
            )
            self.cancellation.register_process(exec_id, proc)

            stdin_data = request.stdin or ""
            stdout_str, stderr_str = proc.communicate(input=stdin_data, timeout=effective_timeout)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            raw_stdout = stdout_str or ""
            raw_stderr = stderr_str or ""

            # Output truncation checks
            truncated = False
            if len(raw_stdout.encode("utf-8")) > limits.max_stdout_bytes:
                raw_stdout = raw_stdout.encode("utf-8")[:limits.max_stdout_bytes].decode("utf-8", errors="ignore") + "\n[OUTPUT TRUNCATED]"
                truncated = True
            if len(raw_stderr.encode("utf-8")) > limits.max_stderr_bytes:
                raw_stderr = raw_stderr.encode("utf-8")[:limits.max_stderr_bytes].decode("utf-8", errors="ignore") + "\n[STDERR TRUNCATED]"
                truncated = True

            files_created = policy.filesystem.list_output_files(workspace_dirs["root"])
            success = (proc.returncode == 0)

            res = SandboxExecutionResult(
                execution_id=exec_id,
                success=success,
                exit_code=proc.returncode,
                stdout=raw_stdout,
                stderr=raw_stderr,
                output=raw_stdout.strip() if success else None,
                duration_ms=duration_ms,
                error=raw_stderr.strip() if not success else None,
                error_type="execution_error" if not success else None,
                truncated=truncated,
                files_created=files_created,
            )
            self._health.record_execution(res.success, duration_ms, res.error, False)
            return res

        except subprocess.TimeoutExpired:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            self.cancellation.cancel(exec_id)
            err_msg = f"Host execution timed out after {effective_timeout}s."
            self._health.record_execution(False, duration_ms, err_msg)
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=err_msg,
                error_type="timeout",
                exit_code=-1,
                duration_ms=duration_ms,
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            err_msg = f"Host execution failed: {str(e)}"
            self._health.record_execution(False, duration_ms, err_msg)
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=err_msg,
                error_type="backend_error",
                duration_ms=duration_ms,
            )

        finally:
            self.cancellation.unregister_process(exec_id)

    def cancel(self, execution_id: str) -> bool:
        """Cancel running host execution."""
        return self.cancellation.cancel(execution_id)

    def check_health(self) -> SandboxHealth:
        """Return health status."""
        return self._health

    def cleanup(self, execution_id: str) -> None:
        """Clean up process tracking."""
        self.cancellation.unregister_process(execution_id)
