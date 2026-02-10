import json
import os
import time

class AuditEngine:
    def __init__(self, persistence_path="fluffy_data/guardian/audit.json"):
        self.path = persistence_path
        self.events = []
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r") as f:
                    self.events = json.load(f)
                    # Keep only last 1000 events for performance
                    self.events = self.events[-1000:]
            except Exception as e:
                print(f"[Guardian] Failed to load audit trail: {e}")

    def save(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w") as f:
                json.dump(self.events[-1000:], f, indent=2)
        except Exception as e:
            print(f"[Guardian] Failed to save audit trail: {e}")

    def log_event(self, event_type, process_name, details):
        """
        Records an event in the audit trail.
        event_type: 'Alert', 'Intervention', 'UserDecision', 'System'
        """
        event = {
            "timestamp": time.time(),
            "type": event_type,
            "process": process_name,
            "details": details
        }
        self.events.append(event)
        
        # Periodic flush (every 50 events to reduce IO)
        if len(self.events) % 50 == 0:
            self.save()

    def get_history(self, process_name=None):
        if process_name:
            return [e for e in self.events if e["process"] == process_name]
        return self.events
