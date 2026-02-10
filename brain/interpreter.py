from alerts import memory_pressure_message, cpu_pressure_message
from memory import BrainMemory

memory = BrainMemory()

def interpret(message):
    signals = message.get("signals", {})
    system = message.get("system", {})
    processes = system.get("processes", {}).get("top_ram", [])
    
    interpretations = []

    # 1. Update History
    cpu_val = system.get("cpu", {}).get("usage_percent", 0)
    ram_stats = system.get("ram", {})
    ram_percent = (ram_stats.get("used_mb", 0) / ram_stats.get("total_mb", 1)) * 100
    
    memory.push_system_stats(cpu_val, ram_percent)
    for p in processes:
        memory.push_process_stats(p["name"], p.get("cpu_percent", 0), p["ram_mb"])

    # 2. Basic Threshold Alerts (Existing logic)
    mem_level = signals.get("memory_pressure")
    cpu_level = signals.get("cpu_pressure")

    if mem_level:
        key = f"mem_pressure_{mem_level}"
        if memory.should_emit(key, cooldown_seconds=60):
            interpretations.append(memory_pressure_message(mem_level))

    if cpu_level:
        key = f"cpu_pressure_{cpu_level}"
        if memory.should_emit(key, cooldown_seconds=45):
            interpretations.append(cpu_pressure_message(cpu_level))

    # 3. Smart Rules & Trend Detection
    
    # Rule: CPU high for 5 minutes (300s)
    if memory.is_system_consistently_above(300, 80, metric="cpu"):
        if memory.should_emit("trend_cpu_high_5m", cooldown_seconds=600):
            interpretations.append("CPU has been consistently high (>80%) for over 5 minutes.")

    # Rule: RAM > 90% for 2 minutes (120s)
    if memory.is_system_consistently_above(120, 90, metric="ram"):
        if memory.should_emit("rule_ram_90_2m", cooldown_seconds=300):
            interpretations.append("RAM usage has been critically high (>90%) for 2 minutes.")

    # Per-Process Smart Analysis
    for p in processes:
        name = p["name"]
        
        # Rule: Memory Leak Detection (5m window)
        if memory.detect_process_leak(name, seconds=300, threshold_mb=100):
            if memory.should_emit(f"leak_{name}", cooldown_seconds=600):
                interpretations.append(f"Memory leak suspected in '{name}': RAM usage is strictly increasing.")

        # Rule: Repeated CPU Spikes (3 spikes > 50% in 2m)
        if memory.count_process_spikes(name, seconds=120, threshold_cpu=50) >= 3:
            if memory.should_emit(f"spikes_{name}", cooldown_seconds=300):
                interpretations.append(f"Process '{name}' is spiking CPU repeatedly (>50%).")

    # 4. Top Offenders (Existing logic)
    ram_offender = signals.get("top_ram_offender")
    if ram_offender:
        key = f"ram_offender_{ram_offender['name']}"
        if memory.should_emit(key, cooldown_seconds=90):
            interpretations.append(
                f"Process '{ram_offender['name']}' is using the most memory "
                f"({ram_offender['ram_mb']} MB)."
            )

    cpu_offender = signals.get("top_cpu_offender")
    if cpu_offender and cpu_offender["cpu_percent"] > 5.0:
        key = f"cpu_offender_{cpu_offender['name']}"
        if memory.should_emit(key, cooldown_seconds=60):
            interpretations.append(
                f"Process '{cpu_offender['name']}' is using notable CPU "
                f"({cpu_offender['cpu_percent']:.1f}%)."
            )

    return interpretations
