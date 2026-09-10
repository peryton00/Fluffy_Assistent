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

    return jsonify({"ok": True, "success": True, "extensions": results, "total": len(results)})


# ── Create new extension from code ───────────────────────────────────────────

@extension_bp.route("/extensions", methods=["POST"])
def create_extension():
    """
    Create a new custom extension from code.
    Writes metadata.json, handler.py (or handler.js + wrapper), validator.py, __init__.py,
    registers the extension in registry.json, and hot-loads it into the active runtime.
    """
    import re
    from datetime import datetime

    try:
        data = request.get_json(force=True) or {}
    except Exception as e:
        return jsonify({"ok": False, "success": False, "error": f"Invalid JSON body: {e}"}), 400

    raw_intent = data.get("intent", "").strip()
    raw_name = data.get("name", "").strip()

    if not raw_intent and raw_name:
        raw_intent = re.sub(r'[^a-zA-Z0-9_]', '_', raw_name.lower())

    intent = re.sub(r'[^a-zA-Z0-9_]', '_', raw_intent.lower()).strip('_')
    if not intent:
        return jsonify({"ok": False, "success": False, "error": "Intent identifier is required (alphanumeric and underscores)"}), 400

    name = raw_name or intent.replace("_", " ").title()
    description = data.get("description", "").strip()
    language = data.get("language", "python").strip().lower()
    code = data.get("code", "").strip()
    patterns = data.get("patterns", [])
    if isinstance(patterns, str):
        patterns = [p.strip() for p in patterns.split(",") if p.strip()]
    triggers = data.get("triggers", [])
    if isinstance(triggers, str):
        triggers = [t.strip() for t in triggers.split(",") if t.strip()]
    parameters = data.get("parameters", {})
    if not isinstance(parameters, dict):
        parameters = {}
    author = data.get("author", "User").strip() or "User"

    clean_patterns = [str(p).strip() for p in patterns if str(p).strip()]
    clean_triggers = [str(t).strip() for t in triggers if str(t).strip()]
    intent_phrase = intent.replace("_", " ")
    if intent_phrase not in clean_triggers:
        clean_triggers.append(intent_phrase)

    loader = _get_loader()
    ext_dir = loader.extensions_dir / intent
    ext_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "name": name,
        "intent": intent,
        "version": "1.0.0",
        "description": description,
        "author": author,
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
        "language": language,
        "has_ui": False,
        "patterns": clean_patterns,
        "triggers": clean_triggers,
        "aliases": [],
        "parameters": parameters,
        "enabled": True,
        "safety_level": "needs_confirmation"
    }

    try:
        # 1. Write metadata.json & __init__.py
        (ext_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        (ext_dir / "__init__.py").write_text(f'"""Extension: {intent}"""\n', encoding="utf-8")

        class_name = "".join(word.capitalize() for word in intent.split("_"))

        # 2. Write handler
        if language in ("javascript", "js"):
            js_code = code or (
                f"// {intent} Extension - JavaScript Handler\n"
                "const fs = require('fs');\n"
                "const input = fs.readFileSync(0, 'utf-8');\n"
                "const params = input ? JSON.parse(input) : {};\n\n"
                f"console.log(JSON.stringify({{\n  success: true,\n  message: `Executed {name} successfully!`,\n  data: params\n}}));\n"
            )
            (ext_dir / "handler.js").write_text(js_code, encoding="utf-8")
            creator = _get_creator()
            py_wrapper = creator._make_js_wrapper(class_name, intent, js_code)
            (ext_dir / "handler.py").write_text(py_wrapper, encoding="utf-8")
        else:
            if not code:
                code = f'''"""
{name} ({intent}) - Extension Handler
Created by {author}
"""

from typing import Dict, Any

class {class_name}Handler:
    """Handle {name} operations"""

    def execute(self, command) -> Dict[str, Any]:
        """
        Execute {name}.
        
        Args:
            command: Object with .intent and .parameters (dict)
        
        Returns:
            Dict with 'success' (bool), 'message' (str), and optional 'data' (dict)
        """
        params = command.parameters if hasattr(command, "parameters") else {{}}
        action = params.get("action", "run")
        
        return {{
            "success": True,
            "message": f"Successfully executed {name} with action '{{action}}'!",
            "data": {{
                "intent": "{intent}",
                "parameters": params
            }}
        }}

def get_handler():
    return {class_name}Handler()
'''
            elif "def get_handler" not in code:
                if f"class {class_name}Handler" in code:
                    code = f"{code}\n\ndef get_handler():\n    return {class_name}Handler()\n"
                else:
                    code = f'''from typing import Dict, Any\n\nclass {class_name}Handler:\n    def execute(self, command) -> Dict[str, Any]:\n        params = getattr(command, "parameters", {{}})\n{code}\n\ndef get_handler():\n    return {class_name}Handler()\n'''

            (ext_dir / "handler.py").write_text(code, encoding="utf-8")

        # 3. Write validator.py
        validator_code = f'''"""
{name} ({intent}) - Validator
"""

try:
    from brain.action_validator import ValidationResult, SafetyLevel
except ImportError:
    from action_validator import ValidationResult, SafetyLevel

class {class_name}Validator:
    """Validate {name} operations"""

    def validate(self, command):
        return None

def get_validator():
    return {class_name}Validator()
'''
        (ext_dir / "validator.py").write_text(validator_code, encoding="utf-8")

        # 4. Copy matching icon if available
        try:
            creator = _get_creator()
            creator._assign_logo(intent, ext_dir)
        except Exception:
            pass

        # 5. Register in registry.json & hot-load into runtime
        registry_meta = {
            "name": name,
            "intent": intent,
            "patterns": clean_patterns,
            "triggers": clean_triggers,
            "aliases": [],
            "description": description,
            "directory": intent,
            "created": metadata["created"],
            "version": "1.0.0",
            "enabled": True,
            "language": language,
            "has_ui": False,
            "logo": metadata.get("logo", ""),
            "author": author
        }
        loader.register_extension(intent, registry_meta)
        loader.load_all_extensions()

        return jsonify({
            "ok": True,
            "success": True,
            "intent": intent,
            "name": name,
            "message": f"Extension '{name}' ({intent}) created and loaded into active Fluffy runtime!",
        }), 201

    except Exception as e:
        return jsonify({"ok": False, "success": False, "error": f"Failed to create extension: {e}"}), 500



# ── Single extension detail ───────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>", methods=["GET"])
def get_extension(intent):
    loader = _get_loader()
    registry = loader.load_registry()

    if intent not in registry and intent not in loader.extensions:
        return jsonify({"ok": False, "success": False, "error": "Extension not found"}), 404

    reg_meta = registry.get(intent, {})
    ext_data = loader.extensions.get(intent)
    meta = ext_data["metadata"] if ext_data else reg_meta

    ext_dir = _ext_dir(intent)
    files = [f.name for f in ext_dir.iterdir()] if ext_dir.exists() else []

    detail = {
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
    }

    return jsonify({
        "ok": True,
        "success": True,
        "extension": detail,
        **detail
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
                "ok":       True,
                "success":  True,
                "intent":   intent,
                "filename": filename,
                "language": "python" if filename.endswith(".py") else "javascript",
                "code":     handler_file.read_text(encoding="utf-8")
            })
    return jsonify({"ok": False, "success": False, "error": "No handler file found"}), 404


# ── Save edited code and hot-reload ──────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/code", methods=["PUT"])
def save_extension_code(intent):
    data = request.get_json(force=True)
    code = data.get("code", "")
    if not code.strip():
        return jsonify({"ok": False, "success": False, "error": "Empty code rejected"}), 400

    ext_dir = _ext_dir(intent)

    # Determine which file to write
    filename = "handler.js" if data.get("language") == "javascript" else "handler.py"
    handler_file = ext_dir / filename

    if not ext_dir.exists():
        return jsonify({"ok": False, "success": False, "error": "Extension directory not found"}), 404

    try:
        handler_file.write_text(code, encoding="utf-8")
    except Exception as e:
        return jsonify({"ok": False, "success": False, "error": f"Failed to write file: {e}"}), 500

    # Hot-reload
    try:
        loader = _get_loader()
        reloaded = loader.reload_extension(intent)
        return jsonify({
            "ok": True,
            "success": True,
            "message": "Code saved and extension hot-reloaded" if reloaded else "Code saved (manual reload needed)",
            "filename": filename
        })
    except Exception as e:
        return jsonify({"ok": True, "success": True, "message": f"Code saved but reload failed: {e}", "filename": filename})


# ── Force reload ──────────────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/reload", methods=["POST"])
def reload_extension(intent):
    loader = _get_loader()
    ok = loader.reload_extension(intent)
    return jsonify({"ok": ok, "success": ok, "message": "Reloaded" if ok else "Reload failed"})


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

    return jsonify({"ok": True, "success": True, "message": f"Extension '{intent}' removed"})


# ── Toggle enable / disable ───────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/toggle", methods=["POST"])
def toggle_extension(intent):
    loader = _get_loader()
    registry = loader.load_registry()
    if intent not in registry:
        return jsonify({"ok": False, "success": False, "error": "Extension not found"}), 404

    registry[intent]["enabled"] = not registry[intent].get("enabled", True)
    loader.save_registry(registry)
    state = "enabled" if registry[intent]["enabled"] else "disabled"
    return jsonify({"ok": True, "success": True, "enabled": registry[intent]["enabled"], "message": f"Extension {state}"})


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
    return jsonify({"ok": False, "success": False, "error": "No logo"}), 404


# ── Run / Test extension ──────────────────────────────────────────────────────

@extension_bp.route("/extensions/<intent>/run", methods=["POST"])
def run_extension(intent):
    """Execute the extension's execute() method with a mock command for testing."""
    loader = _get_loader()
    ext = loader.extensions.get(intent)
    if not ext:
        return jsonify({"ok": False, "success": False, "message": "Extension not loaded"}), 404

    try:
        data = request.get_json(silent=True) or {}
        payload = data.get("payload", {})

        handler = ext["handler"]
        # Create a mock command object
        class MockIntent:
            def __init__(self, val): self.value = val
        
        class MockCommand:
            def __init__(self, intent_val, parameters):
                self.intent = MockIntent(intent_val)
                self.parameters = parameters if isinstance(parameters, dict) else {}
        
        cmd = MockCommand(intent, payload)
        result = handler.execute(cmd)
        return jsonify({
            "ok": True,
            "success": True, 
            "result": result,
            "message": "Execution complete"
        })
    except Exception as e:
        return jsonify({
            "ok": False,
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
