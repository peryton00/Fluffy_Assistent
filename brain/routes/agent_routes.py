"""
Canonical Agent Execution Routes for Fluffy Assistant

Exposes read-only observation and canonical lifecycle operations for active and historical
agent tasks strictly by delegating to AgentExecutionGateway.
"""

import threading
from typing import Optional
from flask import Blueprint, jsonify, request

try:
    from brain.auth_utils import token_required
except ImportError:
    from auth_utils import token_required

try:
    from brain.agent.gateway import get_agent_gateway, AgentExecutionGateway
    from brain.agent.task import TaskStatus
except ImportError:
    from agent.gateway import get_agent_gateway, AgentExecutionGateway
    from agent.task import TaskStatus

agent_bp = Blueprint("agent", __name__)


@agent_bp.route("/agent/tasks", methods=["GET"])
@token_required
def list_tasks():
    """List all registered agent tasks with basic summary."""
    gateway = get_agent_gateway()
    status_str = request.args.get("status")
    status_filter = None
    if status_str:
        try:
            status_filter = TaskStatus(status_str)
        except ValueError:
            return jsonify({"error": f"Invalid status filter: {status_str}"}), 400

    tasks = gateway.list_tasks(status=status_filter)
    return jsonify({
        "ok": True,
        "tasks": [t.to_dict() for t in tasks],
    })


@agent_bp.route("/agent/tasks/<task_id>", methods=["GET"])
@token_required
def get_task_details(task_id: str):
    """Retrieve full canonical state, plan, record, and result for a task."""
    gateway = get_agent_gateway()
    rec = gateway.get_record(task_id)
    if not rec:
        return jsonify({"error": f"Task '{task_id}' not found"}), 404

    state = gateway.get_state(task_id)
    return jsonify({
        "ok": True,
        "task": rec.task.to_dict(),
        "plan": rec.plan.to_dict() if rec.plan else None,
        "state": state.to_dict() if state else None,
        "result": rec.result.to_dict() if rec.result and hasattr(rec.result, "to_dict") else None,
        "is_running": rec.is_running,
    })


@agent_bp.route("/agent/tasks/<task_id>/events", methods=["GET"])
@token_required
def get_task_events(task_id: str):
    """Retrieve canonical chronological execution events for a task."""
    gateway = get_agent_gateway()
    rec = gateway.get_record(task_id)
    if not rec:
        return jsonify({"error": f"Task '{task_id}' not found"}), 404

    events = gateway.get_events(task_id)
    return jsonify({
        "ok": True,
        "task_id": task_id,
        "events": [e.to_dict() if hasattr(e, "to_dict") else e for e in events],
    })


@agent_bp.route("/agent/tasks", methods=["POST"])
@token_required
def create_task():
    """Register a new task with the gateway and optionally trigger execution."""
    data = request.get_json(silent=True) or {}
    user_req = data.get("task") or data.get("user_request")
    if not user_req:
        return jsonify({"error": "Missing task/user_request parameter"}), 400

    goal = data.get("goal")
    task_id = data.get("task_id")
    context = data.get("context", {})
    metadata = data.get("metadata", {})
    auto_start = data.get("auto_start", False)

    gateway = get_agent_gateway()
    try:
        task = gateway.create(
            task=user_req,
            goal=goal,
            task_id=task_id,
            context=context,
            metadata=metadata,
        )
    except Exception as e:
        return jsonify({"error": f"Failed to register task: {str(e)}"}), 400

    if auto_start:
        threading.Thread(target=gateway.start, args=(task.task_id,), daemon=True).start()

    return jsonify({
        "ok": True,
        "task": task.to_dict(),
    })


@agent_bp.route("/agent/tasks/<task_id>/start", methods=["POST"])
@token_required
def start_task(task_id: str):
    """Start execution of a registered task."""
    gateway = get_agent_gateway()
    rec = gateway.get_record(task_id)
    if not rec:
        return jsonify({"error": f"Task '{task_id}' not found"}), 404

    data = request.get_json(silent=True) or {}
    sync = data.get("sync", False)

    if sync:
        try:
            res = gateway.start(task_id)
            return jsonify({
                "ok": True,
                "task_id": task_id,
                "result": res.to_dict() if res and hasattr(res, "to_dict") else None,
            })
        except Exception as e:
            return jsonify({"error": f"Execution failed: {str(e)}"}), 500
    else:
        threading.Thread(target=gateway.start, args=(task_id,), daemon=True).start()
        return jsonify({
            "ok": True,
            "task_id": task_id,
            "status": "started",
        })


@agent_bp.route("/agent/tasks/<task_id>/resume", methods=["POST"])
@token_required
def resume_task(task_id: str):
    """Resume a task paused in WAITING_CONFIRMATION state."""
    gateway = get_agent_gateway()
    rec = gateway.get_record(task_id)
    if not rec:
        return jsonify({"error": f"Task '{task_id}' not found"}), 404

    data = request.get_json(silent=True) or {}
    confirmed = bool(data.get("confirmed", True))
    confirmation_id = data.get("confirmation_id")
    sync = data.get("sync", False)

    if sync:
        try:
            res = gateway.resume(task_id=task_id, confirmed=confirmed, confirmation_id=confirmation_id)
            return jsonify({
                "ok": True,
                "task_id": task_id,
                "result": res.to_dict() if res and hasattr(res, "to_dict") else None,
            })
        except Exception as e:
            return jsonify({"error": f"Resume failed: {str(e)}"}), 500
    else:
        threading.Thread(
            target=gateway.resume,
            args=(task_id,),
            kwargs={"confirmed": confirmed, "confirmation_id": confirmation_id},
            daemon=True,
        ).start()
        return jsonify({
            "ok": True,
            "task_id": task_id,
            "status": "resumed",
        })


@agent_bp.route("/agent/tasks/<task_id>/cancel", methods=["POST"])
@token_required
def cancel_task(task_id: str):
    """Cancel an active or waiting task."""
    gateway = get_agent_gateway()
    rec = gateway.get_record(task_id)
    if not rec:
        return jsonify({"error": f"Task '{task_id}' not found"}), 404

    try:
        cancelled = gateway.cancel(task_id)
        return jsonify({
            "ok": True,
            "task_id": task_id,
            "cancelled": cancelled,
        })
    except Exception as e:
        return jsonify({"error": f"Cancellation failed: {str(e)}"}), 500
