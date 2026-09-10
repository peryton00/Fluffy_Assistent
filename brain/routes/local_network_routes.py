"""
Local Network Observability Blueprint
Handles: /local_network/interfaces, /local_network/devices,
         /local_network/flows, /local_network/wifi, /local_network/snapshot

Strict Rule:
- Completely separate from cluster networking (/network/*).
- Consumes authoritative Rust Core capability observations via LocalNetworkService.
- Zero password/credential exposure.
"""

from flask import Blueprint, jsonify, request
from auth_utils import token_required
from brain.runtime.local_network_service import get_local_network_service

local_network_bp = Blueprint("local_network", __name__)


@local_network_bp.route("/local_network/interfaces", methods=["GET"])
@token_required
def get_local_interfaces():
    """Get host network interfaces with physical classification and traffic metrics."""
    try:
        service = get_local_network_service()
        include_rates = request.args.get("include_rates", "true").lower() == "true"
        resp = service.get_interfaces(include_rates=include_rates)
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/devices", methods=["GET"])
@token_required
def get_local_devices():
    """Get discovered local subnet neighbors from OS ARP/neighbor cache."""
    try:
        service = get_local_network_service()
        resp = service.get_devices()
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/flows", methods=["GET"])
@token_required
def get_local_flows():
    """Get active TCP/UDP socket flows mapped to local processes."""
    try:
        service = get_local_network_service()
        resp = service.get_active_flows()
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/wifi", methods=["GET"])
@token_required
def get_local_wifi():
    """Get known Wi-Fi network profiles and non-secret security metadata."""
    try:
        service = get_local_network_service()
        resp = service.get_wifi_profiles()
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/snapshot", methods=["GET"])
@token_required
def get_local_network_snapshot():
    """Get aggregated host network observation snapshot."""
    try:
        service = get_local_network_service()
        snapshot = service.get_observation_snapshot()
        return jsonify({"ok": True, "snapshot": snapshot})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/traffic_summary", methods=["GET"])
@token_required
def get_local_traffic_summary():
    """Get multi-dimensional aggregated network traffic summary (N7)."""
    try:
        service = get_local_network_service()
        import state
        processes = []
        if state.LATEST_STATE:
            processes = state.LATEST_STATE.get("system", {}).get("processes", {}).get("top_ram", [])

        summary = service.get_traffic_summary(process_telemetry=processes)
        return jsonify({"ok": True, "summary": summary})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/traffic_history", methods=["GET"])
@token_required
def get_local_traffic_history():
    """Get time-series bucketed network traffic history (N7)."""
    try:
        service = get_local_network_service()
        timeframe = request.args.get("window", "1h")
        history = service.get_traffic_history(timeframe=timeframe)
        return jsonify({"ok": True, "window": timeframe, "history": history})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/capture/start", methods=["POST"])
@token_required
def start_packet_capture():
    """Start a controlled, bounded, metadata-only packet monitoring session (N8 / SIH26117)."""
    try:
        service = get_local_network_service()
        body = request.get_json(silent=True) or {}
        interface_name = body.get("interface_name")
        duration_seconds = body.get("duration_seconds", 60)
        max_packets = body.get("max_packets", 100)

        resp = service.start_packet_capture(
            interface_name=interface_name,
            duration_seconds=duration_seconds,
            max_packets=max_packets,
        )
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/capture/stop", methods=["POST"])
@token_required
def stop_packet_capture():
    """Stop an active packet monitoring session."""
    try:
        service = get_local_network_service()
        resp = service.stop_packet_capture()
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/capture/status", methods=["GET"])
@token_required
def get_packet_capture_status():
    """Get active packet monitoring session status and bounded observations."""
    try:
        service = get_local_network_service()
        resp = service.get_packet_capture_status()
        if resp.get("success", False):
            return jsonify({"ok": True, "data": resp.get("data", {})})
        return jsonify({"ok": False, "error": resp.get("error", {})}), 502
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================================================
# Advanced Network Intelligence Endpoints (N9.2)
# ============================================================================

@local_network_bp.route("/local_network/intelligence/summary", methods=["GET"])
@local_network_bp.route("/network_intelligence/summary", methods=["GET"])
@token_required
def get_network_intelligence_summary():
    """Get high-level semantic summary of network environment, devices, and services."""
    try:
        service = get_local_network_service()
        summary = service.get_intelligence_summary()
        return jsonify({"ok": True, "summary": summary})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/intelligence/devices", methods=["GET"])
@local_network_bp.route("/network_intelligence/devices", methods=["GET"])
@token_required
def get_network_intelligence_devices():
    """Get classified subnet devices with evidence, confidence, and presence."""
    try:
        service = get_local_network_service()
        devices = service.get_classified_devices()
        return jsonify({"ok": True, "devices": devices})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/intelligence/services", methods=["GET"])
@local_network_bp.route("/network_intelligence/services", methods=["GET"])
@token_required
def get_network_intelligence_services():
    """Get managed catalog of local listening services and lifecycles."""
    try:
        service = get_local_network_service()
        services = service.get_service_catalog()
        return jsonify({"ok": True, "services": services})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@local_network_bp.route("/local_network/intelligence/changes", methods=["GET"])
@local_network_bp.route("/network_intelligence/changes", methods=["GET"])
@token_required
def get_network_intelligence_changes():
    """Get bounded chronological list of network intelligence events and transitions."""
    try:
        limit = request.args.get("limit", 100)
        try:
            limit = int(limit)
        except (ValueError, TypeError):
            limit = 100
        service = get_local_network_service()
        changes = service.get_intelligence_changes(limit=limit)
        return jsonify({"ok": True, "changes": changes})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500



