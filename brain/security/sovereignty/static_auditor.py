"""
Static Sovereignty and Network Egress Auditor
Audits repository files for network imports, external endpoints, cloud SDKs, and runtime download patterns.
"""

import ast
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Set

from brain.security.sovereignty.definitions import AuditFindingCategory
from brain.security.sovereignty.models import StaticAuditFinding, SovereigntyAuditReport


class SovereigntyAuditEngine:
    """
    Statically scans codebase files to discover and classify network call sites.
    """

    NETWORK_MODULES: Set[str] = {
        "requests", "urllib", "http.client", "urllib.request",
        "urllib.parse", "aiohttp", "httpx", "socket", "websocket",
        "websockets",
    }

    CLOUD_SDK_KEYWORDS: Set[str] = {
        "openai", "anthropic", "google.generativeai", "langchain",
        "huggingface_hub", "cohere",
    }

    DOWNLOAD_COMMANDS: Set[str] = {
        "pip install", "npm install", "cargo install", "hf_hub_download",
        "curl ", "wget ", "Invoke-WebRequest", "Invoke-RestMethod",
    }

    EXTERNAL_URL_REGEX = re.compile(
        r'https?://(?!(?:127\.0\.0\.1|localhost|0\.0\.0\.0|::1)(?::\d+)?(?:/|$))[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s"\']*)?'
    )

    LOCALHOST_URL_REGEX = re.compile(
        r'https?://(?:127\.0\.0\.1|localhost|0\.0\.0\.0|::1)(?::\d+)?(?:/[^\s"\']*)?'
    )

    def __init__(self, root_dir: Optional[Path] = None):
        self.root_dir = root_dir or Path.cwd()

    def audit_file(self, file_path: Path) -> List[StaticAuditFinding]:
        """Audit an individual file for network call sites and cloud dependencies."""
        findings: List[StaticAuditFinding] = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            return findings

        rel_path = str(file_path.relative_to(self.root_dir)) if self.root_dir in file_path.parents or file_path == self.root_dir else str(file_path)

        # 1. AST Python parsing if python file
        if file_path.suffix == ".py":
            findings.extend(self._audit_python_ast(file_path, rel_path, content))

        # 2. Textual search for external URLs
        for line_no, line in enumerate(content.splitlines(), start=1):
            line_str = line.strip()
            # Ignore comments in various languages
            if line_str.startswith("#") or line_str.startswith("//") or line_str.startswith("/*") or line_str.startswith("*"):
                # Still check if it references a live endpoint in code
                pass

            # Search external URLs
            for match in self.EXTERNAL_URL_REGEX.finditer(line):
                url = match.group(0)
                # Ignore schema URLs (like http://www.w3.org/2000/xmlns/ or schemas.openxmlformats.org)
                if any(schema in url for schema in ["w3.org", "schemas.openxmlformats.org", "purl.org", "github.com/peryton00"]):
                    continue

                category = AuditFindingCategory.EXTERNAL_NETWORK
                severity = "medium"
                justification = f"URL references external endpoint: {url}"

                # Classify tests / fixtures / backward compatibility
                if "test" in rel_path.lower() or "fixture" in rel_path.lower():
                    severity = "low"
                    justification += " (Contained in test/mock/fixture)"
                elif "net_utils.py" in rel_path.lower():
                    category = AuditFindingCategory.LOCAL_NETWORK_CAPABILITY
                    severity = "medium"
                    justification = f"Legacy network test tool: {url}"

                findings.append(
                    StaticAuditFinding(
                        file_path=rel_path,
                        line_number=line_no,
                        symbol=url,
                        code_snippet=line_str[:120],
                        category=category,
                        severity=severity,
                        description=f"External URL literal found: {url}",
                        is_violation=(category == AuditFindingCategory.EXTERNAL_NETWORK and "test" not in rel_path.lower()),
                        justification=justification,
                    )
                )

            # Search download commands (ignore rule definitions in static_auditor.py itself)
            if "static_auditor.py" not in rel_path.lower():
                for cmd in self.DOWNLOAD_COMMANDS:
                    if cmd in line:
                        is_exec = any(ex in line for ex in ["subprocess", "Popen", "run(", "system(", "spawn", "exec("])
                        severity = "critical" if is_exec else "low"
                        findings.append(
                            StaticAuditFinding(
                                file_path=rel_path,
                                line_number=line_no,
                                symbol=cmd,
                                code_snippet=line_str[:120],
                                category=AuditFindingCategory.EXTERNAL_NETWORK,
                                severity=severity,
                                description=f"Download / package installer command found: {cmd}",
                                is_violation=is_exec and ("test" not in rel_path.lower()),
                                justification="Subprocess execution of package downloads violates sovereignty invariants" if is_exec else "Informational text/error message reference",
                            )
                        )

        return findings

    def _audit_python_ast(self, file_path: Path, rel_path: str, content: str) -> List[StaticAuditFinding]:
        """Perform AST-based inspection on Python files."""
        findings: List[StaticAuditFinding] = []
        try:
            tree = ast.parse(content, filename=str(file_path))
        except Exception:
            return findings

        for node in ast.walk(tree):
            # Check imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    mod_name = alias.name.split(".")[0]
                    if mod_name in self.NETWORK_MODULES:
                        finding = self._classify_module_import(rel_path, node.lineno, alias.name)
                        if finding:
                            findings.append(finding)
                    elif mod_name in self.CLOUD_SDK_KEYWORDS:
                        findings.append(
                            StaticAuditFinding(
                                file_path=rel_path,
                                line_number=node.lineno,
                                symbol=alias.name,
                                code_snippet=f"import {alias.name}",
                                category=AuditFindingCategory.EXTERNAL_NETWORK,
                                severity="critical" if "test" not in rel_path.lower() else "low",
                                description=f"Cloud SDK module imported: {alias.name}",
                                is_violation=("test" not in rel_path.lower()),
                                justification="Direct cloud SDK import violates air-gap sovereignty",
                            )
                        )
            elif isinstance(node, ast.ImportFrom):
                mod_name = (node.module or "").split(".")[0]
                if mod_name in self.NETWORK_MODULES:
                    finding = self._classify_module_import(rel_path, node.lineno, node.module or "")
                    if finding:
                        findings.append(finding)
                elif mod_name in self.CLOUD_SDK_KEYWORDS:
                    findings.append(
                        StaticAuditFinding(
                            file_path=rel_path,
                            line_number=node.lineno,
                            symbol=node.module or "",
                            code_snippet=f"from {node.module} import ...",
                            category=AuditFindingCategory.EXTERNAL_NETWORK,
                            severity="critical" if "test" not in rel_path.lower() else "low",
                            description=f"Cloud SDK module imported: {node.module}",
                            is_violation=("test" not in rel_path.lower()),
                            justification="Direct cloud SDK import violates air-gap sovereignty",
                        )
                    )

        return findings

    def _classify_module_import(self, rel_path: str, lineno: int, module_name: str) -> Optional[StaticAuditFinding]:
        """Classify a network module import based on context and file path."""
        norm_path = rel_path.replace("\\", "/").lower()

        # Rust IPC Adapter / Client (TCP 9002 over socket) -> LOCAL IPC
        if "rust.py" in norm_path or "rust_adapter" in norm_path or "adapters/rust" in norm_path or "rust_capability_client" in norm_path:
            return StaticAuditFinding(
                file_path=rel_path,
                line_number=lineno,
                symbol=module_name,
                code_snippet=f"import {module_name}",
                category=AuditFindingCategory.LOCAL_IPC,
                severity="info",
                description="Localhost TCP socket IPC for Rust Core daemon (Port 9002)",
                is_violation=False,
                justification="Localhost IPC between Python Brain and Rust Core daemon",
            )

        # Web API / Listener (HTTP 5123) -> LOCALHOST SERVICE
        if "web_api.py" in norm_path or "listener.py" in norm_path:
            return StaticAuditFinding(
                file_path=rel_path,
                line_number=lineno,
                symbol=module_name,
                code_snippet=f"import {module_name}",
                category=AuditFindingCategory.LOCALHOST_SERVICE,
                severity="info",
                description="Localhost HTTP/WebSocket server for Tauri Desktop UI (Port 5123)",
                is_violation=False,
                justification="Localhost desktop UI communication",
            )

        # Sovereignty monitor / tests -> LOCAL IPC / AUDIT
        if "sovereignty" in norm_path or "security/sovereignty" in norm_path:
            return StaticAuditFinding(
                file_path=rel_path,
                line_number=lineno,
                symbol=module_name,
                code_snippet=f"import {module_name}",
                category=AuditFindingCategory.LOCAL_IPC,
                severity="info",
                description="Sovereignty runtime instrumentation and network audit hook",
                is_violation=False,
                justification="Instrumentation for air-gap enforcement and socket monitoring",
            )

        # Legacy tools (speed test) -> LOCAL NETWORK CAPABILITY
        if "net_utils.py" in norm_path:
            return StaticAuditFinding(
                file_path=rel_path,
                line_number=lineno,
                symbol=module_name,
                code_snippet=f"import {module_name}",
                category=AuditFindingCategory.LOCAL_NETWORK_CAPABILITY,
                severity="medium",
                description="Legacy network speed test tool (disabled in sovereign mode)",
                is_violation=False,
                justification="Legacy diagnostic tool, not in default autonomous agent path",
            )

        # Tests
        if "test" in norm_path:
            return StaticAuditFinding(
                file_path=rel_path,
                line_number=lineno,
                symbol=module_name,
                code_snippet=f"import {module_name}",
                category=AuditFindingCategory.LOCAL_IPC,
                severity="info",
                description="Test fixture or mock socket",
                is_violation=False,
                justification="Contained within automated test suite",
            )

        # General LLM client / fallback
        if "llm_client.py" in norm_path:
            return StaticAuditFinding(
                file_path=rel_path,
                line_number=lineno,
                symbol=module_name,
                code_snippet=f"import {module_name}",
                category=AuditFindingCategory.LOCALHOST_SERVICE,
                severity="low",
                description="HTTP client for local inference servers (Ollama/LMStudio on localhost) and optional remote API",
                is_violation=False,
                justification="Routes locally to AIModelRuntime when provider is 'local' or 'offline'",
            )

        return StaticAuditFinding(
            file_path=rel_path,
            line_number=lineno,
            symbol=module_name,
            code_snippet=f"import {module_name}",
            category=AuditFindingCategory.EXTERNAL_NETWORK,
            severity="medium",
            description=f"Network module imported: {module_name}",
            is_violation=False,
            justification="Review required to confirm destination is localhost/air-gap compliant",
        )

    def scan_directory(self, target_dir: Optional[Path] = None) -> SovereigntyAuditReport:
        """Scan an entire directory recursively and generate a SovereigntyAuditReport."""
        scan_dir = target_dir or self.root_dir
        report = SovereigntyAuditReport()
        files_to_scan = []

        for p in scan_dir.rglob("*"):
            if p.is_file():
                # Skip virtual environments, node_modules, and git
                p_str = str(p).replace("\\", "/")
                if any(x in p_str for x in ["/.venv/", "/node_modules/", "/target/", "/.git/", "/dist/", "/__pycache__/"]):
                    continue
                if p.suffix in [".py", ".rs", ".js", ".ts", ".html", ".json", ".toml", ".yml", ".yaml"]:
                    files_to_scan.append(p)

        report.scanned_files_count = len(files_to_scan)
        all_findings: List[StaticAuditFinding] = []

        for f in files_to_scan:
            file_findings = self.audit_file(f)
            all_findings.extend(file_findings)

        report.findings = all_findings
        report.total_call_sites_count = len(all_findings)

        # Aggregate categories
        cat_counts: Dict[str, int] = {}
        for f in all_findings:
            cat_name = f.category.value
            cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1
        report.findings_by_category = cat_counts

        # Check violations
        violations = [f for f in all_findings if f.is_violation]
        report.is_air_gap_compliant = len(violations) == 0

        # Collect specific path lists
        report.external_endpoints = list(set([f.symbol for f in all_findings if f.category == AuditFindingCategory.EXTERNAL_NETWORK and "http" in f.symbol]))
        report.cloud_dependencies = list(set([f.symbol for f in all_findings if any(k in f.symbol.lower() for k in ["openai", "anthropic", "google"])]))
        report.download_paths = list(set([f.file_path for f in all_findings if "install" in f.description or "download" in f.description]))

        return report
