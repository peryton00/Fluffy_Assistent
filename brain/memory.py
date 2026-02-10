import time

from collections import deque

class BrainMemory:
    def __init__(self, max_history=300): # ~10 minutes at 2s interval
        self.last_seen = {}
        self.max_history = max_history
        self.system_history = deque(maxlen=max_history)
        self.process_history = {} # name -> deque(maxlen=max_history)

    def should_emit(self, key, cooldown_seconds=30):
        now = time.time()
        last = self.last_seen.get(key)

        if last is None or (now - last) > cooldown_seconds:
            self.last_seen[key] = now
            return True

        return False

    def push_system_stats(self, cpu, ram_percent):
        self.system_history.append({
            "timestamp": time.time(),
            "cpu": cpu,
            "ram": ram_percent
        })

    def push_process_stats(self, name, cpu, ram_mb):
        if name not in self.process_history:
            self.process_history[name] = deque(maxlen=self.max_history)
        
        self.process_history[name].append({
            "timestamp": time.time(),
            "cpu": cpu,
            "ram": ram_mb
        })

    def get_system_avg(self, seconds, metric="cpu"):
        now = time.time()
        relevant = [node[metric] for node in self.system_history if now - node["timestamp"] <= seconds]
        if not relevant:
            return 0
        return sum(relevant) / len(relevant)

    def is_system_consistently_above(self, seconds, threshold, metric="cpu"):
        now = time.time()
        relevant_nodes = [node for node in self.system_history if now - node["timestamp"] <= seconds]
        
        if not relevant_nodes:
            return False
            
        # Require at least 5 samples AND the time span must be at least 80% of 'seconds'
        time_span = relevant_nodes[-1]["timestamp"] - relevant_nodes[0]["timestamp"]
        if len(relevant_nodes) < 5 or time_span < (seconds * 0.8):
            return False
            
        return all(node[metric] > threshold for node in relevant_nodes)

    def detect_process_leak(self, name, seconds=300, threshold_mb=50):
        """Detects if memory usage for a process only increases over time."""
        if name not in self.process_history:
            return False
            
        now = time.time()
        history = [node["ram"] for node in self.process_history[name] if now - node["timestamp"] <= seconds]
        
        if len(history) < 10: # Need enough samples
            return False
            
        # Simplistic leak detection: check if first and last differ significantly
        # and if it's generally monotonic (not strictly, but mostly)
        start_ram = history[0]
        end_ram = history[-1]
        
        if end_ram - start_ram > threshold_mb:
            # Check if it ever dropped significantly
            min_ram = min(history)
            if min_ram >= start_ram * 0.95: # Never dropped much below starting point
                return True
        return False

    def count_process_spikes(self, name, seconds, threshold_cpu):
        if name not in self.process_history:
            return 0
        now = time.time()
        relevant = [node["cpu"] for node in self.process_history[name] if now - node["timestamp"] <= seconds]
        return sum(1 for cpu in relevant if cpu > threshold_cpu)

