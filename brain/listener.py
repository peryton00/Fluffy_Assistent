import os
os.environ["FLASK_SKIP_DOTENV"] = "1"
from state import update_state, add_execution_log
from web_api import start_api
from threading import Thread
from interpreter import interpret
from recommender import recommend
from security_monitor import SecurityMonitor
from guardian.verdict import generate_verdicts
from guardian_manager import (
    GUARDIAN_MEMORY, GUARDIAN_BASELINE, GUARDIAN_DETECTOR, GUARDIAN_SCORER,
    GUARDIAN_FINGERPRINTS, GUARDIAN_CHAINS, GUARDIAN_STATE, GUARDIAN_INTERVENTION,
    GUARDIAN_AUDIT, reset_guardian
)
import state

# Voice system import (safe - fails silently if Piper not available)
try:
    import sys
    import os
    # Add parent directory to path for voice module
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from voice import speak_welcome, speak_guardian_alert
    VOICE_AVAILABLE = True
except Exception as e:
    print(f"[Voice] Voice system unavailable: {e}", file=sys.stderr)
    VOICE_AVAILABLE = False
    speak_welcome = lambda: None
    speak_guardian_alert = lambda x: None

import socket
import json
import sys
import signal
import time
import copy

print("[Fluffy Brain] Listener script started", file=sys.stderr)

IPC_HOST = "127.0.0.1"
IPC_PORT = 9001

shutting_down = False
ipc_socket = None


PROCESS_MSG_COUNTER = 0 # For periodic saving
PROACTIVE_PROMPTS = set() # Track processes already prompted for confirmation





# -----------------------------
# IPC CONNECTION
# -----------------------------
def connect_ipc():
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect((IPC_HOST, IPC_PORT))
            s.settimeout(1.0)
            return s
        except (ConnectionRefusedError, TimeoutError):
            time.sleep(0.5)


# -----------------------------
# SHUTDOWN HANDLING
# -----------------------------
def shutdown(signum=None, frame=None):
    global shutting_down, ipc_socket

    if shutting_down:
        return
    shutting_down = True

    print("\n[Fluffy Brain] Shutting down...", file=sys.stderr)
    
    if GUARDIAN_BASELINE:
        print("[Fluffy Brain] Saving Guardian baselines...", file=sys.stderr)
        GUARDIAN_BASELINE.save()
    
    if GUARDIAN_MEMORY:
        print("[Fluffy Brain] Saving Guardian memory...", file=sys.stderr)
        GUARDIAN_MEMORY.save()

    if GUARDIAN_AUDIT:
        print("[Fluffy Brain] Saving Guardian audit trail...", file=sys.stderr)
        GUARDIAN_AUDIT.save()

    if ipc_socket:
        try:
            ipc_socket.close()
        except Exception:
            pass


# -----------------------------
# SIGNAL COMPUTATION (AUTHORITATIVE)
# -----------------------------
def compute_signals(msg):
    system = msg.get("system", {})
    ram = system.get("ram", {})
    cpu = system.get("cpu", {})
    processes = system.get("processes", {}).get("top_ram", [])

    signals = {}

    # Memory pressure
    if ram and ram.get("total_mb", 0) > 0:
        usage = (ram["used_mb"] / ram["total_mb"]) * 100
        if usage < 60:
            signals["memory_pressure"] = "LOW"
        elif usage < 75:
            signals["memory_pressure"] = "MEDIUM"
        elif usage < 90:
            signals["memory_pressure"] = "HIGH"
        else:
            signals["memory_pressure"] = "CRITICAL"

    # CPU pressure
    if cpu:
        u = cpu.get("usage_percent", 0)
        if u < 40:
            signals["cpu_pressure"] = "NORMAL"
        elif u < 70:
            signals["cpu_pressure"] = "BUSY"
        else:
            signals["cpu_pressure"] = "OVERLOADED"

    # Offenders (SAFETIED)
    if processes:
        signals["top_ram_offender"] = max(processes, key=lambda p: p.get("ram_mb", 0))
        signals["top_cpu_offender"] = max(
            processes, key=lambda p: p.get("cpu_percent", 0)
        )
    else:
        signals["top_ram_offender"] = None
        signals["top_cpu_offender"] = None

    return signals


