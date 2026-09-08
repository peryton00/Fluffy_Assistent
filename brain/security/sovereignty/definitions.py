"""
Sovereignty and Air-Gap Definitions
Enumerations and classifications for network boundaries, traffic decisions, and air-gap enforcement.
"""

from enum import Enum


class TrafficCategory(str, Enum):
    """Network destination classification categories."""
    LOCALHOST = "localhost"          # 127.0.0.1, ::1, localhost, internal IPC ports
    PRIVATE_LAN = "private_lan"      # RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    EXTERNAL = "external"            # Public Internet egress (prohibited in air-gap mode)
    UNKNOWN = "unknown"              # Unresolvable or unrecognized address


class SovereigntyStatus(str, Enum):
    """Overall system sovereignty status."""
    AIR_GAP_VERIFIED = "air_gap_verified"    # 100% sovereign, zero external network activity
    VIOLATION_DETECTED = "violation_detected" # Detected attempt to access external network/cloud
    LOCAL_ONLY = "local_only"                # Configured for local-only execution


class TrafficDecision(str, Enum):
    """Runtime traffic decision."""
    ALLOW = "allow"                  # Permitted (localhost IPC, approved LAN)
    BLOCK = "block"                  # Blocked by air-gap firewall/interceptor
    LOG = "log"                      # Monitored and logged


class SovereigntyViolationType(str, Enum):
    """Specific types of sovereignty or air-gap violations."""
    CLOUD_API_CALL = "cloud_api_call"
    EXTERNAL_DNS_QUERY = "external_dns_query"
    EXTERNAL_HTTP_EGRESS = "external_http_egress"
    EXTERNAL_SOCKET_CONNECT = "external_socket_connect"
    REMOTE_MCP_TRANSPORT = "remote_mcp_transport"
    RUNTIME_PACKAGE_DOWNLOAD = "runtime_package_download"
    MODEL_WEIGHTS_DOWNLOAD = "model_weights_download"
    EXTERNAL_TELEMETRY = "external_telemetry"


class AuditFindingCategory(str, Enum):
    """Categorization of code-level network call sites."""
    LOCAL_IPC = "LOCAL IPC"                              # Localhost sockets, Rust IPC (9002), Tauri IPC
    LOCALHOST_SERVICE = "LOCALHOST SERVICE"              # Local web UI (5123), local Ollama/LMStudio (11434/1234)
    LOCAL_NETWORK_CAPABILITY = "LOCAL NETWORK CAPABILITY"# Local subnet tools (wifi scan, bluetooth)
    EXTERNAL_NETWORK = "EXTERNAL NETWORK"                # Public Internet egress / cloud APIs
