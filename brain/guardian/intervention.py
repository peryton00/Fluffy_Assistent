from enum import IntEnum

class InterventionLevel(IntEnum):
    OBSERVE = 0           # Silent tracking
    INFORM = 1            # Log only
    WARN = 2              # UI Insight
    RECOMMEND = 3         # UI Insight + Suggestion
    REQUEST_PERMISSION = 4 # Proactive Confirmation Dialog

class InterventionEngine:
    def __init__(self, thresholds=None):
        if thresholds is None:
            thresholds = {
                InterventionLevel.OBSERVE: 0,
                InterventionLevel.INFORM: 3,
                InterventionLevel.WARN: 6,
                InterventionLevel.RECOMMEND: 9,
                InterventionLevel.REQUEST_PERMISSION: 12
            }
        self.thresholds = thresholds

    def get_level(self, score):
        # Determine highest applicable level
        current_level = InterventionLevel.OBSERVE
        for level, threshold in sorted(self.thresholds.items(), key=lambda x: x[1]):
            if score >= threshold:
                current_level = level
            else:
                break
        return current_level

    def get_action_recommendation(self, process_name, anomalies, level):
        if level < InterventionLevel.RECOMMEND:
            return None
        
        # Identify primary threat for recommendation text
        primary = anomalies[0] if anomalies else {"type": "UNKNOWN"}
        
        reason = f"due to {primary.get('type','anomaly').replace('_',' ')} ({primary.get('actual','N/A')} vs typical {primary.get('baseline','N/A')})"
        
        if primary["type"] == "SUSTAINED_CPU":
            return f"Recommend closing {process_name} {reason} to restore system responsiveness."
        if primary["type"] == "MEMORY_LEAK":
            return f"Recommend restarting {process_name} {reason} to reclaim leaked memory."
        if primary["type"] == "RESTART_LOOP":
            return f"Recommend terminating {process_name} {reason} as it is unstable."
        
        return f"Recommend reviewing {process_name} {reason}."
