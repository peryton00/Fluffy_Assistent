from guardian.baseline import BaselineEngine
from guardian.memory import GuardianMemory
from guardian.audit import AuditEngine
from guardian.chain import ChainManager
from guardian.state import GuardianState
from guardian.anomaly import AnomalyDetector
from guardian.scorer import RiskScorer
from guardian.intervention import InterventionEngine
from guardian.fingerprint import FingerprintManager
import state
import sys
import os
import time
import json

# Centralized Guardian Components (Level 2)
GUARDIAN_MEMORY = GuardianMemory(persistence_path="fluffy_data/guardian/memory.json")
GUARDIAN_BASELINE = BaselineEngine(persistence_path="fluffy_data/guardian/baselines.json")
GUARDIAN_DETECTOR = AnomalyDetector()
GUARDIAN_SCORER = RiskScorer(memory=GUARDIAN_MEMORY)
GUARDIAN_FINGERPRINTS = FingerprintManager()
GUARDIAN_CHAINS = ChainManager()
GUARDIAN_STATE = GuardianState()
GUARDIAN_INTERVENTION = InterventionEngine()
GUARDIAN_AUDIT = AuditEngine(persistence_path="fluffy_data/guardian/audit.json")

def reset_guardian():
    """
    Initiates a comprehensive Guardian data reset, clearing all learned behaviors
    and restarting the 5-minute learning phase with a fresh timestamp.
    """
    print("[Guardian] Initiating comprehensive data reset...", file=sys.stderr)
    
    # 1. Clear components in memory
    from guardian_manager import GUARDIAN_BASELINE, GUARDIAN_MEMORY, GUARDIAN_AUDIT, GUARDIAN_CHAINS
    GUARDIAN_BASELINE.clear_all_data()
    GUARDIAN_MEMORY.clear_all_data()
    GUARDIAN_AUDIT.clear_all_data()
    GUARDIAN_CHAINS.clear_all_data()
    
    # 2. Reset in-memory tracking in state.py (if shared)
    state.SECURITY_ALERTS = []
    # Use a thread-safe way to clear PENDING_CONFIRMATIONS if needed
    with state.LOCK:
        state.PENDING_CONFIRMATIONS = [c for c in state.PENDING_CONFIRMATIONS if not ("Guardian" in c["command_name"] or "suspicious" in c["details"].lower())]
    
    # 3. Clear global state cached values for UI
    with state.LOCK:
        if state.LATEST_STATE:
            state.LATEST_STATE["_guardian_verdicts"] = []
            state.LATEST_STATE["_guardian_state"] = GUARDIAN_STATE.get_ui_info()
            state.LATEST_STATE["_guardian_state"]["learning_progress"] = 0
            state.LATEST_STATE["_guardian_state"]["is_learning"] = True
            state.LATEST_STATE["_insights"] = [i for i in state.LATEST_STATE.get("_insights", []) if "[Guardian]" not in i]

    # 4. Force clear data files to ensure they are empty on disk
    files_to_clear = {
        "status.json": {},
        "fluffy_data/guardian/audit.json": [],
        "fluffy_data/guardian/memory.json": {},
        "fluffy_data/guardian/baselines.json": {"_metadata": {"system_first_run": int(time.time())}}
    }
    
    for filepath, initial_structure in files_to_clear.items():
        try:
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w') as f:
                json.dump(initial_structure, f, indent=2)
            print(f"[Guardian] Cleared {filepath}", file=sys.stderr)
        except Exception as e:
            print(f"[Guardian] Warning: Could not clear {filepath}: {e}", file=sys.stderr)

    # 5. CRITICAL: Reload baselines into memory (already has correct timestamp from clear_all_data())
    GUARDIAN_BASELINE.baselines = GUARDIAN_BASELINE._load()
    print(f"[Guardian] Reloaded baselines with fresh timestamp: {GUARDIAN_BASELINE.baselines.get('_metadata')}", file=sys.stderr)

    state.add_execution_log("Guardian comprehensive reset complete. Learning phase restarted.", "warning")
