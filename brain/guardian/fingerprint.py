import time

class BehavioralFingerprint:
    """
    Tracks the real-time behavioral fingerprint of a running process (Level 2).
    Uses Exponential Moving Averages (EMA) and rolling windows for trend detection.
    """
    def __init__(self, pid, name, alpha=0.3):
        self.pid = pid
        self.name = name
        self.alpha = alpha  # Faster adaptation for live fingerprinting vs long-term baseline
        
        # Live Metrics
        self.cpu_ema = 0.0
        self.ram_ema = 0.0
        self.net_sent_ema = 0.0
        self.net_recv_ema = 0.0
        
        # Tendency Tracking
        self.ram_samples = []
        self.child_counts = []
        self.start_time = time.time()
        self.last_update = time.time()
        
        # Flags
        self.is_decaying = False

    def update(self, cpu, ram, net_sent, net_recv, child_count):
        """
        Updates the fingerprint with new telemetry.
        """
        now = time.time()
        delta_t = now - self.last_update
        
        # 1. EMA Updates for Spike Smoothing
        self.cpu_ema = (self.alpha * cpu) + ((1 - self.alpha) * self.cpu_ema)
        self.ram_ema = (self.alpha * ram) + ((1 - self.alpha) * self.ram_ema)
        self.net_sent_ema = (self.alpha * net_sent) + ((1 - self.alpha) * self.net_sent_ema)
        self.net_recv_ema = (self.alpha * net_recv) + ((1 - self.alpha) * self.net_recv_ema)
        
        # 2. Rolling Windows (Limited size for low CPU overhead)
        self.ram_samples = (self.ram_samples + [ram])[-20:]
        self.child_counts = (self.child_counts + [child_count])[-10:]
        
        self.last_update = now

    def get_growth_rate(self):
        """
        Calculates simple linear growth rate of RAM over the last window.
        """
        if len(self.ram_samples) < 5:
            return 0.0
        
        delta = self.ram_samples[-1] - self.ram_samples[0]
        return delta / len(self.ram_samples)

    def get_lifespan(self):
        return time.time() - self.start_time

class FingerprintManager:
    """
    Manages active fingerprints for all running processes.
    """
    def __init__(self):
        self.fingerprints = {} # PID -> BehavioralFingerprint

    def track(self, pid, name, cpu, ram, net_sent, net_recv, child_count):
        if pid not in self.fingerprints:
            self.fingerprints[pid] = BehavioralFingerprint(pid, name)
        
        fp = self.fingerprints[pid]
        fp.update(cpu, ram, net_sent, net_recv, child_count)
        return fp

    def cleanup(self, active_pids):
        """
        Removes fingerprints for processes that are no longer active.
        """
        dead_pids = [pid for pid in self.fingerprints if pid not in active_pids]
        for pid in dead_pids:
            del self.fingerprints[pid]
