import time

class BehavioralChain:
    """
    Tracks sequences of suspicious behavior over time for a single process (Level 2).
    """
    def __init__(self, pid, name, timeout=300):
        self.pid = pid
        self.name = name
        self.events = [] # List of (timestamp, anomaly_type)
        self.timeout = timeout # 5 minutes default
        self.suspicion_multiplier = 1.0

    def add_event(self, anomaly_type):
        """
        Adds an anomaly event to the chain and cleans up expired events.
        """
        now = time.time()
        self.events.append((now, anomaly_type))
        self._cleanup(now)
        
        # Level 2 chain logic: increase multiplier if specific sequences occur
        self.suspicion_multiplier = self._evaluate_intent()

    def _cleanup(self, now):
        self.events = [e for e in self.events if now - e[0] < self.timeout]

    def _evaluate_intent(self):
        """
        Analyzes the event chain for specific intent patterns.
        """
        types = [e[1] for e in self.events]
        
        # Pattern 1: Data Exfiltration Attempt (Spawn -> High CPU -> Network Burst)
        if "CHILD_EXPLOSION" in types and "CPU_DEVIATION" in types and "NETWORK_BURST" in types:
            return 2.5
        
        # Pattern 2: Resource Hijack / Leak (RAM Explosion -> Restart Loop)
        if ("MEMORY_LEAK" in types or "MEMORY_EXPLOSION" in types) and "RESTART_LOOP" in types:
            return 2.0
        
        # Pattern 3: Rapid Proliferation
        if types.count("CHILD_EXPLOSION") > 2:
            return 1.8
            
        return 1.0 + (len(set(types)) * 0.1) # Baseline multiplier for variety of behavior

class ChainManager:
    """
    Manages behavioral chains across all processes.
    """
    def __init__(self):
        self.chains = {} # PID -> BehavioralChain

    def update(self, pid, name, anomalies):
        if not anomalies:
            return 1.0
            
        if pid not in self.chains:
            self.chains[pid] = BehavioralChain(pid, name)
            
        chain = self.chains[pid]
        for a in anomalies:
            chain.add_event(a["type"])
            
        return chain.suspicion_multiplier

    def cleanup(self, active_pids):
        dead_pids = [pid for pid in self.chains if pid not in active_pids]
        for pid in dead_pids:
            del self.chains[pid]

    def clear_all_data(self):
        self.chains = {}
