import os
import time
import platform_utils

class SecurityMonitor:
    def __init__(self):
        self.process_history = {}  # PID -> history data
        self.scores = {}           # PID -> score
        self.trusted_pids = set()
        self.ignored_pids = set()
        self.alert_threshold = 25
        self.active_pids = set()

    def analyze(self, telemetry, ui_active):
        """
        Main entry point for behavior analysis.
        """
        system = telemetry.get("system", {})
        processes = system.get("processes", {}).get("top_ram", [])
        
        # Track active PIDs for this cycle
        self.active_pids = {p["pid"] for p in processes}
        
        timestamp = telemetry.get("timestamp", time.time())
        persistence_entries = telemetry.get("persistence", [])
        current_pids = set()
        alerts = []

        # Count children for each parent
        parent_counts = {}
        for p in processes:
            ppid = p.get("parent_pid")
            if ppid:
                parent_counts[ppid] = parent_counts.get(ppid, 0) + 1

        for p in processes:
            pid = p["pid"]
            current_pids.add(pid)
            
            if pid in self.ignored_pids or pid in self.trusted_pids:
                continue

            # Pass parent_counts and persistence to score update
            self._update_process_score(p, timestamp, ui_active, parent_counts.get(pid, 0), persistence_entries)
            
            score = self.scores.get(pid, 0)
            if score >= self.alert_threshold:
                hist = self.process_history.get(pid, {})
                alerts.append({
                    "pid": pid,
                    "name": p["name"],
                    "score": round(score, 1),
                    "reasons": list(hist.get("detected_signals", [])),
                    "timestamp": timestamp
                })

        # Cleanup old processes
        known_pids = list(self.scores.keys())
        for pid in known_pids:
            if pid not in current_pids:
                del self.scores[pid]
                if pid in self.process_history:
                    del self.process_history[pid]

        return alerts

    def get_unusual_processes(self):
        """Returns a list of processes with any threat score gain that are still running."""
        unusual = []
        for pid, score in self.scores.items():
            if score > 0 and pid in self.active_pids:
                hist = self.process_history.get(pid, {})
                unusual.append({
                    "pid": pid,
                    "name": hist.get("name", f"PID {pid}"),
                    "score": round(score, 1),
                    "reasons": list(hist.get("detected_signals", []))
                })
        return unusual

    def _update_process_score(self, p, timestamp, ui_active, child_count, persistence_entries):
        pid = p["pid"]
        if pid not in self.process_history:
            self.process_history[pid] = {
                "name": p["name"], # Store name for lookup
                "first_seen": timestamp,
                "last_cpu": p["cpu_percent"],
                "last_ram": p["ram_mb"],
                "detected_signals": set(),
            }
            self.scores[pid] = 0

        hist = self.process_history[pid]
        score_gain = 0
        exe_path = p.get("exe_path", "").lower()

        # Signal 1: Suspicious Directory
        suspicious_patterns = platform_utils.get_suspicious_path_patterns()
        if exe_path and any(s in exe_path for s in suspicious_patterns):
            if "Suspicious Path" not in hist["detected_signals"]:
                hist["detected_signals"].add("Suspicious Path")
                score_gain += 15

        # Signal 2: Resource Spike (CPU)
        cpu_diff = p["cpu_percent"] - hist["last_cpu"]
        if cpu_diff > 40: # 40% jump
            if "CPU Spike" not in hist["detected_signals"]:
                hist["detected_signals"].add("CPU Spike")
                score_gain += 10

        # Signal 3: Background Activity (Disk I/O)
        disk_activity = p.get("disk_read_kb", 0) + p.get("disk_written_kb", 0)
        if not ui_active and disk_activity > 5000: # > 5MB activity while UI is idle
             if "Background Activity" not in hist["detected_signals"]:
                hist["detected_signals"].add("Background Activity")
                score_gain += 5

        # Signal 4: Persistence (Startup Registry)
        if exe_path and any(exe_path in entry.get("command", "").lower() for entry in persistence_entries):
            if "Startup Persistence" not in hist["detected_signals"]:
                hist["detected_signals"].add("Startup Persistence")
                score_gain += 20

        # Signal 5: Rapid Child Spawning
        if child_count > 5: # More than 5 active children
            if "Excessive Child Processes" not in hist["detected_signals"]:
                hist["detected_signals"].add("Excessive Child Processes")
                score_gain += 10

        self.scores[pid] += score_gain

        # Decay score slowly if no new gain
        if score_gain == 0:
            self.scores[pid] = max(0, self.scores[pid] * 0.98 - 0.2)

        hist["last_cpu"] = p["cpu_percent"]
        hist["last_ram"] = p["ram_mb"]

    def mark_ignored(self, pid):
        self.ignored_pids.add(pid)
        if pid in self.scores:
            del self.scores[pid]

    def mark_trusted(self, pid):
        self.trusted_pids.add(pid)
        if pid in self.scores:
             self.scores[pid] = 0