def compute_health(signals, security_alerts):
    reasons = []
    
    # 1. Security (Log-based)
    if security_alerts:
        reasons.append("Active security threats detected in system logs.")
    
    # 2. Resource Inputs
    cpu = signals.get("cpu_pressure", "NORMAL")
    ram = signals.get("memory_pressure", "LOW")

    if cpu == "OVERLOADED":
        reasons.append("Extreme CPU pressure detected.")
    elif cpu == "BUSY":
        reasons.append("High CPU usage detected.")

    if ram == "CRITICAL":
        reasons.append("System memory is nearly full.")
    elif ram == "HIGH":
        reasons.append("High memory usage detected.")

    # 3. Status Determination (Pure System Health)
    is_critical = (cpu == "OVERLOADED" or ram == "CRITICAL" or security_alerts)
    is_warning = (cpu == "BUSY" or ram == "HIGH")

    if is_critical:
        status = "critical"
    elif is_warning:
        status = "warning"
    else:
        status = "healthy"
    
    # Guardian info is still good for 'Reasons' but won't trigger status change
    guardian = GUARDIAN_STATE.current_state
    if guardian == GUARDIAN_STATE.CRITICAL:
        reasons.append("[Guardian] Critical behavioral anomalies present.")
    elif guardian in (GUARDIAN_STATE.ALERT, GUARDIAN_STATE.DEFENSIVE):
        reasons.append(f"[Guardian] System in {guardian} mode.")

    if not reasons:
        reasons.append("No issues detected. System is optimized.")

    return status, reasons


