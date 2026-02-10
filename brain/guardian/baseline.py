import json
import os
import time

class BaselineEngine:
    def __init__(self, persistence_path="brain/guardian/baselines.json", alpha=0.1):
        self.path = persistence_path
        self.alpha = alpha  # EMA smoothing factor
        self.baselines = self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def save(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w") as f:
                json.dump(self.baselines, f, indent=2)
        except Exception as e:
            print(f"[Guardian] Failed to save baselines: {e}")

    def update(self, process_name, cpu, ram, child_count):
        if process_name not in self.baselines:
            # Initial baseline
            self.baselines[process_name] = {
                "avg_cpu": cpu,
                "avg_ram": ram,
                "avg_children": child_count,
                "samples": 1,
                "first_seen": time.time(),
                "last_seen": time.time()
            }
        else:
            b = self.baselines[process_name]
            # EMA Updates
            b["avg_cpu"] = (self.alpha * cpu) + ((1 - self.alpha) * b["avg_cpu"])
            b["avg_ram"] = (self.alpha * ram) + ((1 - self.alpha) * b["avg_ram"])
            b["avg_children"] = (self.alpha * child_count) + ((1 - self.alpha) * b["avg_children"])
            b["samples"] += 1
            b["last_seen"] = time.time()

    def get_baseline(self, process_name):
        return self.baselines.get(process_name)
