class AnomalyDetector:
    def __init__(self, cpu_threshold=3.0, ram_threshold=1.5, child_threshold=2.0):
        # Thresholds are multipliers of the average
        self.cpu_threshold = cpu_threshold
        self.ram_threshold = ram_threshold
        self.child_threshold = child_threshold
        
        # State tracking for resource trends (Keyed by PID)
        self.pid_history = {} # PID -> { "cpu_samples": [], "ram_samples": [] }
        
        # State tracking for restart detection (Keyed by Name)
        self.name_history = {} # Name -> { "last_pids": set(), "restarts": 0, "last_cycle_pids": set() }

    def analyze(self, process_info, baseline):
        if not baseline or baseline.get("samples", 0) < 5:
            return []

        anomalies = []
        name = process_info["name"]
        pid = process_info["pid"]
        curr_cpu = process_info["cpu_percent"]
        curr_ram = process_info["ram_mb"]
        curr_children = len(process_info.get("children", []))

        # 1. Update Resource History (PID-specific)
        if pid not in self.pid_history:
            self.pid_history[pid] = {"cpu_samples": [], "ram_samples": []}
        
        phist = self.pid_history[pid]
        phist["cpu_samples"] = (phist["cpu_samples"] + [curr_cpu])[-10:]
        phist["ram_samples"] = (phist["ram_samples"] + [curr_ram])[-10:]

        # 2. Update Name History (Restart Detection)
        if name not in self.name_history:
            self.name_history[name] = {"all_pids_seen": set(), "cycle_pids": set(), "restarts": 0}
        
        nhist = self.name_history[name]
        
        # Cleanup: If a PID hasn't been seen in a while, it might be dead
        # Truly robust cleanup would need a 'active_pids' list from listener

        # --- ADVANCED ANOMALY DETECTION ---

        baseline_samples = baseline.get("samples", 0)
        
        # A. CPU Anomaly (PID-based)
        avg_cpu = max(baseline["avg_cpu"], 0.5)
        if curr_cpu > avg_cpu * self.cpu_threshold and curr_cpu > 5.0:
            sustained_count = sum(1 for c in phist["cpu_samples"][-5:] if c > avg_cpu * 2)
            confidence = min(0.5 + (baseline_samples / 100), 0.95)
            
            if sustained_count >= 5:
                anomalies.append({
                    "type": "SUSTAINED_CPU",
                    "severity": 3,
                    "message": f"Sustained high CPU usage ({curr_cpu:.1f}%) detected for over 10s.",
                    "actual": f"{curr_cpu:.1f}%",
                    "baseline": f"{avg_cpu:.1f}%",
                    "confidence": confidence,
                    "samples": baseline_samples
                })
            else:
                anomalies.append({
                    "type": "CPU_SPIKE",
                    "severity": 1,
                    "message": f"CPU spike detected ({curr_cpu:.1f}%).",
                    "actual": f"{curr_cpu:.1f}%",
                    "baseline": f"{avg_cpu:.1f}%",
                    "confidence": confidence * 0.8,
                    "samples": baseline_samples
                })

        # B. RAM Anomaly (PID-based)
        avg_ram = max(baseline["avg_ram"], 10.0)
        if curr_ram > avg_ram * self.ram_threshold and curr_ram - avg_ram > 50:
            confidence = min(0.6 + (baseline_samples / 100), 0.98)
            if len(phist["ram_samples"]) >= 5:
                is_leaking = all(phist["ram_samples"][i] < phist["ram_samples"][i+1] for i in range(len(phist["ram_samples"])-1))
                if is_leaking:
                    anomalies.append({
                        "type": "MEMORY_LEAK",
                        "severity": 3,
                        "message": f"Potential memory leak detected. RAM has increased consistently to {curr_ram} MB.",
                        "actual": f"{curr_ram} MB",
                        "baseline": f"{avg_ram:.1f} MB",
                        "confidence": confidence,
                        "samples": baseline_samples
                    })
                else:
                    anomalies.append({
                        "type": "MEMORY_DEVIATION",
                        "severity": 2,
                        "message": f"Significant RAM deviation ({curr_ram} MB) from baseline ({avg_ram:.1f} MB).",
                        "actual": f"{curr_ram} MB",
                        "baseline": f"{avg_ram:.1f} MB",
                        "confidence": confidence * 0.9,
                        "samples": baseline_samples
                    })

        # C. Crash/Restart Loops (Name-based, cross-cycle logic)
        # We only increment restarts if a NEW PID appears that wasn't in the previous cycle
        if pid not in nhist["all_pids_seen"]:
            nhist["restarts"] += 1
            nhist["all_pids_seen"].add(pid)
            
        if nhist["restarts"] >= 4: # Threshold for "Loop"
             anomalies.append({
                "type": "RESTART_LOOP",
                "severity": 5,
                "message": f"Process instability detected. {name} has spawned {nhist['restarts']} unique PIDs recently.",
                "actual": f"{nhist['restarts']} starts",
                "baseline": "1 start",
                "confidence": 0.9,
                "samples": nhist["restarts"]
            })

        # D. Process Proliferation
        avg_children = max(baseline["avg_children"], 1.0)
        if curr_children > avg_children * self.child_threshold and curr_children > avg_children + 2:
            anomalies.append({
                "type": "CHILD_PROLIFERATION",
                "severity": 3,
                "message": f"Sudden explosion of child processes: {curr_children} (Normal: ~{avg_children:.1f}).",
                "actual": str(curr_children),
                "baseline": f"~{avg_children:.1f}",
                "confidence": 0.9,
                "samples": baseline_samples
            })

        return anomalies
