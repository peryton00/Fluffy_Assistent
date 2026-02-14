from alerts import memory_pressure_message, cpu_pressure_message
import time

# Simple in-memory tracking for cooldowns and history
_last_emit = {}
_system_history = {"cpu": [], "ram": []}
_process_history = {}

def should_emit(key: str, cooldown_seconds: int) -> bool:
    """Check if enough time has passed since last emit"""
    now = time.time()
    last = _last_emit.get(key, 0)
    if now - last >= cooldown_seconds:
        _last_emit[key] = now
        return True
    return False

def push_system_stats(cpu: float, ram: float):
    """Track system stats for trend analysis"""
    now = time.time()
    _system_history["cpu"].append((now, cpu))
    _system_history["ram"].append((now, ram))
    
    # Keep only last 10 minutes
    cutoff = now - 600
    _system_history["cpu"] = [(t, v) for t, v in _system_history["cpu"] if t > cutoff]
    _system_history["ram"] = [(t, v) for t, v in _system_history["ram"] if t > cutoff]

def push_process_stats(name: str, cpu: float, ram: float):
    """Track process stats for leak detection"""
    if name not in _process_history:
        _process_history[name] = []
    
    now = time.time()
    _process_history[name].append((now, cpu, ram))
    
    # Keep only last 10 minutes
    cutoff = now - 600
    _process_history[name] = [(t, c, r) for t, c, r in _process_history[name] if t > cutoff]

def is_system_consistently_above(seconds: int, threshold: float, metric: str = "cpu") -> bool:
    """Check if system metric has been above threshold for duration"""
    now = time.time()
    cutoff = now - seconds
    history = _system_history.get(metric, [])
    
    recent = [(t, v) for t, v in history if t > cutoff]
    if not recent:
        return False
    
    return all(v > threshold for _, v in recent)

def detect_process_leak(name: str, seconds: int, threshold_mb: float) -> bool:
    """Detect if process RAM is strictly increasing (potential leak)"""
    if name not in _process_history:
        return False
    
    now = time.time()
    cutoff = now - seconds
    history = [(t, c, r) for t, c, r in _process_history[name] if t > cutoff]
    
    if len(history) < 3:
        return False
    
    # Check if RAM is increasing and delta > threshold
    ram_values = [r for _, _, r in history]
    is_increasing = all(ram_values[i] < ram_values[i+1] for i in range(len(ram_values)-1))
    delta = ram_values[-1] - ram_values[0]
    
    return is_increasing and delta > threshold_mb

def count_process_spikes(name: str, seconds: int, threshold_cpu: float) -> int:
    """Count CPU spikes above threshold in time window"""
    if name not in _process_history:
        return 0
    
    now = time.time()
    cutoff = now - seconds
    history = [(t, c, r) for t, c, r in _process_history[name] if t > cutoff]
    
    return sum(1 for _, cpu, _ in history if cpu > threshold_cpu)

def interpret(message):
    signals = message.get("signals", {})
    system = message.get("system", {})
    processes = system.get("processes", {}).get("top_ram", [])
    
    interpretations = []

    # 1. Update History
    cpu_val = system.get("cpu", {}).get("usage_percent", 0)
    ram_stats = system.get("ram", {})
    ram_percent = (ram_stats.get("used_mb", 0) / ram_stats.get("total_mb", 1)) * 100
    
    push_system_stats(cpu_val, ram_percent)
    for p in processes:
        push_process_stats(p["name"], p.get("cpu_percent", 0), p["ram_mb"])

    # 2. Basic Threshold Alerts
    mem_level = signals.get("memory_pressure")
    cpu_level = signals.get("cpu_pressure")

    if mem_level:
        key = f"mem_pressure_{mem_level}"
        if should_emit(key, cooldown_seconds=60):
            interpretations.append(memory_pressure_message(mem_level))

    if cpu_level:
        key = f"cpu_pressure_{cpu_level}"
        if should_emit(key, cooldown_seconds=45):
            interpretations.append(cpu_pressure_message(cpu_level))

    # 3. Smart Rules & Trend Detection
    
    # Rule: CPU high for 5 minutes (300s)
    if is_system_consistently_above(300, 80, metric="cpu"):
        if should_emit("trend_cpu_high_5m", cooldown_seconds=600):
            interpretations.append("CPU has been consistently high (>80%) for over 5 minutes.")

    # Rule: RAM > 90% for 2 minutes (120s)
    if is_system_consistently_above(120, 90, metric="ram"):
        if should_emit("rule_ram_90_2m", cooldown_seconds=300):
            interpretations.append("RAM usage has been critically high (>90%) for 2 minutes.")

    # Per-Process Smart Analysis
    for p in processes:
        name = p["name"]
        
        # Rule: Memory Leak Detection (5m window)
        if detect_process_leak(name, seconds=300, threshold_mb=100):
            if should_emit(f"leak_{name}", cooldown_seconds=600):
                interpretations.append(f"Memory leak suspected in '{name}': RAM usage is strictly increasing.")

        # Rule: Repeated CPU Spikes (3 spikes > 50% in 2m)
        if count_process_spikes(name, seconds=120, threshold_cpu=50) >= 3:
            if should_emit(f"spikes_{name}", cooldown_seconds=300):
                interpretations.append(f"Process '{name}' is spiking CPU repeatedly (>50%).")

    # 4. Top Offenders
    ram_offender = signals.get("top_ram_offender")
    if ram_offender:
        key = f"ram_offender_{ram_offender['name']}"
        if should_emit(key, cooldown_seconds=90):
            interpretations.append(
                f"Process '{ram_offender['name']}' is using the most memory "
                f"({ram_offender['ram_mb']} MB)."
            )

    cpu_offender = signals.get("top_cpu_offender")
    if cpu_offender and cpu_offender["cpu_percent"] > 5.0:
        key = f"cpu_offender_{cpu_offender['name']}"
        if should_emit(key, cooldown_seconds=60):
            interpretations.append(
                f"Process '{cpu_offender['name']}' is using notable CPU "
                f"({cpu_offender['cpu_percent']:.1f}%)."
            )

    return interpretations
