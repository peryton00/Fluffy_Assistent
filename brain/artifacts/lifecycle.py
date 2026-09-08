"""
Artifact Lifecycle and Generator Registry
Manages generator resolution, validator dispatch, and state progression for deliverable creation.
"""

from typing import Dict, List, Optional
from pathlib import Path

from brain.artifacts.definitions import ArtifactType, ArtifactStatus, ValidationStatus
from brain.artifacts.generators.interface import ArtifactGenerator
from brain.artifacts.validators.interface import ArtifactValidator
from brain.artifacts.generators.text import TextArtifactGenerator
from brain.artifacts.generators.markdown import MarkdownArtifactGenerator
from brain.artifacts.generators.json import JSONArtifactGenerator
from brain.artifacts.generators.csv import CSVArtifactGenerator
from brain.artifacts.generators.docx import DOCXArtifactGenerator
from brain.artifacts.generators.xlsx import XLSXArtifactGenerator
from brain.artifacts.generators.pptx import PPTXArtifactGenerator
from brain.artifacts.generators.code import CodeArtifactGenerator
from brain.artifacts.validators.generic import GenericTextValidator, JSONValidator, CSVValidator
from brain.artifacts.validators.docx import DOCXValidator
from brain.artifacts.validators.xlsx import XLSXValidator
from brain.artifacts.validators.pptx import PPTXValidator
from brain.artifacts.validators.code import CodeValidator


class ArtifactRegistry:
    """
    Registry for artifact generators and post-generation validators.
    """

    def __init__(self, populate_defaults: bool = True):
        self._generators: Dict[ArtifactType, ArtifactGenerator] = {}
        self._validators: Dict[ArtifactType, ArtifactValidator] = {}
        if populate_defaults:
            self._register_defaults()

    def _register_defaults(self) -> None:
        # Generators
        self.register_generator(ArtifactType.TXT, TextArtifactGenerator())
        self.register_generator(ArtifactType.MARKDOWN, MarkdownArtifactGenerator())
        self.register_generator(ArtifactType.JSON, JSONArtifactGenerator())
        self.register_generator(ArtifactType.CSV, CSVArtifactGenerator())
        self.register_generator(ArtifactType.DOCX, DOCXArtifactGenerator())
        self.register_generator(ArtifactType.XLSX, XLSXArtifactGenerator())
        self.register_generator(ArtifactType.PPTX, PPTXArtifactGenerator())
        self.register_generator(ArtifactType.CODE, CodeArtifactGenerator())

        # Validators
        text_val = GenericTextValidator()
        self.register_validator(ArtifactType.TXT, text_val)
        self.register_validator(ArtifactType.MARKDOWN, text_val)
        self.register_validator(ArtifactType.JSON, JSONValidator())
        self.register_validator(ArtifactType.CSV, CSVValidator())
        self.register_validator(ArtifactType.DOCX, DOCXValidator())
        self.register_validator(ArtifactType.XLSX, XLSXValidator())
        self.register_validator(ArtifactType.PPTX, PPTXValidator())
        self.register_validator(ArtifactType.CODE, CodeValidator())

    def register_generator(self, artifact_type: ArtifactType, generator: ArtifactGenerator) -> None:
        self._generators[artifact_type] = generator

    def register_validator(self, artifact_type: ArtifactType, validator: ArtifactValidator) -> None:
        self._validators[artifact_type] = validator

    def get_generator(self, artifact_type: ArtifactType) -> Optional[ArtifactGenerator]:
        return self._generators.get(artifact_type)

    def get_validator(self, artifact_type: ArtifactType) -> Optional[ArtifactValidator]:
        return self._validators.get(artifact_type)

    def list_supported_types(self) -> List[ArtifactType]:
        return list(self._generators.keys())

    def get_availability_matrix(self) -> Dict[str, bool]:
        return {
            atype.value: (gen.is_available if gen else False)
            for atype, gen in self._generators.items()
        }
