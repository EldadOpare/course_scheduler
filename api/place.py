import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]

from _lib import make_handler
from timetabler import web

handler = make_handler(post=web.place_payload)
