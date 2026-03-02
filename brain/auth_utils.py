import os
from flask import request, jsonify

def _get_token():
    """Fetch the current auth token from environment or default."""
    return os.getenv("FLUFFY_TOKEN", "fluffy_dev_token")

def _check_token(req):
    """Verify the X-Fluffy-Token header against the current token."""
    provided = req.headers.get("X-Fluffy-Token")
    return provided == _get_token()

def token_required(f):
    """Decorator to enforce loopback and token authentication on a route."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        # 1. Loopback only
        if request.remote_addr not in ("127.0.0.1", "::1"):
            return jsonify({"error": "Forbidden - Loopback execution only"}), 403
        
        # 2. Token check
        if not _check_token(request):
            return jsonify({"error": "Unauthorized"}), 401
            
        return f(*args, **kwargs)
    return decorated
