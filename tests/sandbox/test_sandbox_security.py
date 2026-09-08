"""
Adversarial Security Test Suite for Secure Code Sandbox (Phase 2E)
Executes hostile attack patterns against the sandbox isolation backend and asserts strict containment.
"""

import os
import sys
import time
import unittest
from pathlib import Path

from brain.sandbox.manager import SandboxManager
from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.definitions import SandboxLanguage, SandboxProvenance
from brain.sandbox.policy import SandboxPolicy
from brain.sandbox.limits import SandboxLimits


class TestSandboxSecurity(unittest.TestCase):
    """Adversarial security validation test suite."""

    def setUp(self):
        self.manager = SandboxManager()

    def test_01_legitimate_computation_success(self):
        """Verify normal mathematical computation produces accurate output."""
        code = """
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print(f"fib(20) = {fib(20)}")
result = fib(20)
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)
        self.assertTrue(res.success, f"Failed: {res.error}")
        self.assertIn("fib(20) = 6765", res.stdout)
        self.assertEqual(res.output, 6765)

    def test_02_filesystem_escape_blocked(self):
        """Hostile attempt to write or read outside sandbox workspace must fail."""
        code = """
try:
    with open("../../fluffy_escape_test.txt", "w") as f:
        f.write("escaped")
    print("ESCAPE_SUCCEEDED")
except Exception as e:
    print(f"FILESYSTEM_ACCESS_DENIED: {type(e).__name__}")
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)
        # Verify file was not written to outer directory
        self.assertFalse(os.path.exists("../../fluffy_escape_test.txt"))
        self.assertNotIn("ESCAPE_SUCCEEDED", res.stdout)

    def test_03_network_and_localhost_socket_blocked(self):
        """Hostile attempt to create raw socket or reach localhost ports must be blocked."""
        code = """
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("127.0.0.1", 9002))
    print("SOCKET_CONNECTED")
except Exception as e:
    print(f"SOCKET_BLOCKED: {type(e).__name__} - {str(e)}")
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)
        self.assertNotIn("SOCKET_CONNECTED", res.stdout)
        self.assertIn("SOCKET_BLOCKED", res.stdout)
        self.assertIn("PermissionError", res.stdout)

    def test_04_subprocess_spawning_blocked(self):
        """Hostile attempt to spawn subprocess or execute shell command must be blocked."""
        code = """
import subprocess
try:
    subprocess.run(["cmd.exe", "/c", "echo pwned"])
    print("SUBPROCESS_EXECUTED")
except Exception as e:
    print(f"SUBPROCESS_BLOCKED: {type(e).__name__} - {str(e)}")
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)
        self.assertNotIn("SUBPROCESS_EXECUTED", res.stdout)
        self.assertIn("SUBPROCESS_BLOCKED", res.stdout)
        self.assertIn("PermissionError", res.stdout)

    def test_05_os_system_shell_blocked(self):
        """Hostile attempt to invoke os.system or os.popen must be blocked."""
        code = """
import os
try:
    os.system("echo pwned")
    print("SHELL_EXECUTED")
except Exception as e:
    print(f"SHELL_BLOCKED: {type(e).__name__} - {str(e)}")
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)
        self.assertNotIn("SHELL_EXECUTED", res.stdout)
        self.assertIn("SHELL_BLOCKED", res.stdout)
        self.assertIn("PermissionError", res.stdout)

    def test_06_environment_secrets_sanitized(self):
        """Hostile attempt to enumerate host secrets and credentials must find nothing."""
        # Inject host secret before execution
        os.environ["FLUFFY_PRODUCTION_SECRET"] = "secret_token_12345"
        try:
            code = """
import os
secret = os.environ.get("FLUFFY_PRODUCTION_SECRET")
userprofile = os.environ.get("USERPROFILE")
print(f"SECRET={secret}")
print(f"USERPROFILE={userprofile}")
"""
            req = SandboxExecutionRequest(source_code=code, timeout=5.0)
            res = self.manager.execute(req)
            self.assertTrue(res.success)
            self.assertIn("SECRET=None", res.stdout)
            self.assertIn("USERPROFILE=None", res.stdout)
            self.assertNotIn("secret_token_12345", res.stdout)
        finally:
            os.environ.pop("FLUFFY_PRODUCTION_SECRET", None)

    def test_07_dynamic_import_bypass_blocked(self):
        """Hostile attempt to use __import__ to bypass import inspection must be blocked."""
        code = """