# -----------------------------
# MESSAGE HANDLER
# -----------------------------
def handle_message(raw_msg, monitor):
    # If UI is not active, skip heavy processing and state updates
    if not state.UI_ACTIVE:
        # Still run security monitor in background!
        security_alerts = monitor.analyze(raw_msg, state.UI_ACTIVE)
        state.update_security_alerts(security_alerts)
        return

    # Work on a clean copy to avoid race conditions
    msg = copy.deepcopy(raw_msg)

    signals = compute_signals(msg)
    msg["signals"] = signals

    # Security Analysis
    security_alerts = monitor.analyze(msg, state.UI_ACTIVE)
    state.update_security_alerts(security_alerts)

    interpretations = interpret(msg)
    recommendations = recommend(msg)

    # --- GUARDIAN ENGINE (Level 2) ---
    all_guardian_verdicts = []
    processes = msg.get("system", {}).get("processes", {}).get("top_ram", [])
    active_pids = [p["pid"] for p in processes]
    
    current_scores = {}
    
    # 5-Minute Learning Mode Check
    learning_progress = GUARDIAN_BASELINE.get_learning_progress()
    is_learning = learning_progress < 100

    for p in processes:
        pid = p["pid"]
        name = p["name"]
        cpu = p["cpu_percent"]
        ram = p["ram_mb"]
        net_sent = p.get("net_sent", 0.0)
        net_received = p.get("net_received", 0.0)
        child_count = len(p.get("children", []))
        
        # 1. Update / Load Fingerprint
        fp = GUARDIAN_FINGERPRINTS.track(pid, name, cpu, ram, net_sent, net_received, child_count)
        
        # 2. Get Baseline
        baseline = GUARDIAN_BASELINE.get_baseline(name)
        
        # 3. Detect Anomalies
        anomalies = GUARDIAN_DETECTOR.analyze(fp, baseline)
        
        # 4. Behavioral Chain Tracking
        chain_multiplier = GUARDIAN_CHAINS.update(pid, name, anomalies)
        
        # 5. Risk Scoring
        risk_score = GUARDIAN_SCORER.score(name, pid, anomalies) * chain_multiplier
        current_scores[pid] = risk_score
        
        # 6. Generate Verdicts (Level 2)
        level = GUARDIAN_SCORER.get_level(risk_score)
        
        # Verdict Generation (Suppressed during initial 5-min Learning Mode)
        if not is_learning:
            # Skip verdict generation for trusted processes
            if baseline and baseline.get("trusted", False):
                # Process is trusted - no alerts needed
                continue
            
            verdicts = generate_verdicts(name, pid, risk_score, anomalies, level, 0.8)
            all_guardian_verdicts.extend(verdicts)
            
            # Voice alert for serious verdicts with metrics
            if VOICE_AVAILABLE and verdicts:
                for verdict in verdicts:
                    # Pass current process metrics for conversational alerts
                    speak_guardian_alert(
                        verdict,
                        cpu=cpu,
                        ram=ram,
                        network=(net_sent + net_received) / 1024  # Convert to KB/s
                    )
            
            # Audit logging
            if anomalies:
                 GUARDIAN_AUDIT.log_event("BehaviorAlert", name, {"score": risk_score, "level": level, "anomalies": anomalies})

            # Confirmation Logic (Level: Request Confirmation) -> Only if not learning
            if level == "Request Confirmation" and name not in PROACTIVE_PROMPTS:
                PROACTIVE_PROMPTS.add(name)
                v = verdicts[0] if verdicts else {"reason": "Undetermined risk", "explanation": "High suspicion score"}
                details_str = f"Guardian Alert: {v['reason']}\n{v['explanation']}\n\nThis process has exceeded the safety threshold (Score: {risk_score:.1f}). Should Fluffy terminate it?"
                state.add_confirmation(
                    cmd_id=f"kill_{pid}_{int(time.time())}",
                    cmd_name="Terminate Suspicious Process",
                    details=details_str
                )
                add_execution_log(f"Guardian requesting confirmation to terminate {name}", "action")

        # 7. Update Baseline (Slow adaptation)
        GUARDIAN_BASELINE.update(name, cpu, ram, child_count, net_sent, net_received)

    # Global State Update
    GUARDIAN_STATE.update(current_scores)
    
    # Cleanup dead PIDs
    GUARDIAN_FINGERPRINTS.cleanup(active_pids)
    GUARDIAN_CHAINS.cleanup(active_pids)
    GUARDIAN_SCORER.cleanup(active_pids)

    # Periodic baseline save (every 50 telemetry messages)
    global PROCESS_MSG_COUNTER
    PROCESS_MSG_COUNTER += 1
    if PROCESS_MSG_COUNTER >= 50:
        GUARDIAN_BASELINE.save()
        PROCESS_MSG_COUNTER = 0

    # Inject Guardian insights and State into the pipeline
    msg["_insights"] = interpretations + [f"[Guardian] {v['process']}: {v['level']} - {v['reason']}" for v in all_guardian_verdicts]
    guardian_state_info = GUARDIAN_STATE.get_ui_info()
    guardian_state_info["learning_progress"] = learning_progress
    guardian_state_info["is_learning"] = is_learning
    msg["_guardian_state"] = guardian_state_info
    msg["_guardian_verdicts"] = all_guardian_verdicts # Structured for UI
    msg["_recommendations"] = recommendations
    
    # Authoritative health status
    health_status, health_reasons = compute_health(signals, security_alerts)
    msg["system"]["health"] = health_status
    msg["system"]["health_reasons"] = health_reasons

    update_state(msg)

    if interpretations:
        print("\n[Fluffy Insight]")
        for line in interpretations:
            print(f"* {line}")

    if recommendations:
        print("\n[Fluffy Suggestion]")
        for rec in recommendations:
            print(f"-> {rec}")


