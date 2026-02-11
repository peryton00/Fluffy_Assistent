class AnomalyDetector:
    """
    Guardian Anomaly Detection Engine (Level 2)
    Detects behavioral deviations by comparing live fingerprints against learned baselines.
    """
    def __init__(self, thresholds=None):
        self.thresholds = thresholds or {
            "cpu_multiplier": 3.0,
            "ram_multiplier": 2.0,
            "net_multiplier": 4.0,
            "child_multiplier": 2.5,
            "min_ram_growth": 5.0, # MB
            "min_cpu_abs": 10.0, # %
            "min_net_abs": 500.0 # KB/s
        }

    def analyze(self, fingerprint, baseline):
        """
        Analyzes a process fingerprint against its baseline.
        Returns a list of structured anomaly objects.
        """
        if not baseline or baseline.get("samples", 0) < 10:
            # Not enough data to form a reliable baseline comparison
            return []

        anomalies = []
        name = fingerprint.name
        pid = fingerprint.pid
        is_trusted = baseline.get("trusted", False)

        # 1. CPU Anomaly Detection
        avg_cpu = max(baseline.get("avg_cpu", 1.0), 1.0)
        cpu_triggered = False
        
        # Standard anomaly
        if not is_trusted:
            if fingerprint.cpu_ema > avg_cpu * self.thresholds["cpu_multiplier"] and fingerprint.cpu_ema > self.thresholds["min_cpu_abs"]:
                cpu_triggered = True
        # Hard limit for trusted
        elif fingerprint.cpu_ema > 90.0:
            cpu_triggered = True

        if cpu_triggered:
            deviation = fingerprint.cpu_ema / avg_cpu if avg_cpu > 0 else 10.0
            anomalies.append({
                "pid": pid,
                "process_name": name,
                "type": "CPU_DEVIATION",
                "deviation_ratio": round(deviation, 2),
                "severity_score": 10 if is_trusted else min(10, int(deviation * 1.5)),
                "confidence_score": 1.0 if is_trusted else self._calculate_confidence(baseline, duration_penalty=False),
                "explanation": f"CRITICAL: Trusted process hit hard CPU limit ({fingerprint.cpu_ema:.1f}%)." if is_trusted else f"CPU usage ({fingerprint.cpu_ema:.1f}%) is {deviation:.1f}x higher than baseline ({avg_cpu:.1f}%)."
            })

        # 2. RAM Leak / Growth Detection
        growth_rate = fingerprint.get_growth_rate()
        avg_ram = max(baseline.get("avg_ram", 10.0), 10.0)
        
        # Trusted processes ignore leaks, only hit hard limit
        if not is_trusted:
            # Check for continuous growth (Leak)
            if growth_rate > 1.0 and fingerprint.ram_ema > avg_ram * 1.2:
                anomalies.append({
                    "pid": pid,
                    "process_name": name,
                    "type": "MEMORY_LEAK",
                    "deviation_ratio": round(growth_rate, 2),
                    "severity_score": 6,
                    "confidence_score": 0.8,
                    "explanation": f"Sustained RAM growth detected ({growth_rate:.1f} MB/sample trend)."
                })
        
        # RAM Explosion / Hard Limit (5GB = 5120MB)
        ram_triggered = False
        if not is_trusted:
            if fingerprint.ram_ema > avg_ram * self.thresholds["ram_multiplier"]:
                ram_triggered = True
        elif fingerprint.ram_ema > 5120.0:
            ram_triggered = True

        if ram_triggered:
            deviation = fingerprint.ram_ema / avg_ram if avg_ram > 0 else 10.0
            anomalies.append({
                "pid": pid,
                "process_name": name,
                "type": "MEMORY_EXPLOSION",
                "deviation_ratio": round(deviation, 2),
                "severity_score": 10 if is_trusted else 7,
                "confidence_score": 1.0 if is_trusted else 0.9,
                "explanation": f"CRITICAL: Trusted process hit hard RAM limit ({fingerprint.ram_ema:.0f} MB)." if is_trusted else f"RAM usage ({fingerprint.ram_ema:.0f} MB) is {deviation:.1f}x higher than baseline ({avg_ram:.0f} MB)."
            })

        # 3. Network Anomaly Detection (Ignored for trusted unless we want hard limits there too)
        if not is_trusted:
            avg_net_sent = max(baseline.get("avg_net_sent", 0.0), 10.0)
            if fingerprint.net_sent_ema > avg_net_sent * self.thresholds["net_multiplier"] and fingerprint.net_sent_ema > self.thresholds["min_net_abs"]:
                deviation = fingerprint.net_sent_ema / avg_net_sent
                anomalies.append({
                    "pid": pid,
                    "process_name": name,
                    "type": "NETWORK_BURST",
                    "deviation_ratio": round(deviation, 2),
                    "severity_score": 8,
                    "confidence_score": 0.85,
                    "explanation": f"Outbound network flow ({fingerprint.net_sent_ema:.1f} KB/s) is {deviation:.1f}x higher than baseline ({avg_net_sent:.1f} KB/s)."
                })

        # 4. Child Proliferation (Ignored for trusted)
        if not is_trusted:
            avg_children = max(baseline.get("avg_children", 0.0), 1.0)
            curr_children = fingerprint.child_counts[-1] if fingerprint.child_counts else 0
            if curr_children > avg_children * self.thresholds["child_multiplier"] and curr_children > avg_children + 3:
                deviation = curr_children / avg_children
                anomalies.append({
                    "pid": pid,
                    "process_name": name,
                    "type": "CHILD_EXPLOSION",
                    "deviation_ratio": round(deviation, 2),
                    "severity_score": 9,
                    "confidence_score": 0.95,
                    "explanation": f"Process spawned {curr_children} children (Typical: ~{avg_children:.1f})."
                })

        # 5. Respawn Loops (Restart Frequency)
        # Restart loops are detected via baseline.restart_count > threshold
        if baseline.get("restart_count", 0) > 5:
            anomalies.append({
                "pid": pid,
                "process_name": name,
                "type": "RESTART_LOOP",
                "deviation_ratio": float(baseline["restart_count"]),
                "severity_score": 10,
                "confidence_score": 1.0,
                "explanation": f"Process instability: detected {baseline['restart_count']} restarts in a short window."
            })

        return anomalies

    def _calculate_confidence(self, baseline, duration_penalty=True):
        """
        Calculates confidence based on baseline sample size.
        """
        samples = baseline.get("samples", 0)
        confidence = min(0.5 + (samples / 100), 0.98)
        return round(confidence, 2)