try:
    sub = __import__("subprocess")
    sub.Popen(["echo", "pwned"])
    print("DYNAMIC_IMPORT_SUCCEEDED")
except Exception as e:
    print(f"DYNAMIC_IMPORT_CONTAINED: {type(e).__name__} - {str(e)}")
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)
        self.assertNotIn("DYNAMIC_IMPORT_SUCCEEDED", res.stdout)
        self.assertIn("DYNAMIC_IMPORT_CONTAINED", res.stdout)
        self.assertIn("PermissionError", res.stdout)

    def test_08_infinite_loop_timeout_enforced(self):
        """Infinite loop must be terminated deterministically by the outer timeout."""
        code = """
import time
while True:
    time.sleep(0.1)
"""
        start = time.perf_counter()
        req = SandboxExecutionRequest(source_code=code, timeout=1.0)
        res = self.manager.execute(req)
        elapsed = time.perf_counter() - start

        self.assertFalse(res.success)
        self.assertEqual(res.error_type, "timeout")
        self.assertLess(elapsed, 4.0, "Timeout should kill execution within bounds")

    def test_09_massive_output_truncated(self):
        """Massive stdout generation must be truncated to limits."""
        code = """
for i in range(50000):
    print(f"Spam line {i} with lots of data to exceed limit")
"""
        policy = SandboxPolicy.default_strict()
        policy.limits.max_stdout_bytes = 4096  # 4 KB limit for test
        req = SandboxExecutionRequest(source_code=code, policy=policy, timeout=5.0)
        res = self.manager.execute(req)

        self.assertTrue(res.success)
        self.assertTrue(res.truncated)
        self.assertIn("[OUTPUT TRUNCATED]", res.stdout)
        self.assertLessEqual(len(res.stdout.encode("utf-8")), 5000)

    def test_10_critical_composite_multi_vector_attack(self):
        """Composite attack vector attempting filesystem escape, subprocess, socket, and secret exfiltration."""
        code = """
results = {}

# Vector 1: Filesystem
try:
    with open("../secret_escape.txt", "w") as f:
        f.write("exfiltrated")
    results["fs"] = "UNSAFE"
except Exception as e:
    results["fs"] = "CONTAINED"

# Vector 2: Socket
try:
    import socket
    s = socket.socket()
    s.connect(("127.0.0.1", 9002))
    results["net"] = "UNSAFE"
except Exception as e:
    results["net"] = "CONTAINED"

# Vector 3: Process
try:
    import subprocess
    subprocess.Popen(["notepad.exe"])
    results["proc"] = "UNSAFE"
except Exception as e:
    results["proc"] = "CONTAINED"

# Vector 4: Env
import os
if os.environ.get("FLUFFY_PRODUCTION_SECRET"):
    results["env"] = "UNSAFE"
else:
    results["env"] = "CONTAINED"

print("AUDIT_REPORT:", results)
output = results
"""
        req = SandboxExecutionRequest(source_code=code, timeout=5.0)
        res = self.manager.execute(req)

        self.assertTrue(res.success)
        self.assertIn("'fs': 'CONTAINED'", res.stdout)
        self.assertIn("'net': 'CONTAINED'", res.stdout)
        self.assertIn("'proc': 'CONTAINED'", res.stdout)
        self.assertIn("'env': 'CONTAINED'", res.stdout)
        self.assertNotIn("UNSAFE", res.stdout)

        # Confirm sandbox remains operational for subsequent legitimate job
        followup_req = SandboxExecutionRequest(source_code="print('RECOVERY_OK')", timeout=5.0)
        followup_res = self.manager.execute(followup_req)
        self.assertTrue(followup_res.success)
        self.assertIn("RECOVERY_OK", followup_res.stdout)


if __name__ == "__main__":
    unittest.main()
