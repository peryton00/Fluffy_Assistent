def memory_pressure_message(level):
    messages = {
        "LOW": "Memory usage is healthy.",
        "MEDIUM": "Memory usage is getting moderately high.",
        "HIGH": "High memory usage detected. Your system may feel slower.",
        "CRITICAL": "Critical memory pressure! System responsiveness may degrade."
    }
    return messages.get(level, "Unknown memory state.")


def cpu_pressure_message(level):
    messages = {
        "NORMAL": "CPU usage is normal.",
        "BUSY": "CPU usage is elevated. Some tasks may slow down.",
        "OVERLOADED": "CPU is heavily loaded. Performance issues are likely."
    }
    return messages.get(level, "Unknown CPU state.")
