def generate_verdicts(process_name, score, anomalies, level, recommendation=None):
    if not anomalies:
        return []

    verdicts = []
    for a in anomalies:
        # Comparative Reasoning (Phase 11.2)
        reasoning = f"Actual: {a.get('actual', 'N/A')} vs Typical: {a.get('baseline', 'N/A')}"
        confidence = f"Confidence: {int(a.get('confidence', 0) * 100)}% (based on {a.get('samples', 0)} samples)"
        
        prefix = f"[Guardian] {process_name}: "
        verdicts.append(f"{prefix}{a['message']} ({reasoning}) | {confidence}")
    
    if recommendation:
        verdicts.append(f"[Guardian Plan] {recommendation}")
    
    return verdicts
