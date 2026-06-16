"""Optional Grok layer. Everything in the engine works without this module.

Set XAI_API_KEY to enable. Used only for natural-language output, never for
deciding validity (that is the rules engine's job).
"""
from __future__ import annotations

import json
import os
import urllib.request

API_URL = "https://api.x.ai/v1/chat/completions"
MODEL = os.environ.get("XAI_MODEL") or "grok-2-1212"


def available() -> bool:
    return bool(os.environ.get("XAI_API_KEY"))


def explain(report_text: str) -> str | None:
    """Turn an engine report into a short plain-English summary for the registrar."""
    if not available():
        return None
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an assistant to a university registrar. Summarize this "
                    "timetable validation report in plain English: lead with whether "
                    "the timetable is usable, then the most important problems and "
                    "what to change. Be brief and concrete. Do not invent issues "
                    "that are not in the report."
                ),
            },
            {"role": "user", "content": report_text},
        ],
    }).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['XAI_API_KEY']}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:  # nosec B310 — URL is the hardcoded API_URL constant, never user-supplied
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]
