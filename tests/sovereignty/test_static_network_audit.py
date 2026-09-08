"""
Static Network Egress and Sovereignty Audit Tests
Verifies that static analysis correctly scans the repository and classifies all network call sites.
"""

import unittest
from pathlib import Path

from brain.security.sovereignty import (
    SovereigntyAuditEngine,
    AuditFindingCategory,
    SovereigntyAuditReport,
)


class TestStaticNetworkAudit(unittest.TestCase):
    """Test static sovereignty auditing engine against repository code."""

    def setUp(self):
        self.repo_root = Path(__file__).resolve().parent.parent.parent
        self.auditor = SovereigntyAuditEngine(root_dir=self.repo_root)

    def test_scan_brain_security_directory(self):
        """Scan brain/security and verify all findings are classified properly."""
        security_dir = self.repo_root / "brain" / "security"
        report = self.auditor.scan_directory(security_dir)

        self.assertIsInstance(report, SovereigntyAuditReport)
        self.assertGreater(report.scanned_files_count, 0)
        self.assertTrue(report.is_air_gap_compliant)

    def test_classify_rust_ipc_as_local_ipc(self):
        """Verify socket usage in Rust IPC client is classified as LOCAL IPC."""
        rust_client_path = self.repo_root / "brain" / "runtime" / "rust_capability_client.py"
        if rust_client_path.exists():
            findings = self.auditor.audit_file(rust_client_path)
            socket_findings = [f for f in findings if "socket" in f.symbol]
            self.assertTrue(len(socket_findings) > 0)
            for f in socket_findings:
                self.assertEqual(f.category, AuditFindingCategory.LOCAL_IPC)
                self.assertFalse(f.is_violation)

    def test_classify_web_api_as_localhost_service(self):
        """Verify web API / listener socket/HTTP usage is classified as LOCALHOST SERVICE."""
        web_api_path = self.repo_root / "brain" / "web_api.py"
        if web_api_path.exists():
            findings = self.auditor.audit_file(web_api_path)
            for f in findings:
                if f.category == AuditFindingCategory.LOCALHOST_SERVICE:
                    self.assertFalse(f.is_violation)


if __name__ == "__main__":
    unittest.main()
