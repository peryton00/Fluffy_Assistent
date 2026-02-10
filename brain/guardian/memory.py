import json
import os

class GuardianMemory:
    def __init__(self, persistence_path="fluffy_data/guardian/memory.json"):
        self.path = persistence_path
        self.trusted_names = set()
        self.dangerous_names = set()
        self.ignored_names = set()
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r") as f:
                    data = json.load(f)
                    self.trusted_names = set(data.get("trusted", []))
                    self.dangerous_names = set(data.get("dangerous", []))
                    self.ignored_names = set(data.get("ignored", []))
            except Exception as e:
                print(f"[Guardian] Failed to load memory: {e}")

    def save(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w") as f:
                json.dump({
                    "trusted": list(self.trusted_names),
                    "dangerous": list(self.dangerous_names),
                    "ignored": list(self.ignored_names)
                }, f, indent=2)
        except Exception as e:
            print(f"[Guardian] Failed to save memory: {e}")

    def mark_trusted(self, name):
        self.trusted_names.add(name)
        self.dangerous_names.discard(name)
        self.ignored_names.discard(name)
        self.save()

    def mark_dangerous(self, name):
        self.dangerous_names.add(name)
        self.trusted_names.discard(name)
        self.ignored_names.discard(name)
        self.save()

    def mark_ignored(self, name):
        self.ignored_names.add(name)
        self.save()

    def is_trusted(self, name):
        return name in self.trusted_names

    def is_dangerous(self, name):
        return name in self.dangerous_names

    def is_ignored(self, name):
        return name in self.ignored_names
