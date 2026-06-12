"""Shared HTTP plumbing for the Vercel Python functions.

Files prefixed with an underscore in api/ are not exposed as endpoints.
"""
from __future__ import annotations

import json
import traceback
from http.server import BaseHTTPRequestHandler

MAX_BODY_BYTES = 2 * 1024 * 1024  # 2 MB — far above any real dataset


def make_handler(get=None, post=None):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if get is None:
                return self._send({"error": "method not allowed"}, 405)
            self._run(get, None)

        def do_POST(self):
            if post is None:
                return self._send({"error": "method not allowed"}, 405)
            length = int(self.headers.get("content-length") or 0)
            if length > MAX_BODY_BYTES:
                return self._send({"error": "request body too large"}, 413)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                return self._send({"error": "invalid JSON body"}, 400)
            if not isinstance(body, dict):
                return self._send({"error": "JSON body must be an object"}, 400)
            self._run(post, body)

        def _run(self, fn, body):
            try:
                self._send(fn(body))
            except KeyError as e:
                self._send({"error": f"missing or unknown field/id: {e}"}, 400)
            except (TypeError, ValueError) as e:
                self._send({"error": f"malformed request: {e}"}, 400)
            except Exception:
                # Never leak stack traces or internals to clients.
                traceback.print_exc()
                self._send({"error": "internal error"}, 500)

        def _send(self, payload, status=200):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)

    return Handler