# -----------------------------
# MAIN LOOP
# -----------------------------
def main():
    global ipc_socket

    Thread(target=start_api, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    monitor = SecurityMonitor()
    state.MONITOR = monitor

    ipc_socket = connect_ipc()
    print("[Fluffy Brain] Connected to IPC", file=sys.stderr)
    
    # Speak welcome message (non-blocking, guarded)
    if VOICE_AVAILABLE and not state.WELCOME_SPOKEN:
        speak_welcome()
        state.WELCOME_SPOKEN = True

    def background_app_scanner():
        """Periodic silent app scan every 24 hours."""
        from app_utils import get_cache_metadata, scan_and_cache_apps
        print("[Apps] Background scanner active.", file=sys.stderr)
        while not shutting_down:
            try:
                meta = get_cache_metadata()
                last_scan = meta.get("last_scan", 0)
                now = int(time.time())
                
                # If 24h passed (86400 seconds)
                if now - last_scan >= 86400:
                    print("[Apps] 24h passed since last scan. Refreshing cache...", file=sys.stderr)
                    # Add a log to state so user sees it in dashboard logs
                    from state import add_execution_log
                    add_execution_log("Running scheduled software discovery scan...", "system")
                    scan_and_cache_apps()
                
            except Exception as e:
                print(f"[Apps] Background scan error: {e}", file=sys.stderr)
            
            # Check every hour
            for _ in range(3600):
                if shutting_down: break
                time.sleep(1)

    Thread(target=background_app_scanner, daemon=True).start()

    buffer = ""

    try:
        while not shutting_down:
            try:
                try:
                    data = ipc_socket.recv(4096)
                except socket.timeout:
                    continue
                except ConnectionResetError:
                    add_execution_log("Core disconnected", "error")
                    break
                except OSError:
                    break

                if not data:
                    add_execution_log("IPC disconnected. Reconnecting...", "error")
                    ipc_socket.close()
                    ipc_socket = connect_ipc()
                    continue

                buffer += data.decode()

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)

                    if not line.strip():
                        continue

                    try:
                        raw = json.loads(line)
                        print(f"[Fluffy Brain] Received telemetry message ({len(line)} bytes)", file=sys.stderr)
                        
                        # Support for both wrapped and unwrapped messages
                        msg_data = raw.get("payload", raw) if isinstance(raw, dict) else raw

                        # --- CONFIRMATION REQUEST FROM RUST ---
                        if isinstance(msg_data, dict) and msg_data.get("type") == "confirm_required":
                            cmd_id = msg_data.get("command_id")
                            cmd_name = msg_data.get("command_name", "Unknown Command")
                            details = msg_data.get("details", "")
                            
                            from state import add_confirmation
                            add_confirmation(cmd_id, cmd_name, details)
                            
                            add_execution_log(
                                f"Confirmation required for {cmd_name} (id={cmd_id})",
                                "action",
                            )
                            continue

                        # --- EXECUTION RESULT FROM RUST ---
                        if isinstance(msg_data, dict) and msg_data.get("type") == "execution_result":
                            from state import add_notification
                            
                            level = "info"
                            status = msg_data.get('status')
                            error_msg = msg_data.get('error')

                            if status == "error":
                                level = "error"
                                if error_msg:
                                    add_notification(f"Command failed: {error_msg}", "error")
                                else:
                                    add_notification(f"Command {msg_data.get('command')} failed", "error")
                            else:
                                cmd_name = msg_data.get('command')
                                if cmd_name == "KillProcess":
                                    add_notification("Process terminated successfully", "success")
                                else:
                                    add_notification(f"{cmd_name} executed successfully", "success")

                            add_execution_log(
                                f"Command {msg_data.get('command')} {status}" + (f": {error_msg}" if error_msg else ""),
                                level
                            )
                            continue

                        # --- SHUTDOWN SIGNAL FROM RUST ---
                        if isinstance(msg_data, dict) and msg_data.get("type") == "shutdown":
                            print("\n[Fluffy Brain] Shutdown signal received from Core", file=sys.stderr)
                            state.SHUTDOWN_MODE = True
                            
                            # Schedule exit to allow UI to fetch status
                            def delayed_exit():
                                time.sleep(2)
                                print("[Fluffy Brain] Exiting...", file=sys.stderr)
                                shutdown()
                                sys.exit(0)
                            
                            Thread(target=delayed_exit, daemon=True).start()
                            continue

                        handle_message(msg_data, monitor)

                    except json.JSONDecodeError as e:
                        print(f"[JSON ERROR] {e}", file=sys.stderr)
            except Exception as e:
                print(f"[ERROR] Error in main loop: {e}", file=sys.stderr)
                add_execution_log(f"Error in main loop: {e}", "error")
                break
    finally:
        shutdown()


if __name__ == "__main__":
    main()
