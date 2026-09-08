"""
Parser Factory and Registry
Resolves appropriate document parsers based on file extensions and MIME types.
"""

from pathlib import Path
from typing import Dict, List, Optional, Union

from brain.knowledge.ingestion.interface import DocumentParser
from brain.knowledge.ingestion.parsers.text import TextDocumentParser
from brain.knowledge.ingestion.parsers.pdf import PDFDocumentParser
from brain.knowledge.ingestion.parsers.docx import DOCXDocumentParser


class ParserFactory:
    """
    Registry of document parsers with fallback resolution.
    """

    def __init__(self, populate_defaults: bool = True):
        self._parsers: List[DocumentParser] = []
        if populate_defaults:
            self._parsers.append(TextDocumentParser())
            self._parsers.append(PDFDocumentParser())
            self._parsers.append(DOCXDocumentParser())
            try:
                from brain.multimodal.adapters.knowledge import MultimodalImageDocumentParser
                self._parsers.append(MultimodalImageDocumentParser())
            except Exception:
                pass

    def register_parser(self, parser: DocumentParser) -> None:
        """Register a custom or extension parser."""
        self._parsers.insert(0, parser)

    def get_parser_for_file(self, file_path: Union[str, Path]) -> Optional[DocumentParser]:
        """Find the first matching parser that supports the given file."""
        p = Path(file_path)
        for parser in self._parsers:
            if parser.supports(p):
                return parser
        return None

    def list_supported_extensions(self) -> List[str]:
        """Return all supported file extensions across all registered parsers."""
        exts = set()
        for p in self._parsers:
            exts.update(p.supported_extensions)
        return sorted(list(exts))


# Global singleton
_global_parser_factory: Optional[ParserFactory] = None


def get_parser_factory() -> ParserFactory:
    """Retrieve global ParserFactory singleton."""
    global _global_parser_factory
    if _global_parser_factory is None:
        _global_parser_factory = ParserFactory()
    return _global_parser_factory
