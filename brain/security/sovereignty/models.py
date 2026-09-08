"""
Sovereignty Data Models
Typed structures for static audit findings, runtime network events, and sovereignty audit reports.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import time

from brain.security.sovereignty.definitions import (
    TrafficCategory,
    TrafficDecision,
    SovereigntyStatus,
    AuditFindingCategory,
    SovereigntyViolationType,
)


@dataclass
class NetworkEventRecord:
    """Record of a runtime network connection or socket attempt."""
    timestamp: float = field(default_factory=time.time)
    process_name: str = "fluffy-brain"
    destination_host: str = ""
    destination_port: int = 0
    protocol: str = "tcp"  # tcp, udp, dns, http, https, ws
    category: TrafficCategory = TrafficCategory.UNKNOWN
    decision: TrafficDecision = TrafficDecision.ALLOW
    reason: str = ""
    stack_trace: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "process_name": self.process_name,
            "destination_host": self.destination_host,
            "destination_port": self.destination_port,
            "protocol": self.protocol,
            "category": self.category.value,
            "decision": self.decision.value,
            "reason": self.reason,
            "metadata": self.metadata,
        }


@dataclass
class StaticAuditFinding:
    """A static code finding discovered during static security auditing."""
    file_path: str
    line_number: int
    symbol: str
    code_snippet: str
    category: AuditFindingCategory
    severity: str  # info, low, medium, high, critical
    description: str
    is_violation: bool = False
    justification: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "line_number": self.line_number,
            "symbol": self.symbol,
            "code_snippet": self.code_snippet,
            "category": self.category.value,
            "severity": self.severity,
            "description": self.description,
            "is_violation": self.is_violation,
            "justification": self.justification,
        }


@dataclass
class SovereigntyAuditReport:
    """Comprehensive sovereignty and air-gap audit report."""
    scanned_files_count: int = 0
    total_call_sites_count: int = 0
    findings: List[StaticAuditFinding] = field(default_factory=list)
    findings_by_category: Dict[str, int] = field(default_factory=dict)
    external_endpoints: List[str] = field(default_factory=list)
    cloud_dependencies: List[str] = field(default_factory=list)
    download_paths: List[str] = field(default_factory=list)
    telemetry_paths: List[str] = field(default_factory=list)
    remote_mcp_paths: List[str] = field(default_factory=list)
    is_air_gap_compliant: bool = True
    audit_timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scanned_files_count": self.scanned_files_count,
            "total_call_sites_count": self.total_call_sites_count,
            "findings_by_category": self.findings_by_category,
            "external_endpoints": self.external_endpoints,
            "cloud_dependencies": self.cloud_dependencies,
            "download_paths": self.download_paths,
            "telemetry_paths": self.telemetry_paths,
            "remote_mcp_paths": self.remote_mcp_paths,
            "is_air_gap_compliant": self.is_air_gap_compliant,
            "audit_timestamp": self.audit_timestamp,
            "findings": [f.to_dict() for f in self.findings],
        }
