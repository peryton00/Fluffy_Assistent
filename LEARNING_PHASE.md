# Guardian Learning Phase - How It Works

The 5-minute learning phase is **already implemented and working**. Here's how it functions:

## Automatic Learning Phase

When Fluffy starts with empty data files (after reset or first run):

1. **Timestamp Recorded**: `baselines.json` stores `system_first_run` timestamp
2. **Learning Progress Tracked**: System calculates `(elapsed_time / 300) * 100`
3. **Guardian Disabled**: During learning (0-99%), Guardian only observes but doesn't alert
4. **Guardian Activated**: At 100% (5 minutes elapsed), Guardian starts protecting

## Current Implementation

### In `baseline.py`:
```python
def get_learning_progress(self):
    """Returns % of the 5-minute learning phase completed."""
    first_run = self.baselines.get("_metadata", {}).get("system_first_run", time.time())
    elapsed = time.time() - first_run
    return min(100, int((elapsed / 300) * 100))  # 300 seconds = 5 minutes
```

### In `listener.py`:
```python
learning_progress = GUARDIAN_BASELINE.get_learning_progress()
is_learning = learning_progress < 100

# Guardian only alerts if learning is complete
if not is_learning:
    # Process verdicts and alerts
```

## What Happens After Reset

1. ✅ Files cleared: `audit.json`, `baselines.json`, `memory.json`, `status.json`
2. ✅ New `system_first_run` timestamp created automatically
3. ✅ Learning progress starts at 0%
4. ✅ System observes processes for 5 minutes
5. ✅ At 5 minutes, Guardian activates and starts protecting

## Verification

The learning phase is visible in the UI:
- **Guardian tab** shows "Initial Learning Phase" with progress percentage
- **Status color** remains "healthy" during learning
- **No alerts** are generated during the 5-minute period

**This functionality is already complete and working!**
