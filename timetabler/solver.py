"""Exact timetable generation with Google OR-Tools CP-SAT.

Unlike the heuristic in generate.py (backtracking under a node budget, which
can only ever return a "best partial"), this builds one constraint model over
every meeting and lets CP-SAT search it: it scales to thousands of meetings,
returns a provably optimal assignment when one exists, and — crucially — can
prove a request INFEASIBLE rather than just running out of budget.

OR-Tools is an optional dependency. If it is not installed, available() is
False and callers fall back to the heuristic generator. Nothing else in the
engine imports this module at load time.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from . import timegrid
from .models import (
    Course, Dataset, Placement, Room, UNASSIGNED_FACULTY, is_unassigned,
)

try:  # OR-Tools is optional; degrade gracefully when it is absent.
    from ortools.sat.python import cp_model
    _HAVE_ORTOOLS = True
except Exception:  # pragma: no cover - exercised only where ortools is missing
    cp_model = None  # type: ignore[assignment]
    _HAVE_ORTOOLS = False

# Minutes reserved per calendar day on the global timeline, so a meeting on
# Monday can never share an absolute interval with one on Tuesday.
_DAY_SPAN = 24 * 60


def available() -> bool:
    """True when CP-SAT can be used. Set TIMETABLE_NO_SOLVER=1 to force the
    heuristic everywhere — a zero-redeploy kill switch if the solver ever risks
    the serverless timeout on a constrained plan."""
    if os.environ.get("TIMETABLE_NO_SOLVER", "").strip() in ("1", "true", "on"):
        return False
    return _HAVE_ORTOOLS


@dataclass
class SolveResult:
    placements: list[Placement] = field(default_factory=list)
    status: str = "unknown"  # optimal | feasible | infeasible | unknown | unavailable
    objective: int = 0

    @property
    def feasible(self) -> bool:
        return self.status in ("optimal", "feasible")

    @property
    def proven_infeasible(self) -> bool:
        return self.status == "infeasible"


@dataclass(frozen=True)
class _Meeting:
    course: str
    section: int
    kind: str
    index: int

    def key(self) -> tuple[str, int, str, int]:
        return (self.course, self.section, self.kind, self.index)


def _meetings(ds: Dataset) -> list[_Meeting]:
    out = []
    for c in ds.courses.values():
        for section in range(1, c.sections + 1):
            for kind, count in c.sessions.items():
                for index in range(count):
                    out.append(_Meeting(c.code, section, kind, index))
    return out


def _candidate_slots(ds: Dataset, m: _Meeting, course: Course) -> list[tuple[str, int]]:
    dur = ds.duration_of(m.kind)
    return [
        (day, start)
        for day, start in timegrid.approved_slots(m.kind, course.program, ds.timegrid)
        if timegrid.is_approved(m.kind, course.program, day, start, ds.timegrid, dur)
    ]


def _candidate_rooms(ds: Dataset, m: _Meeting, course: Course) -> list[Room]:
    need = ds.section_enrollment(course)
    rooms = []
    for r in ds.rooms.values():
        if r.capacity < need:
            continue
        if m.kind == "lab" and course.requires_room_type \
                and r.type != course.requires_room_type:
            continue
        if r.restricted_to and course.program not in r.restricted_to:
            continue
        rooms.append(r)
    return rooms


def _candidate_faculty(ds: Dataset, course: str) -> list[str]:
    approved = [f.id for f in ds.faculty.values() if course in f.approved_courses]
    return approved or [UNASSIGNED_FACULTY]


def _abs_start(ds: Dataset, day: str, start: int) -> int:
    days = list(ds.timegrid.weekdays) + list(ds.timegrid.weekend)
    return days.index(day) * _DAY_SPAN + start


def _cohort_streams(ds: Dataset) -> list[list[str]]:
    """Required course codes grouped per cohort. Students of a cohort move in
    streams (a stream takes one section of each course), so the model keeps
    each stream's meetings non-overlapping — a guarantee at least as strong as
    the validator's "some section combination fits"."""
    out = []
    for cohort in ds.cohorts():
        required = [c.code for c in ds.courses.values()
                    if ds.required_for(c, cohort)]
        if len(required) > 1:
            out.append(required)
    return out


