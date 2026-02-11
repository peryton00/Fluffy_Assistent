def generate_verdicts(process_name, pid, score, anomalies, level, confidence):
    """
    Guardian Explainability Engine (Level 2)
    Converts raw anomalies and scores into structured, human-readable verdicts.
    """
    if not anomalies or not level:
        return []

    # Map Level 2 labels to UI severity tags
    severity_map = {
        "Observe": "info",
        "Inform": "info",
        "Warn": "warning",
        "Recommend": "warning",
        "Request Confirmation": "error"
    }

    # Behavior contributing to score
    behaviors = list(set([a["type"] for a in anomalies]))
    
    # Primary reason (usually the most severe anomaly)
    primary_anomaly = max(anomalies, key=lambda a: a["severity_score"])
    
    verdict = {
        "level": level,
        "type": severity_map.get(level, "info"),
        "process": process_name,
        "pid": pid,
        "reason": primary_anomaly["explanation"],
        "risk_score": round(score, 1),
        "confidence": confidence,
        "explanation": f"Contributing behaviors: {', '.join(behaviors)}. Magnitude: {primary_anomaly['deviation_ratio']}x deviation detected."
    }

    # Level 2 Rule: No vague alerts. If explanation is missing, suppress.
    if not verdict["reason"] or not verdict["explanation"]:
        return []

    return [verdict]
