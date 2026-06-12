import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]

from _lib import handle_post, method_not_allowed
from timetabler import web


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        handle_post(self, web.simulate_payload)

    def do_GET(self):
        method_not_allowed(self)
