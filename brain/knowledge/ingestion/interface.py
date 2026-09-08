"""
Document Parser Interface
Defines the standard abstraction for local document parsers.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Union, List

from brain.knowledge.definitions import DocumentMimeType
from brain.knowledge.documents import ParsedDocument


class DocumentParser(ABC):
    """Abstract interface for format-specific local document parsers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the parser."""
        pass

    @property
    @abstractmethod
    def supported_mime_types(self) -> List[DocumentMimeType]:
        """MIME types supported by this parser."""
        pass

    @property
    @abstractmethod
    def supported_extensions(self) -> List[str]:
        """File extensions (e.g. ['.txt', '.md']) supported by this parser."""
        pass

    @abstractmethod
    def supports(self, file_path: Union[str, Path]) -> bool:
        """Check if parser supports the given file."""
        pass

    @abstractmethod
    def parse(self, file_path: Union[str, Path]) -> ParsedDocument:
        """Parse the document and extract structured text, sections, and metadata."""
        pass
