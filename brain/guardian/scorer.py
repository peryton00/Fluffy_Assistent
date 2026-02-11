class RiskScorer:
    """
    Weighted Risk Scoring Engine (Level 2)
    Accumulates suspicion scores per PID with time-based decay.
    """
    def __init__(self, memory=None):
        self.memory = memory # Reference to GuardianMemory (Phase 11.1)
        self.scores = {} # PID -> current_score
        
        # Level 2 Weights
        self.weights = {
            "CPU_DEVIATION": 2,
            "MEMORY_LEAK": 2,
            "MEMORY_EXPLOSION": 4, # Higher than leak for immediate impact
            "NETWORK_BURST": 3,
            "CHILD_EXPLOSION": 4,
            "RESTART_LOOP": 3
        }
        
        # Penalties/Boosts
        self.TRUSTED_PENALTY = -25
        self.USER_INITIATED_PENALTY = -5
        
        # Decay Factor (Level 2 requires normalization over time)
        self.DECAY_RATE = 0.5 # Points removed per telemetry cycle if no new anomalies

    def score(self, process_name, pid, anomalies):
        """
        Calculates and updates the risk score for a process.
        """
        if pid not in self.scores:
            self.scores[pid] = 0.0

        # 1. Base Score calculation from current anomalies
        turn_score = 0
        for a in anomalies:
            turn_score += self.weights.get(a["type"], 1)

        # 2. Accumulate or Decay
        if turn_score > 0:
            self.scores[pid] += turn_score
        else:
            # Decay score if no anomalies found this turn
            self.scores[pid] = max(0.0, self.scores[pid] - self.DECAY_RATE)

        # 3. Apply Multipliers (Trusted / User)
        final_score = self.scores[pid]
        
        if self.memory:
            if self.memory.is_trusted(process_name):
                final_score += self.TRUSTED_PENALTY
            elif self.memory.is_dangerous(process_name):
                final_score += 10 # Bonus for known threats
        
        # Clamp score to reasonable range
        final_score = max(0.0, final_score)
        
        return final_score

    def get_level(self, score):
        """
        Maps score to Level 2 Escalation Thresholds.
        """
        if score <= 4:
            return "Observe"
        elif score <= 7:
            return "Inform"
        elif score <= 10:
            return "Warn"
        elif score <= 14:
            return "Recommend"
        else:
            return "Request Confirmation"

    def cleanup(self, active_pids):
        """
        Cleanup scores for PIDs that have ended.
        """
        dead_pids = [pid for pid in self.scores if pid not in active_pids]
        for pid in dead_pids:
            del self.scores[pid]
