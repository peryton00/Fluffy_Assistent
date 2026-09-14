"""
Authentication and Authorization Utilities for Fluffy Web API
Enforces loopback execution and secure token verification.
"""

import hmac
import os
import secrets
from flask import request, jsonify

_RUNTIME_TOKEN: str | None = None


def _get_token() -> str:
    """Fetch the current auth token from environment or generate a secure runtime token."""
    global _RUNTIME_TOKEN
    env_token = os.getenv("FLUFFY_TOKEN")
    if env_token and env_token.strip():
        return env_token.strip()
    if _RUNTIME_TOKEN is None:
        _RUNTIME_TOKEN = secrets.token_hex(32)
    return _RUNTIME_TOKEN


def _check_token(req) -> bool:
    """Verify the X-Fluffy-Token header against the current token using constant-time comparison."""
    provided = req.headers.get("X-Fluffy-Token")
    expected = _get_token()
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)


def token_required(f):
    """Decorator to enforce loopback and token authentication on a route."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        # Allow CORS preflight OPTIONS requests without token
        if request.method == "OPTIONS":
            return "", 204

        # 1. Loopback only
        if request.remote_addr not in ("127.0.0.1", "::1"):
            return jsonify({"error": "Forbidden - Loopback execution only"}), 403
        
        # 2. Token check
        if not _check_token(request):
            return jsonify({"error": "Unauthorized"}), 401
            
        return f(*args, **kwargs)
    return decorated
