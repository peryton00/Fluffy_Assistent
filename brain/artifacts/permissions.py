"""
Artifact Permission and Classification Policy
Determines security clearance and classification inheritance for generated deliverables.
"""

from typing import List, Optional
from brain.knowledge.definitions import DocumentClassification


class ArtifactPermissionPolicy:
    """
    Enforces security classification inheritance from source materials to generated deliverables.
    Prevents silent downgrade of confidential industrial data.
    """

    CLASSIFICATION_HIERARCHY = {
        DocumentClassification.PUBLIC: 1,
        DocumentClassification.INTERNAL: 2,
        DocumentClassification.CONFIDENTIAL: 3,
        DocumentClassification.RESTRICTED: 4,
    }

    @classmethod
    def resolve_classification(
        cls,
        explicit_classification: Optional[DocumentClassification] = None,
        source_classifications: Optional[List[DocumentClassification]] = None,
    ) -> DocumentClassification:
        """
        Determine effective classification level:
        1. If explicit classification provided, ensure it is at least as high as any source.
        2. Otherwise, inherit the maximum classification level among source materials.
        3. Default to INTERNAL if no sources or explicit classification specified.
        """
        max_source_level = 2  # Default to INTERNAL
        if source_classifications:
            source_levels = [cls.CLASSIFICATION_HIERARCHY.get(sc, 2) for sc in source_classifications]
            if source_levels:
                max_source_level = max(source_levels)

        if explicit_classification is not None:
            explicit_level = cls.CLASSIFICATION_HIERARCHY.get(explicit_classification, 2)
            effective_level = max(explicit_level, max_source_level)
        else:
            effective_level = max_source_level

        for classification, level in cls.CLASSIFICATION_HIERARCHY.items():
            if level == effective_level:
                return classification

        return DocumentClassification.INTERNAL
