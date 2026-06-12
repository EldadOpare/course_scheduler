"""Shared HTTP plumbing for the Vercel Python functions.

Files prefixed with an underscore in api/ are not exposed as endpoints.

Each api/*.py defines `class handler(BaseHTTPRequestHandler)` literally —
Vercel's build step detects functions by statically finding that class, so
the class definition cannot be hidden behind a factory.
"""
from __future__ import annotations

import json
import traceback

MAX_BODY_BYTES = 2 * 1024 * 1024  # 2 MB — far above any real dataset


def send_json(req, payload, status=200):
    data = json.dumps(payload).encode()
    req.send_response(status)
    req.send_header("Content-Type", "application/json")
    req.send_header("X-Content-Type-Options", "nosniff")
    req.end_headers()
    req.wfile.write(data)


def handle_post(req, fn):
    """Parse the JSON body, run `fn(body)`, send the JSON response."""
    length = int(req.headers.get("content-length") or 0)
    if length > MAX_BODY_BYTES:
        return send_json(req, {"error": "request body too large"}, 413)
    raw = req.rfile.read(length) if length else b"{}"
    try:
        body = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        return send_json(req, {"error": "invalid JSON body"}, 400)
    if not isinstance(body, dict):
        return send_json(req, {"error": "JSON body must be an object"}, 400)
    try:
        send_json(req, fn(body))
    except KeyError as e:
        send_json(req, {"error": f"missing or unknown field/id: {e}"}, 400)
    except (TypeError, ValueError) as e:
        send_json(req, {"error": f"malformed request: {e}"}, 400)
    except Exception:
        # Never leak stack traces or internals to clients.
        traceback.print_exc()
        send_json(req, {"error": "internal error"}, 500)


def method_not_allowed(req):
    send_json(req, {"error": "method not allowed"}, 405)
