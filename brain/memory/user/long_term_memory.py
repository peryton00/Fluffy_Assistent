"""
Long-term Memory Manager for Fluffy Assistant (User Memory)
Persists user preferences, trusted processes, behavioral history, and profile across sessions.
"""

import json
import os
from threading import Lock
from datetime import datetime, timezone
from pathlib import Path

MEMORY_PATH = Path("fluffy_data/memory/long_term.json")
_lock = Lock()


def _utc_now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _empty_memory() -> dict:
    """Return empty memory structure"""
    now = _utc_now_iso()
    return {
        "user_profile": {
            "identity": {},
            "preferences": {
                "theme": {"value": "dark"},
                "voice_speed": {"value": 1.0},
                "auto_normalize": {"value": False},
                "alert_threshold": {"value": 60}
            },
            "system_preferences": {
                "trusted_processes": {"value": []},
                "ignored_processes": {"value": []},
                "pinned_processes": {"value": []}
            }
        },
        "behavior": {
            "frequent_intents": {},
            "learned_apps": [],
            "command_history": []
        },
        "metadata": {
            "created_at": now,
            "last_updated": now,
            "version": "2.0"
        }
    }


def load_memory() -> dict:
    """Load memory from disk, create if not exists"""
    if not MEMORY_PATH.exists():
        return _empty_memory()
    
    with _lock:
        try:
            with open(MEMORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
                return _empty_memory()
        except Exception as e:
            print(f"⚠️ Memory load error: {e}")
            return _empty_memory()


def save_memory(memory: dict) -> None:
    """Save memory to disk safely"""
    if not isinstance(memory, dict):
        return
    
    # Update timestamp
    memory["metadata"]["last_updated"] = _utc_now_iso()
    
    # Ensure directory exists
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    with _lock:
        # Atomic write with backup
        temp_path = MEMORY_PATH.with_suffix(".tmp")
        backup_path = MEMORY_PATH.with_suffix(".bak")
        
        try:
            # Write to temp file
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(memory, f, indent=2, ensure_ascii=False)
            
            # Backup existing
            if MEMORY_PATH.exists():
                MEMORY_PATH.replace(backup_path)
            
            # Move temp to main
            temp_path.replace(MEMORY_PATH)
            
        except Exception as e:
            print(f"⚠️ Memory save error: {e}")
            # Restore from backup if failed
            if backup_path.exists() and not MEMORY_PATH.exists():
                backup_path.replace(MEMORY_PATH)


def _recursive_update(target: dict, updates: dict) -> bool:
    """Recursively merge updates into target. Returns True if changed."""
    changed = False
    
    for key, value in updates.items():
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        
        # Nested dict without 'value' key = recurse
        if isinstance(value, dict) and "value" not in value:
            if key not in target or not isinstance(target[key], dict):
                target[key] = {}
                changed = True
            if _recursive_update(target[key], value):
                changed = True
        else:
            # Leaf node - wrap in value structure if needed
            entry = value if isinstance(value, dict) and "value" in value else {"value": value}
            if key not in target or target[key] != entry:
                target[key] = entry
                changed = True
    
    return changed


def update_memory(memory_update: dict) -> dict:
    """Merge updates into memory and save"""
    if not isinstance(memory_update, dict):
        return load_memory()
    
    memory = load_memory()
    
    # Apply updates to user_profile
    if "user_profile" in memory_update:
        if _recursive_update(memory["user_profile"], memory_update["user_profile"]):
            save_memory(memory)
    
    return memory


def get_preference(key: str, default=None):
    """Get a specific preference value"""
    memory = load_memory()
    prefs = memory.get("user_profile", {}).get("preferences", {})
    
    if key in prefs and "value" in prefs[key]:
        return prefs[key]["value"]
    
    return default


def set_preference(key: str, value):
    """Set a specific preference"""
    memory = load_memory()
    if "user_profile" not in memory:
        memory["user_profile"] = {}
    if "preferences" not in memory["user_profile"]:
        memory["user_profile"]["preferences"] = {}
    
    memory["user_profile"]["preferences"][key] = {"value": value}
    save_memory(memory)


def add_trusted_process(process_name: str):
    """Add process to trusted list"""
    memory = load_memory()
    trusted = memory["user_profile"]["system_preferences"]["trusted_processes"]["value"]
    
    if process_name not in trusted:
        trusted.append(process_name)
        save_memory(memory)
        print(f"✅ Added {process_name} to trusted processes")


def remove_trusted_process(process_name: str):
    """Remove process from trusted list"""
    memory = load_memory()
    trusted = memory["user_profile"]["system_preferences"]["trusted_processes"]["value"]
    
    if process_name in trusted:
        trusted.remove(process_name)
        save_memory(memory)
        print(f"✅ Removed {process_name} from trusted processes")


def is_trusted_process(process_name: str) -> bool:
    """Check if process is trusted"""
    memory = load_memory()
    trusted = memory["user_profile"]["system_preferences"]["trusted_processes"]["value"]
    return process_name in trusted


def get_trusted_processes() -> list:
    """Get list of all trusted processes"""
    memory = load_memory()
    return memory["user_profile"]["system_preferences"]["trusted_processes"]["value"]


def clear_trusted_processes():
    """Clear all trusted processes from long-term memory."""
    memory = load_memory()
    if "user_profile" in memory and "system_preferences" in memory["user_profile"]:
        if "trusted_processes" in memory["user_profile"]["system_preferences"]:
            memory["user_profile"]["system_preferences"]["trusted_processes"]["value"] = []
            save_memory(memory)
            print("✅ Cleared all trusted processes from long-term memory")


def add_ignored_process(process_name: str):
    """Add process to ignored list (won't show in UI)"""
    memory = load_memory()
    ignored = memory["user_profile"]["system_preferences"]["ignored_processes"]["value"]
    
    if process_name not in ignored:
        ignored.append(process_name)
        save_memory(memory)


def is_ignored_process(process_name: str) -> bool:
    """Check if process is ignored"""
    memory = load_memory()
    ignored = memory["user_profile"]["system_preferences"]["ignored_processes"]["value"]
    return process_name in ignored


def add_pinned_process(process_name: str):
    """Add process to pinned list (always show at top)"""
    memory = load_memory()
    pinned = memory["user_profile"]["system_preferences"]["pinned_processes"]["value"]
    
    if process_name not in pinned:
        pinned.append(process_name)
        save_memory(memory)


def remove_pinned_process(process_name: str):
    """Remove process from pinned list"""
    memory = load_memory()
    pinned = memory["user_profile"]["system_preferences"]["pinned_processes"]["value"]
    
    if process_name in pinned:
        pinned.remove(process_name)
        save_memory(memory)


def is_pinned_process(process_name: str) -> bool:
    """Check if process is pinned"""
    memory = load_memory()
    pinned = memory["user_profile"]["system_preferences"]["pinned_processes"]["value"]
    return process_name in pinned


def get_minimal_memory_for_llm() -> dict:
    """Get compact memory for LLM context (reduces token usage)"""
    memory = load_memory()
    profile = memory.get("user_profile", {})
    
    result = {}
    
    # Identity
    identity = profile.get("identity", {})
    if "name" in identity and "value" in identity["name"]:
        result["user_name"] = identity["name"]["value"]
    if "location" in identity and "value" in identity["location"]:
        result["user_location"] = identity["location"]["value"]
    
    # Preferences
    prefs = profile.get("preferences", {})
    for key in ["theme", "alert_threshold"]:
        if key in prefs and "value" in prefs[key]:
            result[key] = prefs[key]["value"]
    
    # System preferences
    sys_prefs = profile.get("system_preferences", {})
    if "trusted_processes" in sys_prefs and "value" in sys_prefs["trusted_processes"]:
        trusted = sys_prefs["trusted_processes"]["value"]
        if trusted:  # Only include if not empty
            result["trusted_processes"] = trusted
    
    return {k: v for k, v in result.items() if v}


# ── Behavioral Memory ─────────────────────────────────────────────────────────

def record_command(intent: str, success: bool) -> None:
    """Record a command execution to behavioral memory (keeps last 100)."""
    memory = load_memory()

    behavior = memory.setdefault("behavior", {"frequent_intents": {}, "learned_apps": [], "command_history": []})

    # Update frequency counter
    frequent = behavior.setdefault("frequent_intents", {})
    frequent[intent] = frequent.get(intent, 0) + 1

    # Append to history (trim to last 100)
    history = behavior.setdefault("command_history", [])
    history.append({
        "intent": intent,
        "success": success,
        "timestamp": _utc_now_iso()
    })
    behavior["command_history"] = history[-100:]

    save_memory(memory)


def get_frequent_intents(top_n: int = 5) -> list:
    """Get the most frequently used intents for smarter defaults."""
    memory = load_memory()
    frequent = memory.get("behavior", {}).get("frequent_intents", {})
    sorted_intents = sorted(frequent.items(), key=lambda x: x[1], reverse=True)
    return [intent for intent, _ in sorted_intents[:top_n]]


# ── Network Intelligence Durable Memory (N9.2) ───────────────────────────────

def get_known_networks() -> dict:
    """Get all known network environment identities from long-term memory."""
    memory = load_memory()
    return memory.get("network_intelligence", {}).get("known_networks", {})


def get_known_network(network_id: str):
    """Get details for a specific known network identity."""
    known = get_known_networks()
    return known.get(network_id)


def save_known_network(
    network_id: str,
    alias=None,
    trusted: bool = False,
    confidence: float = 0.80,
    evidence=None,
) -> None:
    """Save or update a known network identity in long-term memory (idempotent, bounded)."""
    if not network_id:
        return
    memory = load_memory()
    net_intel = memory.setdefault("network_intelligence", {"known_networks": {}, "device_aliases": {}, "approved_services": {}})
    known = net_intel.setdefault("known_networks", {})

    now_iso = _utc_now_iso()
    existing = known.get(network_id, {})

    known[network_id] = {
        "alias": alias if alias is not None else existing.get("alias"),
        "trusted": trusted if trusted is not None else existing.get("trusted", False),
        "confidence": confidence,
        "first_seen": existing.get("first_seen", now_iso),
        "last_seen": now_iso,
        "evidence": evidence or existing.get("evidence", []),
    }

    # Bounded retention: max 64 known networks
    if len(known) > 64:
        sorted_keys = sorted(known.keys(), key=lambda k: known[k].get("last_seen", ""))
        for k in sorted_keys[: len(known) - 64]:
            del known[k]

    save_memory(memory)


def get_device_aliases() -> dict:
    """Get all user-defined device aliases."""
    memory = load_memory()
    return memory.get("network_intelligence", {}).get("device_aliases", {})


def get_device_alias(device_id: str):
    """Get user-defined alias for a device."""
    aliases = get_device_aliases()
    dev = aliases.get(device_id)
    if isinstance(dev, dict):
        return dev.get("alias")
    elif isinstance(dev, str):
        return dev
    return None


def set_device_alias(device_id: str, alias: str, user_classified=None) -> None:
    """Set a user-defined alias for a specific device identifier."""
    if not device_id:
        return
    memory = load_memory()
    net_intel = memory.setdefault("network_intelligence", {"known_networks": {}, "device_aliases": {}, "approved_services": {}})
    aliases = net_intel.setdefault("device_aliases", {})

    now_iso = _utc_now_iso()
    aliases[device_id] = {
        "alias": alias,
        "user_classified": user_classified,
        "updated_at": now_iso,
    }

    # Bounded retention: max 256 device aliases
    if len(aliases) > 256:
        sorted_keys = sorted(aliases.keys(), key=lambda k: aliases[k].get("updated_at", ""))
        for k in sorted_keys[: len(aliases) - 256]:
            del aliases[k]

    save_memory(memory)


def get_approved_services() -> dict:
    """Get all user-approved local services."""
    memory = load_memory()
    return memory.get("network_intelligence", {}).get("approved_services", {})


def set_approved_service(service_key: str, description: str, approved: bool = True) -> None:
    """Register or update an approved local service in long-term memory."""
    if not service_key:
        return
    memory = load_memory()
    net_intel = memory.setdefault("network_intelligence", {"known_networks": {}, "device_aliases": {}, "approved_services": {}})
    approved_services = net_intel.setdefault("approved_services", {})

    now_iso = _utc_now_iso()
    approved_services[service_key] = {
        "description": description,
        "approved": approved,
        "updated_at": now_iso,
    }

    # Bounded retention: max 128 approved services
    if len(approved_services) > 128:
        sorted_keys = sorted(approved_services.keys(), key=lambda k: approved_services[k].get("updated_at", ""))
        for k in sorted_keys[: len(approved_services) - 128]:
            del approved_services[k]

    save_memory(memory)


def project_network_intelligence_to_memory(snapshot_dict_or_obj) -> bool:
    """
    Safely projects durable network knowledge (network identity, aliases) into long-term memory.
    Strictly excludes: packet payloads, Wi-Fi credentials/passwords, raw packet buffers,
    bulk socket flows, and sensitive telemetry.
    Returns True if successfully evaluated/saved without errors.
    """
    try:
        if hasattr(snapshot_dict_or_obj, "to_dict"):
            data = snapshot_dict_or_obj.to_dict()
        elif isinstance(snapshot_dict_or_obj, dict):
            data = snapshot_dict_or_obj
        else:
            return False

        net_id_obj = data.get("network_identity")
        if net_id_obj and isinstance(net_id_obj, dict):
            net_id = net_id_obj.get("network_id")
            if net_id:
                ssid = net_id_obj.get("ssid")
                conf = net_id_obj.get("confidence", 0.80)
                evidence = net_id_obj.get("evidence", [])
                trust = net_id_obj.get("trust_level") == "TRUSTED"
                existing = get_known_network(net_id)
                alias = existing.get("alias") if existing else (ssid if ssid else None)
                save_known_network(
                    network_id=net_id,
                    alias=alias,
                    trusted=trust or (existing.get("trusted", False) if existing else False),
                    confidence=conf,
                    evidence=evidence,
                )
        return True
    except Exception as e:
        print(f"[WARN] Network intelligence memory projection error: {e}")
        return False


# ── Initialize memory on module load ──────────────────────────────────────────

def _initialize():
    """Initialize memory file if it doesn't exist"""
    if not MEMORY_PATH.exists():
        print("🧠 Initializing long-term memory...")
        save_memory(_empty_memory())
        print(f"✅ Memory initialized at {MEMORY_PATH}")


_initialize()
