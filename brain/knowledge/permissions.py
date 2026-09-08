"""
Knowledge Document Permission and Access Control Policy
Enforces document confidentiality, user role authorization, and classification-level boundaries.
"""

from typing import Optional, Set, List, Dict, Any
from dataclasses import dataclass, field

from brain.knowledge.definitions import DocumentClassification


@dataclass
class KnowledgeAccessIdentity:
    """Represents the querying user or agent identity and authorization context."""
    identity_id: str = "default_user"
    roles: Set[str] = field(default_factory=lambda: {"user"})
    clearance_level: DocumentClassification = DocumentClassification.INTERNAL
    is_admin: bool = False

    def can_access_classification(self, classification: DocumentClassification) -> bool:
        """Evaluate if the identity's clearance level permits accessing the given document classification."""
        if self.is_admin:
            return True

        hierarchy = {
            DocumentClassification.PUBLIC: 0,
            DocumentClassification.INTERNAL: 1,
            DocumentClassification.CONFIDENTIAL: 2,
            DocumentClassification.RESTRICTED: 3,
        }
        user_rank = hierarchy.get(self.clearance_level, 1)
        doc_rank = hierarchy.get(classification, 1)
        return user_rank >= doc_rank


class KnowledgePermissionPolicy:
    """
    Evaluates fine-grained access control on knowledge documents and chunks.
    Ensures unauthorized users or unprivileged agents cannot read confidential records.
    """

    @staticmethod
    def is_access_allowed(
        classification: DocumentClassification,
        owner: Optional[str] = None,
        allowed_identities: Optional[List[str]] = None,
        identity: Optional[KnowledgeAccessIdentity] = None,
    ) -> bool:
        """
        Evaluate if identity is authorized to access the document.
        """
        if identity is None:
            # Default local user context: INTERNAL clearance
            identity = KnowledgeAccessIdentity(identity_id="default_user", clearance_level=DocumentClassification.INTERNAL)

        if identity.is_admin:
            return True

        # Owner always has access
        if owner and identity.identity_id == owner:
            return True

        # Check explicit allowed identities list if present
        if allowed_identities is not None and len(allowed_identities) > 0:
            if identity.identity_id in allowed_identities:
                return True
            return False

        # Otherwise evaluate classification clearance level
        return identity.can_access_classification(classification)
