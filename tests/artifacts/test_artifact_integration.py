"""
Integration Tests for Artifact Subsystem and UnifiedToolRuntime
Verifies end-to-end tool execution through UnifiedToolRuntime, ToolRequest validation, and Sandbox integration.
"""

import unittest
import tempfile
from pathlib import Path

from brain.tools.runtime import UnifiedToolRuntime, ToolRequest
from brain.tools.adapters.artifact import ArtifactToolAdapter
from brain.tools.adapters.sandbox import SandboxToolAdapter
from brain.artifacts.definitions import ArtifactType
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.runtime import ArtifactRuntime


class TestArtifactIntegration(unittest.TestCase):
    """End-to-end integration tests connecting Artifact subsystem to UnifiedToolRuntime and Sandbox."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = ArtifactConfig(workspace_dir=self.workspace)
        self.artifact_runtime = ArtifactRuntime(config=self.config)

        self.tool_runtime = UnifiedToolRuntime()
        # Override adapter with our configured test artifact runtime
        art_adapter = ArtifactToolAdapter(artifact_runtime=self.artifact_runtime)
        art_def = self.tool_runtime.registry.get("artifact.generate")
        if art_def:
            self.tool_runtime.registry.register(art_def, adapter=art_adapter, allow_override=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_unified_tool_runtime_invocation(self):
        """Invoke artifact.generate through UnifiedToolRuntime."""
        req = ToolRequest(
            tool_id="artifact.generate",
            parameters={
                "artifact_type": "docx",
                "name": "executive_summary.docx",
                "content": "Quarterly deliverable generated via UnifiedToolRuntime.",
                "destination_dir": str(self.workspace),
                "sources": ["[Source: doc_quarterly_spec.pdf, p. 4]"],
            },
        )

        res = self.tool_runtime.execute(req)
        self.assertTrue(res.success, msg=f"Tool execution failed: {res.error}")
        self.assertIn("file_path", res.output)
        self.assertTrue(Path(res.output["file_path"]).exists())
        self.assertEqual(res.output["artifact_type"], "docx")

    def test_sandbox_computation_feeding_artifact_generator(self):
        """
        Verify real data pipeline:
        1. Agent invokes sandbox.execute to calculate dataset summary.
        2. Agent takes computed summary and invokes artifact.generate to produce an XLSX workbook.
        """
        # Step 1: Execute Python computation inside Phase 2E Secure Sandbox
        computation_code = """
import json
data = [120, 145, 130, 160, 190, 210]
avg_val = sum(data) / len(data)
max_val = max(data)
result = {"values": data, "average": avg_val, "maximum": max_val}
print(json.dumps(result))
"""
        sandbox_req = ToolRequest(
            tool_id="sandbox.execute",
            parameters={"code": computation_code, "language": "python", "mode": "secure"},
        )
        sandbox_res = self.tool_runtime.execute(sandbox_req, confirmed=True)
        self.assertTrue(sandbox_res.success, msg=f"Sandbox execution failed: {sandbox_res.error}")

        import json
        raw_stdout = sandbox_res.output if isinstance(sandbox_res.output, str) else sandbox_res.metadata.get("stdout", "")
        computed = json.loads(raw_stdout.strip())
        self.assertIn("average", computed)

        # Step 2: Feed computed output into artifact.generate
        rows = [["Reading", v] for v in computed["values"]]
        rows.append(["Average", computed["average"]])
        rows.append(["Maximum", computed["maximum"]])

        sheet_data = {
            "sheet_name": "SensorStats",
            "headers": ["Metric", "Value"],
            "rows": rows,
        }

        art_req = ToolRequest(
            tool_id="artifact.generate",
            parameters={
                "artifact_type": "xlsx",
                "name": "computed_sensor_metrics.xlsx",
                "content": sheet_data,
                "destination_dir": str(self.workspace),
                "sources": ["Sandbox Computation Run #44"],
            },
        )
        art_res = self.tool_runtime.execute(art_req)
        self.assertTrue(art_res.success)
        self.assertTrue(Path(art_res.output["file_path"]).exists())


if __name__ == "__main__":
    unittest.main()
