"""
Code Artifact Validator
Validates source code artifacts statically (AST parsing for Python, balanced syntax & UTF-8 for other languages).
Strictly offline and non-executable: never runs generated code on the host outside the Sandbox.
"""

import ast
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.validators.interface import ArtifactValidator


class CodeValidator(ArtifactValidator):
    """
    Validates code deliverables statically without execution.
    """

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.CODE

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                code_text = f.read()
        except Exception:
            return False

        if not code_text.strip():
            return False

        ext = file_path.suffix.lower()

        # Python static AST validation
        if ext == ".py":
            try:
                ast.parse(code_text, filename=str(file_path))
                return True
            except SyntaxError:
                return False
            except Exception:
                return False

        # For other languages (Rust, JS, TS, etc.), verify UTF-8 integrity and balanced basic delimiters
        # We explicitly do NOT claim full compiler verification for non-Python languages without compiler
        brackets = {"(": ")", "[": "]", "{": "}"}
        stack = []
        in_string = False
        string_char = ""
        escape = False

        for char in code_text:
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char in ('"', "'", "`"):
                if not in_string:
                    in_string = True
                    string_char = char
                elif string_char == char:
                    in_string = False
                continue
            if in_string:
                continue

            if char in brackets:
                stack.append(char)
            elif char in brackets.values():
                if not stack:
                    return False
                top = stack.pop()
                if brackets[top] != char:
                    return False

        return len(stack) == 0
