from alerts import memory_pressure_message, cpu_pressure_message
from memory import BrainMemory

memory = BrainMemory()

def interpret(message):
    signals = message.get("signals", {})
    interpretations = []

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

    ram_offender = signals.get("top_ram_offender")
    if ram_offender:
        key = f"ram_offender_{ram_offender['name']}"
        if memory.should_emit(key, cooldown_seconds=90):
            interpretations.append(
                f"Process '{ram_offender['name']}' is using the most memory "
                f"({ram_offender['ram_mb']} MB)."
            )

    cpu_offender = signals.get("top_cpu_offender")
    if cpu_offender and cpu_offender["cpu_percent"] > 1.0:
        key = f"cpu_offender_{cpu_offender['name']}"
        if memory.should_emit(key, cooldown_seconds=60):
            interpretations.append(
                f"Process '{cpu_offender['name']}' is using notable CPU "
                f"({cpu_offender['cpu_percent']:.1f}%)."
            )

    return interpretations
