import json
import os
import time

class BaselineEngine:
    """
    Behavioral Baseline Engine (Level 2)
    Continuously learns 'normal' behavior using EMA and persistent storage.
    """
    def __init__(self, persistence_path="fluffy_data/guardian/baselines.json", alpha=0.01):
        self.path = persistence_path
        self.alpha = alpha  # Very slow adaptation (Level 2 requires stability)
        self.baselines = self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r") as f:
                    data = json.load(f)
                    # Ensure metadata is present
                    if "_metadata" not in data:
                        data["_metadata"] = {"system_first_run": time.time()}
                    return data
            except Exception:
                return {"_metadata": {"system_first_run": time.time()}}
        return {"_metadata": {"system_first_run": time.time()}}

    def save(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w") as f:
                json.dump(self.baselines, f, indent=2)
        except Exception as e:
            # Using stderr for silent logging in dev
            import sys
            print(f"[Guardian] Failed to save baselines: {e}", file=sys.stderr)

    def update(self, process_name, cpu, ram, child_count, net_sent=0.0, net_received=0.0, lifespan=0):
        """
        Updates the baseline for a process using exponential moving averages.
        """
        if process_name not in self.baselines:
            # Initial baseline (Level 2: seeded with first observation)
            self.baselines[process_name] = {
                "avg_cpu": float(cpu),
                "peak_cpu": float(cpu),
                "avg_ram": float(ram),
                "peak_ram": float(ram),
                "ram_growth_rate": 0.0,
                "avg_children": float(child_count),
                "child_spawn_rate": 0.0,
                "avg_net_sent": float(net_sent),
                "avg_net_received": float(net_received),
                "avg_lifespan": float(lifespan),
                "samples": 1,
                "first_seen": time.time(),
                "last_seen": time.time(),
                "restart_count": 0,
                "trusted": False
            }
        else:
            b = self.baselines[process_name]
            
            # Migration: Add missing fields for legacy baselines
            if "avg_cpu" not in b: b["avg_cpu"] = cpu
            if "peak_cpu" not in b: b["peak_cpu"] = cpu
            if "avg_ram" not in b: b["avg_ram"] = ram
            if "peak_ram" not in b: b["peak_ram"] = ram
            if "ram_growth_rate" not in b: b["ram_growth_rate"] = 0.0
            if "avg_children" not in b: b["avg_children"] = float(child_count)
            if "child_spawn_rate" not in b: b["child_spawn_rate"] = 0.0
            if "avg_net_sent" not in b: b["avg_net_sent"] = 0.0
            if "avg_net_received" not in b: b["avg_net_received"] = 0.0
            if "avg_lifespan" not in b: b["avg_lifespan"] = 0.0
            if "samples" not in b: b["samples"] = 1
            if "restart_count" not in b: b["restart_count"] = 0
            if "trusted" not in b: b["trusted"] = False

            # EMA Updates (Deterministic and explainable slow adaptation)
            b["avg_cpu"] = (self.alpha * cpu) + ((1 - self.alpha) * b["avg_cpu"])
            b["peak_cpu"] = max(b["peak_cpu"], cpu)
            
            # RAM Adaptation
            old_ram = b["avg_ram"]
            b["avg_ram"] = (self.alpha * ram) + ((1 - self.alpha) * b["avg_ram"])
            b["peak_ram"] = max(b["peak_ram"], ram)
            
            # Growth Rate (Delta between observations smoothed)
            current_growth = ram - old_ram
            b["ram_growth_rate"] = (self.alpha * current_growth) + ((1 - self.alpha) * b["ram_growth_rate"])
            
            # Children
            b["avg_children"] = (self.alpha * child_count) + ((1 - self.alpha) * b["avg_children"])
            
            # Network
            b["avg_net_sent"] = (self.alpha * net_sent) + ((1 - self.alpha) * b["avg_net_sent"])
            b["avg_net_received"] = (self.alpha * net_received) + ((1 - self.alpha) * b["avg_net_received"])
            
            # Lifespan (if process ended, tracked via listener)
            if lifespan > 0:
                b["avg_lifespan"] = (self.alpha * lifespan) + ((1 - self.alpha) * b["avg_lifespan"])

            b["samples"] += 1
            b["last_seen"] = time.time()

    def get_baseline(self, process_name):
        return self.baselines.get(process_name)

    def increment_restart(self, process_name):
        if process_name in self.baselines:
            self.baselines[process_name]["restart_count"] += 1

    def mark_trusted(self, process_name):
        if process_name in self.baselines:
            self.baselines[process_name]["trusted"] = True
            self.save()

    def clear_all_data(self):
        self.baselines = {"_metadata": {"system_first_run": time.time()}}
        if os.path.exists(self.path):
            try:
                os.remove(self.path)
            except Exception:
                pass
        self.save()

    def get_learning_progress(self):
        """Returns % of the 5-minute learning phase completed."""
        first_run = self.baselines.get("_metadata", {}).get("system_first_run", time.time())
        elapsed = time.time() - first_run
        return min(100, int((elapsed / 300) * 100))
