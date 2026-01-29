import time

class BrainMemory:
    def __init__(self):
        self.last_seen = {}

    def should_emit(self, key, cooldown_seconds=30):
        now = time.time()
        last = self.last_seen.get(key)

        if last is None or (now - last) > cooldown_seconds:
            self.last_seen[key] = now
            return True

        return False
