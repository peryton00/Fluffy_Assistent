from memory import BrainMemory

memory = BrainMemory()

SYSTEM_PROCESSES = {
    "svchost.exe",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
}

def recommend(message):
    signals = message.get("signals", {})
    recommendations = []

    mem_level = signals.get("memory_pressure")
    cpu_level = signals.get("cpu_pressure")

    ram_offender = signals.get("top_ram_offender")
    cpu_offender = signals.get("top_cpu_offender")

    if mem_level in ("HIGH", "CRITICAL") and ram_offender:
        name = ram_offender["name"]
        key = f"rec_ram_{name}"
        if name.lower() not in SYSTEM_PROCESSES and memory.should_emit(key, 120):
            recommendations.append(
                f"You could consider closing '{name}' if you no longer need it, "
                f"as it is using a large amount of memory."
            )

    if cpu_level == "OVERLOADED" and cpu_offender:
        name = cpu_offender["name"]
        cpu = cpu_offender["cpu_percent"]
        key = f"rec_cpu_{name}"
        if cpu > 5.0 and name.lower() not in SYSTEM_PROCESSES:
            if memory.should_emit(key, 90):
                recommendations.append(
                    f"'{name}' is using significant CPU ({cpu:.1f}%). "
                    "If performance feels slow, you may want to check it."
                )

    return recommendations
