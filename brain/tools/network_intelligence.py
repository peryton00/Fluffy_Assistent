"""
Fluffy Desktop - Network Intelligence Agent Tools (N9.3)

Exposes read-only, token-efficient agent tools for local network reasoning:
1. get_network_summary: Compact environmental summary and tallies.
2. list_network_devices: Bounded list of classified local subnet devices.
3. list_local_services: Bounded catalog of listening services and lifecycles.
4. get_network_changes: Bounded chronological timeline of network transitions.

Security Invariants:
- Strictly read-only observation.
- Zero packet payload, Wi-Fi password, or credential exposure.
- Zero network mutation, firewall manipulation, port scanning, or packet capture.
- N6 Guardian remains the sole authority for security alerts and verdicts.
"""

from typing import Dict, Any, List, Optional
import time

from brain.tools.definitions import (
    ToolDefinition,
    ToolKind,
    ToolRiskLevel,
    ToolSecurityMetadata,
)
from brain.runtime.local_network_service import get_local_network_service


# ============================================================================
# 1. Tool Execution Handlers
# ============================================================================

def handle_get_network_summary(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes 'get_network_summary' tool.
    Returns a compact summary suitable for direct inclusion in LLM context.
    """
    timeout = float(params.get("timeout", 8.0))
    service = get_local_network_service()
    raw_summary = service.get_intelligence_summary(timeout=timeout)

    net_id = raw_summary.get("network_identity") or {}
    device_counts = raw_summary.get("device_count") or {}
    service_counts = raw_summary.get("service_count") or {}
    freshness = raw_summary.get("freshness") or {}

    # Extract concise insights
    raw_insights = raw_summary.get("insights", [])
    compact_insights = [
        {
            "type": ins.get("insight_type"),
            "summary": ins.get("summary"),
            "confidence": ins.get("confidence"),
        }
        for ins in raw_insights[:5]
    ]

    return {
        "ok": True,
        "network": {
            "identity": net_id.get("network_id", "unknown"),
            "interface": net_id.get("interface", "unknown"),
            "type": net_id.get("network_type", "other"),
            "ssid": net_id.get("ssid"),
            "gateway": net_id.get("gateway"),
            "local_addresses": net_id.get("local_addresses", []),
            "confidence": net_id.get("confidence", 0.0),
            "evidence": net_id.get("evidence", []),
            "trust_level": net_id.get("trust_level", "UNKNOWN"),
        },
        "devices": {
            "total": device_counts.get("total", 0),
            "online": device_counts.get("online", 0),
        },
        "services": {
            "total": service_counts.get("total", 0),
            "active": service_counts.get("active", 0),
        },
        "active_processes_count": raw_summary.get("active_processes_count", 0),
        "recent_events": raw_summary.get("recent_events", [])[:5],
        "insights": compact_insights,
        "freshness": freshness,
    }


def handle_list_network_devices(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes 'list_network_devices' tool.
    Returns bounded list of classified subnet devices with optional filtering.
    """
    presence_filter = str(params.get("presence", "all")).lower()
    class_filter = str(params.get("classification", "all")).upper()
    limit = min(max(int(params.get("limit", 50)), 1), 256)

    service = get_local_network_service()
    raw_devices = service.get_classified_devices()

    filtered: List[Dict[str, Any]] = []
    for d in raw_devices:
        # Filter presence
        dev_status = str(d.get("status", "")).lower()
        if presence_filter != "all" and dev_status != presence_filter:
            continue


        # Filter classification
        dev_class = str(d.get("classification", "")).upper()
        if class_filter != "ALL" and dev_class != class_filter:
            continue

        filtered.append({
            "device_id": d.get("device_id"),
            "ip": d.get("ip_addresses", ["unknown"])[0] if d.get("ip_addresses") else "unknown",
            "mac": d.get("mac_address"),
            "hostname": d.get("hostname"),
            "vendor": d.get("vendor"),
            "classification": d.get("classification", "UNKNOWN"),
            "confidence": d.get("confidence", 0.0),
            "evidence": d.get("evidence", []),
            "status": d.get("status", "unknown"),
            "user_alias": d.get("user_alias"),
            "is_gateway": d.get("is_gateway", False),
            "first_seen": d.get("first_seen"),
            "last_seen": d.get("last_seen"),
        })

    now = time.time()
    return {
        "ok": True,
        "devices": filtered[:limit],
        "count": len(filtered[:limit]),
        "total_matching": len(filtered),
        "freshness": {
            "collected_at": now,
            "is_stale": False,
        },
    }


def handle_list_local_services(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes 'list_local_services' tool.
    Returns bounded catalog of local listening services with optional status filtering.
    """
    status_filter = str(params.get("status", "all")).upper()
    limit = min(max(int(params.get("limit", 50)), 1), 128)

    service = get_local_network_service()
    raw_services = service.get_service_catalog()

    filtered: List[Dict[str, Any]] = []
    for s in raw_services:
        svc_status = str(s.get("status", "")).upper()
        if status_filter != "ALL" and svc_status != status_filter:
            continue

        filtered.append({
            "service_id": s.get("service_id"),
            "process_name": s.get("process_name"),
            "pid": s.get("pid"),
            "local_address": s.get("local_address"),
            "port": s.get("port"),
            "protocol": s.get("protocol"),
            "status": s.get("status"),
            "lifetime_seconds": round(s.get("lifetime_seconds", 0.0), 1),
            "well_known_name": s.get("well_known_name"),
            "missed_snapshots": s.get("missed_snapshots", 0),
            "consecutive_observations": s.get("consecutive_observations", 1),
            "first_seen": s.get("first_seen"),
            "last_seen": s.get("last_seen"),
        })

    now = time.time()
    return {
        "ok": True,
        "services": filtered[:limit],
        "count": len(filtered[:limit]),
        "total_matching": len(filtered),
        "freshness": {
            "collected_at": now,
            "is_stale": False,
        },
    }


def handle_get_network_changes(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes 'get_network_changes' tool.
    Returns bounded chronological event timeline from N9 ring buffer.
    """
    limit = min(max(int(params.get("limit", 20)), 1), 100)
    service = get_local_network_service()
    changes = service.get_intelligence_changes(limit=limit)

    now = time.time()
    return {
        "ok": True,
        "changes": changes,
        "count": len(changes),
        "freshness": {
            "collected_at": now,
            "is_stale": False,
        },
    }


# ============================================================================
# 2. Tool Definitions & Registration Helper
# ============================================================================

def get_network_intelligence_tool_definitions() -> List[ToolDefinition]:
    """Returns canonical ToolDefinition objects for all N9.3 agent tools."""
    read_only_sec = ToolSecurityMetadata(
        risk_level=ToolRiskLevel.READ_ONLY,
        requires_confirmation=False,
        destructive=False,
        filesystem_access=False,
        process_access=False,
        network_access=False, # Local observation only; does not send outbound network probes
        credential_access=False,
        offline_capable=True,
    )

    # 1. get_network_summary
    def_summary = ToolDefinition(
        tool_id="native.network.get_network_summary",
        name="get_network_summary",
        description="Retrieve a compact, high-level summary of the current local network environment, device counts, and active services.",
        version="1.0.0",
        provider="native",
        kind=ToolKind.NATIVE,
        input_schema={
            "type": "object",
            "properties": {
                "timeout": {
                    "type": "number",
                    "description": "Optional observation timeout in seconds (default: 8.0)",
                }
            },
            "additionalProperties": False,
        },
        output_schema={"type": "object"},
        capabilities=["network_intelligence", "environment_summary"],
        security=read_only_sec,
    )

    # 2. list_network_devices
    def_devices = ToolDefinition(
        tool_id="native.network.list_network_devices",
        name="list_network_devices",
        description="List classified devices discovered on the local subnet with confidence, vendor, role, and presence state.",
        version="1.0.0",
        provider="native",
        kind=ToolKind.NATIVE,
        input_schema={
            "type": "object",
            "properties": {
                "presence": {
                    "type": "string",
                    "enum": ["active", "recently_seen", "returning", "persistent", "intermittent", "all"],
                    "description": "Optional presence state filter (default: 'all')",
                },
                "classification": {
                    "type": "string",
                    "description": "Optional device role filter (e.g. 'gateway', 'phone', 'printer', 'workstation', 'unknown', 'all')",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 256,
                    "description": "Maximum number of devices to return (default: 50, max: 256)",
                },
            },
            "additionalProperties": False,
        },
        output_schema={"type": "object"},
        capabilities=["network_intelligence", "device_inventory"],
        security=read_only_sec,
    )

    # 3. list_local_services
    def_services = ToolDefinition(
        tool_id="native.network.list_local_services",
        name="list_local_services",
        description="List local listening services mapped to host processes with lifecycle states and observation counts.",
        version="1.0.0",
        provider="native",
        kind=ToolKind.NATIVE,
        input_schema={
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "persistent", "transient", "inactive", "all"],
                    "description": "Optional service status filter (default: 'all')",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 128,
                    "description": "Maximum number of services to return (default: 50, max: 128)",
                },
            },
            "additionalProperties": False,
        },
        output_schema={"type": "object"},
        capabilities=["network_intelligence", "service_catalog"],
        security=read_only_sec,
    )

    # 4. get_network_changes
    def_changes = ToolDefinition(
        tool_id="native.network.get_network_changes",
        name="get_network_changes",
        description="Retrieve a bounded chronological log of recent network transitions, switches, and service lifecycle changes.",
        version="1.0.0",
        provider="native",
        kind=ToolKind.NATIVE,
        input_schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Maximum number of change events to return (default: 20, max: 100)",
                }
            },
            "additionalProperties": False,
        },
        output_schema={"type": "object"},
        capabilities=["network_intelligence", "network_timeline"],
        security=read_only_sec,
    )

    return [def_summary, def_devices, def_services, def_changes]


def register_network_intelligence_tools(registry: Any) -> None:
    """
    Registers the 4 N9.3 agent tools into the given canonical ToolRegistry and binds
    their execution handlers to the registry's default native adapter.
    """
    tool_defs = get_network_intelligence_tool_definitions()
    handlers = {
        "native.network.get_network_summary": handle_get_network_summary,
        "native.network.list_network_devices": handle_list_network_devices,
        "native.network.list_local_services": handle_list_local_services,
        "native.network.get_network_changes": handle_get_network_changes,
    }

    for t_def in tool_defs:
        # Register tool definition
        registry.register(t_def, adapter=registry._default_native_adapter)
        # Register handler
        registry._default_native_adapter.register_handler(t_def.tool_id, handlers[t_def.tool_id])
        # Register canonical aliases: "get_network_summary", "tool:get_network_summary"
        registry.register_alias(f"tool:{t_def.name}", t_def.tool_id)
        registry.register_alias(t_def.name, t_def.tool_id)
