"""
Extension Routes — Flask blueprint
Full CRUD management for Fluffy extensions:
  GET    /extensions                       — list all
  GET    /extensions/<intent>              — single extension detail
  GET    /extensions/<intent>/code         — read handler source
  PUT    /extensions/<intent>/code         — save + hot-reload
  POST   /extensions/<intent>/reload       — force reload
  DELETE /extensions/<intent>              — delete
  GET    /extensions/<intent>/ui           — serve web UI
  POST   /extensions/<intent>/toggle       — enable / disable
  GET    /extensions/<intent>/logo         — serve logo (SVG)
  POST   /extensions/<intent>/open-vscode  — open folder in VS Code
"""

import json
import subprocess
import sys
import os
from pathlib import Path
from flask import Blueprint, jsonify, request, send_file, abort

extension_bp = Blueprint("extensions", __name__)

# ── helpers ───────────────────────────────────────────────────────────────────

def _get_loader():
    from extension_loader import get_extension_loader
    return get_extension_loader()

def _get_creator():
    from extension_creator import get_extension_creator
    return get_extension_creator()

def _ext_dir(intent: str) -> Path:
    loader = _get_loader()
    ext = loader.extensions.get(intent)
    if ext:
        return Path(loader.extensions_dir) / ext["metadata"].get("directory", intent) if "directory" in ext.get("metadata", {}) else loader.extensions_dir / intent
    # Fallback: scan registry
    registry = loader.load_registry()
    entry = registry.get(intent, {})
    directory = entry.get("directory", intent)
    return loader.extensions_dir / directory

def _default_logo_path() -> Path:
    return Path(__file__).parent.parent / "assets" / "fluffy-default-logo.svg"


# ── List all extensions ───────────────────────────────────────────────────────

@extension_bp.route("/extensions", methods=["GET"])
def list_extensions():
    loader = _get_loader()
    loader.sync_registry()
    registry = loader.load_registry()

    results = []
    for intent, reg_meta in registry.items():
        ext_data = loader.extensions.get(intent)
        meta = ext_data["metadata"] if ext_data else reg_meta

        results.append({
            "intent":      intent,
            "name":        meta.get("name", intent),
            "description": meta.get("description", ""),
            "version":     meta.get("version", "1.0.0"),
            "language":    meta.get("language", "python"),
            "has_ui":      meta.get("has_ui", False),
            "logo":        meta.get("logo", ""),
            "enabled":     reg_meta.get("enabled", True),
            "loaded":      intent in loader.extensions,
            "created":     meta.get("created", ""),
            "author":      meta.get("author", "Fluffy AI"),
            "patterns":    meta.get("patterns", []),
        })

    return jsonify({"extensions": results, "total": len(results)})


# ── Single extension detail ───────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>", methods=["GET"])
def get_extension(intent):
    loader = _get_loader()
    registry = loader.load_registry()

    if intent not in registry and intent not in loader.extensions:
        return jsonify({"error": "Extension not found"}), 404

    reg_meta = registry.get(intent, {})
    ext_data = loader.extensions.get(intent)
    meta = ext_data["metadata"] if ext_data else reg_meta

    ext_dir = _ext_dir(intent)
    files = [f.name for f in ext_dir.iterdir()] if ext_dir.exists() else []

    return jsonify({
        "intent":      intent,
        "name":        meta.get("name", intent),
        "description": meta.get("description", ""),
        "version":     meta.get("version", "1.0.0"),
        "language":    meta.get("language", "python"),
        "has_ui":      meta.get("has_ui", False),
        "logo":        meta.get("logo", ""),
        "enabled":     reg_meta.get("enabled", True),
        "loaded":      intent in loader.extensions,
        "created":     meta.get("created", ""),
        "author":      meta.get("author", "Fluffy AI"),
        "patterns":    meta.get("patterns", []),
        "parameters":  meta.get("parameters", {}),
        "files":       files,
        "directory":   str(ext_dir),
    })


# ── Read handler source code ──────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/code", methods=["GET"])
def get_extension_code(intent):
    ext_dir = _ext_dir(intent)
    # Prefer handler.py, fall back to handler.js
    for filename in ("handler.py", "handler.js"):
        handler_file = ext_dir / filename
        if handler_file.exists():
            return jsonify({
                "intent":   intent,
                "filename": filename,
                "language": "python" if filename.endswith(".py") else "javascript",
                "code":     handler_file.read_text(encoding="utf-8")
            })
    return jsonify({"error": "No handler file found"}), 404