def solve(ds: Dataset, locked: list[Placement] | None = None,
          max_seconds: float = 12.0, seed: int = 7) -> SolveResult:
    """Build and solve the CP-SAT model. Returns a SolveResult; status
    'unavailable' means OR-Tools is not installed (caller should fall back)."""
    if not _HAVE_ORTOOLS:
        return SolveResult(status="unavailable")

    locked = locked or []
    locked_by_key = {(p.course, p.section, p.kind, p.index): p for p in locked}

    model = cp_model.CpModel()
    meetings = _meetings(ds)

    # Per-meeting decision variables and the data needed to wire constraints.
    start_var: dict[tuple, object] = {}
    main_interval: dict[tuple, object] = {}
    room_lits: dict[tuple, dict[str, object]] = {}
    fac_lits: dict[tuple, dict[str, object]] = {}
    slot_by_day: dict[tuple, dict[str, list[object]]] = {}
    dur_by_key: dict[tuple, int] = {}

    obj_terms: list[tuple[object, int]] = []  # (bool var, weight) to minimise

    for m in meetings:
        course = ds.courses[m.course]
        key = m.key()
        dur = ds.duration_of(m.kind)
        dur_by_key[key] = dur

        slots = _candidate_slots(ds, m, course)
        rooms = _candidate_rooms(ds, m, course)
        facs = _candidate_faculty(ds, m.course)

        locked_p = locked_by_key.get(key)
        if locked_p is not None:
            slots = [(locked_p.day, locked_p.start)]
            rooms = [ds.rooms[locked_p.room]] if locked_p.room in ds.rooms else rooms
            facs = [locked_p.faculty]

        if not slots or not rooms or not facs:
            # No legal placement for this meeting at all → whole request fails.
            return SolveResult(status="infeasible")

        # Start time: one boolean per candidate slot, exactly one chosen.
        slot_lits = {}
        per_day: dict[str, list[object]] = {}
        lo = min(_abs_start(ds, d, s) for d, s in slots)
        hi = max(_abs_start(ds, d, s) for d, s in slots)
        sv = model.NewIntVar(lo, hi, f"start_{key}")
        for (day, start) in slots:
            lit = model.NewBoolVar(f"slot_{key}_{day}_{start}")
            slot_lits[(day, start)] = lit
            model.Add(sv == _abs_start(ds, day, start)).OnlyEnforceIf(lit)
            per_day.setdefault(day, []).append(lit)
            # nudge away from the lunch window when alternatives exist
            r = ds.rules
            if start < r.lunch_end and start + dur > r.lunch_start:
                obj_terms.append((lit, 2))
        model.AddExactlyOne(slot_lits.values())
        start_var[key] = sv
        slot_by_day[key] = per_day

        # Main interval (always present) drives cohort no-overlap.
        main_interval[key] = model.NewFixedSizeIntervalVar(sv, dur, f"iv_{key}")

        # Room: exactly one, with an optional interval per room for no-overlap.
        rlits = {}
        for r in rooms:
            lit = model.NewBoolVar(f"room_{key}_{r.id}")
            rlits[r.id] = lit
            if r.capacity > 2 * ds.section_enrollment(course):
                obj_terms.append((lit, 2))  # discourage grossly oversized rooms
        model.AddExactlyOne(rlits.values())
        room_lits[key] = rlits

        # Faculty: exactly one.
        flits = {}
        for fid in facs:
            flits[fid] = model.NewBoolVar(f"fac_{key}_{fid}")
        model.AddExactlyOne(flits.values())
        fac_lits[key] = flits

        # Adjunct availability: forbid (faculty, slot) pairs outside windows.
        for fid, flit in flits.items():
            fac = ds.faculty.get(fid)
            if not fac or fac.type != "adjunct":
                continue
            for (day, start), slit in slot_lits.items():
                if not any(w.contains(day, start, start + dur) for w in fac.availability):
                    model.AddBoolOr([flit.Not(), slit.Not()])

    # ── Room no-overlap ──────────────────────────────────────────────────
    room_intervals: dict[str, list[object]] = {}
    for m in meetings:
        key = m.key()
        sv = start_var[key]
        dur = dur_by_key[key]
        for rid, lit in room_lits[key].items():
            iv = model.NewOptionalFixedSizeIntervalVar(sv, dur, lit, f"riv_{key}_{rid}")
            room_intervals.setdefault(rid, []).append(iv)
    for ivs in room_intervals.values():
        if len(ivs) > 1:
            model.AddNoOverlap(ivs)

    # ── Faculty no-overlap (placeholder excluded: it is not a real person) ─
    fac_intervals: dict[str, list[object]] = {}
    for m in meetings:
        key = m.key()
        sv = start_var[key]
        dur = dur_by_key[key]
        for fid, lit in fac_lits[key].items():
            if is_unassigned(fid):
                continue
            iv = model.NewOptionalFixedSizeIntervalVar(sv, dur, lit, f"fiv_{key}_{fid}")
            fac_intervals.setdefault(fid, []).append(iv)
    for ivs in fac_intervals.values():
        if len(ivs) > 1:
            model.AddNoOverlap(ivs)

    # ── Cohort streams: each stream's meetings must not overlap ───────────
    meetings_by_course_section: dict[tuple[str, int], list[tuple]] = {}
    for m in meetings:
        meetings_by_course_section.setdefault((m.course, m.section), []).append(m.key())
    section_count = {code: c.sections for code, c in ds.courses.items()}

    for required in _cohort_streams(ds):
        max_sections = max((section_count.get(c, 1) for c in required), default=1)
        for stream in range(1, max_sections + 1):
            ivs = []
            for code in required:
                sec = stream if stream <= section_count.get(code, 1) else 1
                for key in meetings_by_course_section.get((code, sec), []):
                    ivs.append(main_interval[key])
            if len(ivs) > 1:
                model.AddNoOverlap(ivs)

    # ── Faculty section-load cap ──────────────────────────────────────────
    teaches: dict[tuple[str, str, int], object] = {}  # (fac, course, section) -> bool
    for m in meetings:
        key = m.key()
        for fid, lit in fac_lits[key].items():
            if is_unassigned(fid):
                continue
            tk = (fid, m.course, m.section)
            tv = teaches.get(tk)
            if tv is None:
                tv = model.NewBoolVar(f"teaches_{fid}_{m.course}_{m.section}")
                teaches[tk] = tv
            model.AddImplication(lit, tv)
    fac_section_lits: dict[str, list[object]] = {}
    for (fid, _c, _s), tv in teaches.items():
        fac_section_lits.setdefault(fid, []).append(tv)
    for fid, tvs in fac_section_lits.items():
        fac = ds.faculty.get(fid)
        if fac is None:
            continue
        cap = int(fac.load_target + fac.max_overload)
        if cap < len(tvs):
            model.Add(sum(tvs) <= cap)

    # ── Faculty max-hours-per-day ─────────────────────────────────────────
    # Per (faculty, day): sum of durations of meetings that faculty teaches
    # that day must stay under the cap. z = (teaches m) AND (m is on day d),
    # linearised with three inequalities (cheaper than reified booleans). The
    # day indicator is the sum of that meeting's slot literals on the day,
    # which is itself 0/1 since a meeting takes exactly one slot.
    days_all = list(ds.timegrid.weekdays) + list(ds.timegrid.weekend)
    for fid in fac_intervals:  # only real faculty that can teach something
        fac = ds.faculty.get(fid)
        if fac is None:
            continue
        cap_min = int(fac.max_hours_per_day * 60)
        for day in days_all:
            terms = []
            for m in meetings:
                key = m.key()
                flit = fac_lits[key].get(fid)
                day_lits = slot_by_day[key].get(day)
                if flit is None or not day_lits:
                    continue
                day_sum = sum(day_lits)  # 0 or 1: is this meeting on this day?
                z = model.NewBoolVar(f"on_{key}_{fid}_{day}")
                model.Add(z <= flit)
                model.Add(z <= day_sum)
                model.Add(z >= flit + day_sum - 1)
                terms.append((z, dur_by_key[key]))
            if terms and sum(t[1] for t in terms) > cap_min:
                model.Add(sum(z * d for z, d in terms) <= cap_min)

    # ── Objective: minimise the modest soft costs we modelled ─────────────
    if obj_terms:
        model.Minimize(sum(var * w for var, w in obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_seconds
    solver.parameters.random_seed = seed
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return SolveResult(status="infeasible")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(status="unknown")

    placements: list[Placement] = []
    for m in meetings:
        key = m.key()
        abs_start = solver.Value(start_var[key])
        start = abs_start % _DAY_SPAN
        day_idx = abs_start // _DAY_SPAN
        day = (list(ds.timegrid.weekdays) + list(ds.timegrid.weekend))[day_idx]
        room = next(rid for rid, lit in room_lits[key].items() if solver.Value(lit))
        fac = next(fid for fid, lit in fac_lits[key].items() if solver.Value(lit))
        placements.append(ds.make_placement(
            m.course, m.section, m.kind, m.index, day, start, room, fac))

    return SolveResult(
        placements=placements,
        status="optimal" if status == cp_model.OPTIMAL else "feasible",
        objective=int(solver.ObjectiveValue()) if obj_terms else 0,
    )
