"""
Long-term memory manager for Fluffy Assistant
Persists user preferences, trusted processes, and profile across sessions
"""

import json
import os
from threading import Lock
from datetime import datetime
from pathlib import Path

MEMORY_PATH = Path("fluffy_data/memory/long_term.json")
_lock = Lock()


def _empty_memory() -> dict:
    """Return empty memory structure"""
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
        "metadata": {
            "created_at": datetime.utcnow().isoformat() + "Z",
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "version": "1.0"
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
    memory["metadata"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    
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


# Initialize memory on module load
def _initialize():
    """Initialize memory file if it doesn't exist"""
    if not MEMORY_PATH.exists():
        print("🧠 Initializing long-term memory...")
        save_memory(_empty_memory())
        print(f"✅ Memory initialized at {MEMORY_PATH}")


_initialize()
