class GuardianState:
    """
    Global Guardian State Machine (Level 2)
    Determines the overall system stance based on aggregate risk.
    """
    CALM = "CALM"
    WATCHFUL = "WATCHFUL"
    ALERT = "ALERT"
    DEFENSIVE = "DEFENSIVE"
    CRITICAL = "CRITICAL"

    def __init__(self):
        self.current_state = self.CALM
        self.max_score = 0.0
        self.suspicious_count = 0

    def update(self, scores):
        """
        Updates the global state based on the current collection of PID risk scores.
        """
        if not scores:
            self.current_state = self.CALM
            self.max_score = 0.0
            self.suspicious_count = 0
            return self.current_state

        self.max_score = max(scores.values()) if scores else 0.0
        self.suspicious_count = sum(1 for s in scores.values() if s >= 5.0)

        # Level 2 State Logic
        if self.max_score >= 25.0 or self.suspicious_count >= 5:
            self.current_state = self.CRITICAL
        elif self.max_score >= 15.0 or self.suspicious_count >= 3:
            self.current_state = self.DEFENSIVE
        elif self.max_score >= 10.0 or self.suspicious_count >= 1:
            self.current_state = self.ALERT
        elif self.max_score >= 5.0:
            self.current_state = self.WATCHFUL
        else:
            self.current_state = self.CALM

        return self.current_state

    def get_ui_info(self):
        """
        Returns info for UI/Tray color sync.
        """
        colors = {
            self.CALM: "healthy",
            self.WATCHFUL: "warning",
            self.ALERT: "warning",
            self.DEFENSIVE: "warning",
            self.CRITICAL: "critical"
        }
        return {
            "state": self.current_state,
            "status_color": colors.get(self.current_state, "healthy"),
            "intensity": min(100, int(self.max_score * 5))
        }