# ── Save edited code and hot-reload ──────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/code", methods=["PUT"])
def save_extension_code(intent):
    data = request.get_json(force=True)
    code = data.get("code", "")
    if not code.strip():
        return jsonify({"error": "Empty code rejected"}), 400

    ext_dir = _ext_dir(intent)

    # Determine which file to write
    filename = "handler.js" if data.get("language") == "javascript" else "handler.py"
    handler_file = ext_dir / filename

    if not ext_dir.exists():
        return jsonify({"error": "Extension directory not found"}), 404

    try:
        handler_file.write_text(code, encoding="utf-8")
    except Exception as e:
        return jsonify({"error": f"Failed to write file: {e}"}), 500

    # Hot-reload
    try:
        loader = _get_loader()
        reloaded = loader.reload_extension(intent)
        return jsonify({
            "success": True,
            "message": "Code saved and extension hot-reloaded" if reloaded else "Code saved (manual reload needed)",
            "filename": filename
        })
    except Exception as e:
        return jsonify({"success": True, "message": f"Code saved but reload failed: {e}", "filename": filename})


# ── Force reload ──────────────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/reload", methods=["POST"])
def reload_extension(intent):
    loader = _get_loader()
    ok = loader.reload_extension(intent)
    return jsonify({"success": ok, "message": "Reloaded" if ok else "Reload failed"})


# ── Delete extension ──────────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>", methods=["DELETE"])
def delete_extension(intent):
    loader = _get_loader()
    creator = _get_creator()

    # Remove from registry
    registry = loader.load_registry()
    directory = registry.pop(intent, {}).get("directory", intent)
    loader.save_registry(registry)
    loader.extensions.pop(intent, None)

    # Delete files
    ext_dir = loader.extensions_dir / directory
    ok = creator.delete_extension(directory) if ext_dir.exists() else False

    return jsonify({"success": True, "message": f"Extension '{intent}' removed"})


# ── Toggle enable / disable ───────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/toggle", methods=["POST"])
def toggle_extension(intent):
    loader = _get_loader()
    registry = loader.load_registry()
    if intent not in registry:
        return jsonify({"error": "Extension not found"}), 404

    registry[intent]["enabled"] = not registry[intent].get("enabled", True)
    loader.save_registry(registry)
    state = "enabled" if registry[intent]["enabled"] else "disabled"
    return jsonify({"success": True, "enabled": registry[intent]["enabled"], "message": f"Extension {state}"})


# ── Serve extension web UI ────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/ui", methods=["GET"])
def serve_extension_ui(intent):
    ext_dir = _ext_dir(intent)
    ui_index = ext_dir / "ui" / "index.html"
    if not ui_index.exists():
        return "<h2>This extension has no web UI.</h2>", 404
    return send_file(str(ui_index))


@extension_bp.route("/extensions/<intent>/ui/<path:filename>", methods=["GET"])
def serve_extension_ui_asset(intent, filename):
    ext_dir = _ext_dir(intent)
    asset = ext_dir / "ui" / filename
    if not asset.exists():
        abort(404)
    return send_file(str(asset))


# ── Serve logo ────────────────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/logo", methods=["GET"])
def serve_extension_logo(intent):
    ext_dir = _ext_dir(intent)
    for candidate in (ext_dir / "logo.svg", ext_dir / "logo.png", ext_dir / "icon.svg"):
        if candidate.exists():
            return send_file(str(candidate), mimetype="image/svg+xml" if candidate.suffix == ".svg" else "image/png")
    default = _default_logo_path()
    if default.exists():
        return send_file(str(default), mimetype="image/svg+xml")
    return jsonify({"error": "No logo"}), 404


# ── Run / Test extension ──────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/run", methods=["POST"])
def run_extension(intent):
    """Execute the extension's execute() method with a mock command for testing."""
    loader = _get_loader()
    ext = loader.extensions.get(intent)
    if not ext:
        return jsonify({"success": False, "message": "Extension not loaded"}), 404

    try:
        handler = ext["handler"]
        # Create a mock command object
        class MockIntent:
            def __init__(self, val): self.value = val
        
        class MockCommand:
            def __init__(self, intent_val):
                self.intent = MockIntent(intent_val)
                self.parameters = {} # Run with empty params for basic test
        
        cmd = MockCommand(intent)
        result = handler.execute(cmd)
        return jsonify({
            "success": True, 
            "result": result,
            "message": "Execution complete"
        })
    except Exception as e:
        return jsonify({
            "success": False, 
            "error": str(e),
            "message": "Execution failed"
        }), 500


# ── Open in VS Code ───────────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/open-vscode", methods=["POST"])
def open_in_vscode(intent):
    ext_dir = _ext_dir(intent)
    if not ext_dir.exists():
        return jsonify({"success": False, "message": "Extension directory not found"}), 404

    try:
        subprocess.Popen(["code", str(ext_dir)], shell=True)
        return jsonify({"success": True, "message": f"Opened {ext_dir.name} in VS Code"})
    except FileNotFoundError:
        return jsonify({
            "success": False,
            "message": "VS Code CLI ('code') not found. Make sure VS Code is installed and 'code' is on PATH. "
                       "In VS Code: Ctrl+Shift+P → 'Shell Command: Install code command in PATH'."
        }), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
