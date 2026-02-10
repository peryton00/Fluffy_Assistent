class RiskScorer:
    def __init__(self, threshold=5, memory=None):
        self.threshold = threshold
        self.memory = memory
        # Weights (Phase 10.3)
        self.weights = {
            "CPU_SPIKE": 2,
            "SUSTAINED_CPU": 4,
            "MEMORY_DEVIATION": 2,
            "MEMORY_LEAK": 4,
            "CHILD_PROLIFERATION": 3,
            "RESTART_LOOP": 6
        }

    def score(self, process_name, anomalies):
        if not anomalies:
            return 0, []

        total_score = 0
        significant_anomalies = []

        for a in anomalies:
            weight = self.weights.get(a["type"], 1)
            total_score += weight
            significant_anomalies.append(a)

        # Apply Memory Multipliers (Phase 11.1)
        if self.memory:
            if self.memory.is_trusted(process_name):
                total_score -= 20 # Significant penalty for trusted apps
            elif self.memory.is_dangerous(process_name):
                total_score += 10 # Signficant boost for known threats

        # Decide if we should escalate (Phase 10.3)
        should_escalate = total_score >= self.threshold or any(a["severity"] >= 3 for a in anomalies)
        
        return total_score, significant_anomalies if should_escalate else []
