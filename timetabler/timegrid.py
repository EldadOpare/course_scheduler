"""Approved time slots. The grid is data now, so the registry can change it."""
from __future__ import annotations

from .models import Timegrid

_DEFAULT = Timegrid()

UG_DAY_START = _DEFAULT.day_start
UG_DAY_END = _DEFAULT.day_end


def approved_slots(kind: str, program: str,
                   grid: Timegrid | None = None) -> list[tuple[str, int]]:
    grid = grid or _DEFAULT
    if program == "mba":
        return [(d, s) for d in grid.weekend for s in grid.weekend_starts]
    return [(d, s) for d in grid.weekdays for s in grid.starts_for(kind)]


def is_approved(kind: str, program: str, day: str, start: int,
                grid: Timegrid | None = None,
                duration: int | None = None) -> bool:
    grid = grid or _DEFAULT
    if program == "mba":
        return (day, start) in approved_slots(kind, "mba", grid)
    if (day, start) not in approved_slots(kind, program, grid):
        return False
    from .models import DURATIONS
    dur = duration or DURATIONS.get(kind, 90)
    return grid.day_start <= start and start + dur <= grid.day_end
