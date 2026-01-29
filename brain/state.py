from threading import Lock

LATEST_STATE = None
EXECUTION_LOGS = []
LOCK = Lock()


def update_state(state):
    global LATEST_STATE
    with LOCK:
        LATEST_STATE = state


def add_execution_log(message, level="info"):
    with LOCK:
        EXECUTION_LOGS.append({"message": message, "level": level})
