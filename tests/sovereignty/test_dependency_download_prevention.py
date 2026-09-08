"""
Dependency and Package Download Prevention Tests
Verifies that runtime execution does not trigger package managers or download commands.
"""

import unittest
from pathlib import Path
from brain.security.sovereignty import SovereigntyAuditEngine, AuditFindingCategory


class TestDependencyDownloadPrevention(unittest.TestCase):
    """Test prevention of dynamic runtime package installations."""

    def setUp(self):
        self.repo_root = Path(__file__).resolve().parent.parent.parent
        self.auditor = SovereigntyAuditEngine(root_dir=self.repo_root)

    def test_no_dynamic_pip_or_npm_in_runtime(self):
        """Production brain modules must not contain dynamic pip/npm install executions."""
        brain_dir = self.repo_root / "brain"
        report = self.auditor.scan_directory(brain_dir)

        # Filter out tests and installer scripts
        runtime_download_violations = [
            f for f in report.findings
            if f.is_violation and "install" in f.symbol.lower() and "test" not in f.file_path.lower() and "installer" not in f.file_path.lower()
        ]
        self.assertEqual(len(runtime_download_violations), 0)


if __name__ == "__main__":
    unittest.main()
