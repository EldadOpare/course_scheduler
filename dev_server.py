"""Local development server. Mirrors the Vercel layout with no dependencies.

    python3 dev_server.py            # http://localhost:3000

Serves web/dist/ as static files and routes /api/* to the same handlers the
Vercel functions use (timetabler/web.py). Reads .env for environment variables.
"""
from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_dotenv()

from timetabler import web  # noqa: E402  (needs .env loaded first)

ROUTES = {
    "/api/validate": ("POST", web.validate_payload),
    "/api/suggest":  ("POST", web.suggest_payload),
    "/api/place":    ("POST", web.place_payload),
    "/api/generate": ("POST", web.generate_payload),
    "/api/simulate": ("POST", web.simulate_payload),
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web" / "dist"), **kwargs)

    def _api(self, method: str):
        path = self.path.split("?")[0]
        route = ROUTES.get(path)
        if route is None:
            return False
        want_method, fn = route
        if method != want_method:
            self._send({"error": "method not allowed"}, 405)
            return True
        body = {}
        if method == "POST":
            length = int(self.headers.get("content-length") or 0)
            if length > 2 * 1024 * 1024:
                self._send({"error": "request body too large"}, 413)
                return True
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                self._send({"error": "invalid JSON body"}, 400)
                return True
            if not isinstance(body, dict):
                self._send({"error": "JSON body must be an object"}, 400)
                return True
        try:
            self._send(fn(body))
        except KeyError:
            import traceback; traceback.print_exc()
            self._send({"error": "missing required field"}, 400)
        except (TypeError, ValueError) as e:
            msg = str(e) if isinstance(e, ValueError) else "malformed request"
            self._send({"error": msg}, 400)
        except Exception:
            import traceback
            traceback.print_exc()
            self._send({"error": "internal error"}, 500)
        return True

    def _send(self, payload, status=200):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._api("GET"):
            super().do_GET()

    def do_POST(self):
        if not self._api("POST"):
            self._send({"error": "not found"}, 404)

    def log_message(self, fmt, *args):
        print(f"  {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"Ashesi Course Scheduling dev server: http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
