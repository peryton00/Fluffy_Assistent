"""
Knowledge Security and Access Control Tests
Tests path traversal defense, protected system paths, permission evaluation,
confidentiality boundaries, and deletion isolation.
"""

import unittest
import tempfile
import shutil
from pathlib import Path

from brain.knowledge.definitions import (
    DocumentStatus,
    DocumentClassification,
)
from brain.knowledge.permissions import KnowledgeAccessIdentity, KnowledgePermissionPolicy
from brain.knowledge.ingestion.discovery import DocumentDiscovery
from brain.knowledge.ingestion.manager import IngestionManager
from brain.knowledge.runtime import KnowledgeRuntime
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.retrieval.query import KnowledgeQuery


class TestKnowledgeSecurity(unittest.TestCase):
    """Security and authorization test suite for local knowledge subsystem."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.temp_path = Path(self.temp_dir)
        self.config = KnowledgeConfig(data_dir=self.temp_path / "data")
        self.runtime = KnowledgeRuntime(config=self.config)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_path_traversal_blocking(self):
        """Relative traversal patterns and UNC prefixes must be rejected."""
        # 1. Traversal relative paths
        self.assertFalse(DocumentDiscovery.is_safe_path("../../etc/passwd"))
        self.assertFalse(DocumentDiscovery.is_safe_path("..\\..\\Windows\\System32"))

        # 2. UNC device paths
        self.assertFalse(DocumentDiscovery.is_safe_path("\\\\?\\C:\\secrets"))
        self.assertFalse(DocumentDiscovery.is_safe_path("//server/share/file.txt"))

        # 3. Windows reserved device paths
        self.assertFalse(DocumentDiscovery.is_safe_path("CON"))
        self.assertFalse(DocumentDiscovery.is_safe_path("NUL"))
        self.assertFalse(DocumentDiscovery.is_safe_path("PRN.txt"))

        # 4. Null byte injection
        self.assertFalse(DocumentDiscovery.is_safe_path("valid.txt\x00secret.txt"))

    def test_protected_system_paths_blocking(self):
        """Protected operating system roots must be rejected."""
        self.assertFalse(DocumentDiscovery.is_safe_path("C:\\Windows\\System32\\drivers\\etc\\hosts"))
        self.assertFalse(DocumentDiscovery.is_safe_path("/etc/shadow"))
        self.assertFalse(DocumentDiscovery.is_safe_path("/root/.ssh/id_rsa"))

    def test_permission_clearance_filtering(self):
        """Users without required clearance cannot retrieve confidential or restricted documents."""
        # 1. Index public document
        pub_file = self.temp_path / "public_notice.txt"
        pub_file.write_text("Plant public visitor protocol and visiting hours.", encoding="utf-8")
        self.runtime.index_file(pub_file, classification=DocumentClassification.PUBLIC)

        # 2. Index internal document
        internal_file = self.temp_path / "internal_guidelines.txt"
        internal_file.write_text("Standard engineering guidelines and employee shift rosters.", encoding="utf-8")
        self.runtime.index_file(internal_file, classification=DocumentClassification.INTERNAL)

        # 3. Index confidential document
        conf_file = self.temp_path / "confidential_turbine_design.txt"
        conf_file.write_text("Confidential Turbine Blade Alloy Formulation and Yield Strengths.", encoding="utf-8")
        self.runtime.index_file(conf_file, classification=DocumentClassification.CONFIDENTIAL)

        # 4. Index restricted document
        rest_file = self.temp_path / "restricted_reactor_keys.txt"
        rest_file.write_text("Restricted Reactor Core Emergency Shutdown Override Keys.", encoding="utf-8")
        self.runtime.index_file(rest_file, classification=DocumentClassification.RESTRICTED)

        # Test Identity with INTERNAL clearance
        internal_user = KnowledgeAccessIdentity(
            identity_id="engineer_bob",
            clearance_level=DocumentClassification.INTERNAL,
        )

        query = KnowledgeQuery(
            query_text="Turbine Alloy Formulation Yield Strengths",
            identity=internal_user,
        )
        results = self.runtime.search(query)
        # Should NOT return confidential or restricted documents
        doc_names = [r.display_name for r in results]
        self.assertNotIn("confidential_turbine_design.txt", doc_names)
        self.assertNotIn("restricted_reactor_keys.txt", doc_names)

        # Test Identity with CONFIDENTIAL clearance
        confidential_officer = KnowledgeAccessIdentity(
            identity_id="lead_architect",
            clearance_level=DocumentClassification.CONFIDENTIAL,
        )
        conf_query = KnowledgeQuery(
            query_text="Turbine Alloy Formulation",
            identity=confidential_officer,
        )
        conf_results = self.runtime.search(conf_query)
        conf_names = [r.display_name for r in conf_results]
        self.assertIn("confidential_turbine_design.txt", conf_names)
        self.assertNotIn("restricted_reactor_keys.txt", conf_names)

    def test_owner_and_allowed_identities_access(self):
        """Document owner and specifically allowed identities can access restricted files."""
        secret_file = self.temp_path / "project_x.txt"
        secret_file.write_text("Project X quantum propulsion formulas.", encoding="utf-8")

        self.runtime.index_file(
            secret_file,
            classification=DocumentClassification.RESTRICTED,
            owner="dr_alicia",
            allowed_identities=["collaborator_dan"],
        )

        # 1. Owner search succeeds
        owner_ident = KnowledgeAccessIdentity(identity_id="dr_alicia", clearance_level=DocumentClassification.INTERNAL)
        owner_results = self.runtime.search(KnowledgeQuery(query_text="quantum propulsion", identity=owner_ident))
        self.assertGreater(len(owner_results), 0)

        # 2. Specifically allowed identity succeeds
        collab_ident = KnowledgeAccessIdentity(identity_id="collaborator_dan", clearance_level=DocumentClassification.INTERNAL)
        collab_results = self.runtime.search(KnowledgeQuery(query_text="quantum propulsion", identity=collab_ident))
        self.assertGreater(len(collab_results), 0)

        # 3. Unauthorized third party fails
        stranger_ident = KnowledgeAccessIdentity(identity_id="third_party", clearance_level=DocumentClassification.INTERNAL)
        stranger_results = self.runtime.search(KnowledgeQuery(query_text="quantum propulsion", identity=stranger_ident))
        self.assertEqual(len(stranger_results), 0)

    def test_safe_deletion_leaves_no_zombie_results(self):
        """Deleted documents must be immediately removed with no ghost retrieval hits."""
        doc_file = self.temp_path / "temp_patent.txt"
        doc_file.write_text("Proprietary composite resin curing protocol 450 Kelvin.", encoding="utf-8")
        doc = self.runtime.index_file(doc_file, classification=DocumentClassification.PUBLIC)

        # Search finds it
        res_before = self.runtime.search("curing protocol")
        self.assertGreater(len(res_before), 0)

        # Delete document
        deleted = self.runtime.delete_document(doc.document_id)
        self.assertTrue(deleted)

        # Search returns 0 results
        res_after = self.runtime.search("curing protocol")
        self.assertEqual(len(res_after), 0)


if __name__ == "__main__":
    unittest.main()
