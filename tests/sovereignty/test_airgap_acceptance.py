"""
True Air-Gap Acceptance Test Suite
Simulates a physically disconnected on-premise workstation and validates the entire Fluffy Assistant pipeline.
"""

import unittest
import tempfile
from pathlib import Path

from brain.security.sovereignty import (
    RuntimeNetworkMonitor,
    TrafficCategory,
    SovereigntyPolicy,
)
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.runtime import KnowledgeRuntime
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.runtime import ArtifactRuntime
from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import DocumentSectionData, TableData
from brain.sandbox.manager import SandboxManager
from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.definitions import SandboxLanguage, SandboxExecutionMode
from brain.ai.models.registry import ModelRegistry
from brain.ai.runtime.manager import RuntimeManager
from brain.multimodal.runtime import MultimodalRuntime
from brain.multimodal.config import MultimodalConfig


class TestAirGapAcceptance(unittest.TestCase):
    """
    Acceptance test representing a physically disconnected workstation.
    Enforces that the complete multi-subsystem pipeline executes with 0 external network egress.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)

        # Initialize subsystem configurations bound to local test workspace
        self.knowledge_config = KnowledgeConfig(
            data_dir=self.workspace / "knowledge_data",
        )
        self.knowledge_runtime = KnowledgeRuntime(config=self.knowledge_config)

        self.artifact_config = ArtifactConfig(
            workspace_dir=self.workspace / "artifacts",
        )
        self.artifact_runtime = ArtifactRuntime(config=self.artifact_config)

        self.sandbox_manager = SandboxManager()
        self.model_registry = ModelRegistry()
        self.ai_runtime = RuntimeManager(registry=self.model_registry)

        self.multimodal_config = MultimodalConfig()
        self.multimodal_runtime = MultimodalRuntime(config=self.multimodal_config)

        # Enforce strict air-gap monitoring and blocking
        self.policy = SovereigntyPolicy(strict_air_gap=True, allow_private_lan=False)
        self.monitor = RuntimeNetworkMonitor(policy=self.policy, enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()
        self.temp_dir.cleanup()

    def test_complete_airgap_pipeline_execution(self):
        """
        Execute end-to-end sovereign pipeline in a strictly air-gapped environment:
        1. Local AI model resolution
        2. Knowledge ingestion & RAG search
        3. Multimodal local health check
        4. Sandbox secure computation
        5. Artifact generation & SQLite audit manifest persistence
        """
        with self.monitor:
            # 1. Local AI model resolution (must return None / UNAVAILABLE when absent, 0 network)
            resolved_model = self.model_registry.get("non-existent-local-model")
            self.assertIsNone(resolved_model)

            # 2. Local Knowledge Ingestion & RAG Retrieval
            test_doc = self.workspace / "confidential_blueprint_spec.txt"
            test_doc.write_text(
                "Bearing clearance must be maintained at exactly 0.05 mm.\n"
                "Maximum hydraulic operating pressure is 210 bar.\n",
                encoding="utf-8",
            )
            doc = self.knowledge_runtime.index_file(test_doc)
            self.assertIsNotNone(doc)

            search_results = self.knowledge_runtime.search("bearing clearance")
            self.assertIsInstance(search_results, list)
            self.assertGreater(len(search_results), 0)
            self.assertIn("0.05 mm", search_results[0].text)

            # 3. Multimodal Local Health
            mm_health = self.multimodal_runtime.check_health()
            self.assertIsNotNone(mm_health)

            # 4. Sandbox Computation
            sbx_req = SandboxExecutionRequest(
                source_code="import json; print(json.dumps({'status': 'computed_locally', 'code': 200}))",
                language=SandboxLanguage.PYTHON,
                mode=SandboxExecutionMode.SECURE,
            )
            sbx_res = self.sandbox_manager.execute(sbx_req)
            self.assertTrue(sbx_res.success)
            self.assertIn("computed_locally", sbx_res.stdout)

            # 5. Local Artifact Generation (DOCX Report)
            sections = [
                DocumentSectionData(
                    heading="Confidential Air-Gap Acceptance Report",
                    text="This deliverable was generated entirely on-premise inside a sovereign air-gapped environment.",
                    table=TableData(
                        headers=["Subsystem", "Sovereignty Status", "External Egress Count"],
                        rows=[
                            ["Knowledge / RAG", "LOCAL_ONLY", 0],
                            ["Secure Sandbox", "AIR_GAP_VERIFIED", 0],
                            ["Artifact Subsystem", "AIR_GAP_VERIFIED", 0],
                        ],
                    ),
                )
            ]
            art_req = ArtifactRequest(
                artifact_type=ArtifactType.DOCX,
                name="AirGap_Acceptance_Report.docx",
                destination_dir=str(self.workspace / "artifacts"),
                content=sections,
                sources=["confidential_blueprint_spec.txt"],
            )
            art_res = self.artifact_runtime.generate_artifact(art_req)
            self.assertTrue(art_res.success)
            self.assertTrue(Path(art_res.file_path).exists())

            # 6. Local Manifest Persistence
            record = self.artifact_runtime.manifest.get_artifact(art_res.artifact_id)
            self.assertIsNotNone(record)
            self.assertGreater(record.size_bytes, 0)

        # FINAL ACCEPTANCE CRITERIA:
        # Zero external network connections of any protocol
        self.assertTrue(self.monitor.is_clean(), "Air-gap violation detected: External network attempts occurred!")
        self.assertEqual(self.monitor.get_external_count(), 0)

        events = self.monitor.get_events()
        external_events = [e for e in events if e.category == TrafficCategory.EXTERNAL]
        self.assertEqual(len(external_events), 0)


if __name__ == "__main__":
    unittest.main()
