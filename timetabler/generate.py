"""V4: draft generation. Constructive search per profile, then local-search
polish, returning ranked options with their drawbacks spelled out."""
from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from itertools import combinations

from . import engine, timegrid
from .models import Course, Dataset, Penalty, Placement, Violation, UNASSIGNED_FACULTY, is_unassigned
from .rules import soft
from .rules.soft import ENGINEERING_SPACES

# During polish, full-score only the most promising moves per meeting (ranked
# by the cheap local estimate). Bounds the expensive whole-timetable rescore.
_IMPROVE_TOP_K = 12

PROFILES: dict[str, dict[str, int]] = {
    "Balanced": {},
    "Student-first": {
        "S-STU-1": 8, "S-STU-2": 12, "S-STU-3": 8,
        "S-STU-5": 10, "S-CRS-1": 10,
    },
    "Faculty-first": {
        "S-FAC-1": 10, "S-FAC-2": 14, "S-FAC-3": 10, "S-FAC-4": 6,
    },
}


@dataclass(frozen=True)
class Meeting:
    course: str
    section: int
    kind: str
    index: int


@dataclass
class Unplaced:
    course: str
    section: int
    kind: str
    index: int
    reason: str


@dataclass
class GenResult:
    placements: list[Placement]
    unplaced: list[Unplaced] = field(default_factory=list)

    @property
    def complete(self) -> bool:
        return not self.unplaced


@dataclass
class GenOption:
    label: str
    placements: list[Placement]
    score: int
    penalties: list[Penalty]
    unplaced: list[Unplaced]
    violations: list[Violation] = field(default_factory=list)


def all_meetings(ds: Dataset) -> list[Meeting]:
    out = []
    for c in ds.courses.values():
        for section in range(1, c.sections + 1):
            for kind, count in c.sessions.items():
                for index in range(count):
                    out.append(Meeting(c.code, section, kind, index))
    return out


def priority(ds: Dataset, m: Meeting) -> tuple:
    # I sorted the hardest meetings first (special labs, MBA blocks,
    # courses only one person can teach) so the search did not paint
    # itself into a corner before reaching them.
    c = ds.courses[m.course]
    approved = sum(1 for f in ds.faculty.values() if m.course in f.approved_courses)
    if m.kind == "lab" and c.requires_room_type in ENGINEERING_SPACES:
        rank = 0
    elif m.kind == "lab" and c.requires_room_type == "computer_lab":
        rank = 1
    elif c.program == "mba":
        rank = 2
    elif approved <= 1:
        rank = 3
    elif c.type == "core" and ds.enrollment(c) >= 60:
        rank = 4
    elif c.type == "major_core":
        rank = 5
    elif m.kind == "lecture":
        rank = 6
    elif m.kind == "discussion":
        rank = 7
    else:
        rank = 8
    return (rank, approved, -ds.enrollment(c), m.course, m.section, m.kind, m.index)


def cohort_pairs(ds: Dataset) -> dict[str, set[str]]:
    # I precomputed which course pairs every cohort must be able to
    # combine, so the search could check just those instead of all pairs.
    pairs: dict[str, set[str]] = {}

    def link(a: str, b: str):
        pairs.setdefault(a, set()).add(b)
        pairs.setdefault(b, set()).add(a)

    for cohort in ds.cohorts():
        plan = ds.plan_for(cohort.major, cohort.level)
        if plan is not None:
            mand = [c for c in plan.mandatory if c in ds.courses]
            for a, b in combinations(mand, 2):
                link(a, b)
            for pool in plan.elective_pools:
                for c in pool.courses:
                    if c in ds.courses:
                        for m in mand:
                            link(c, m)
        else:
            req = [c.code for c in ds.courses.values()
                   if ds.required_for(c, cohort)]
            for a, b in combinations(req, 2):
                link(a, b)
    return pairs


def _sections_by_course(placed: list[Placement]) -> dict[str, dict[int, list[Placement]]]:
    out: dict[str, dict[int, list[Placement]]] = {}
    for p in placed:
        out.setdefault(p.course, {}).setdefault(p.section, []).append(p)
    return out


def _pairs_still_ok(idx: dict[str, dict[int, list[Placement]]],
                    cand: Placement, partners: set[str]) -> bool:

    a_secs = {k: list(v) for k, v in idx.get(cand.course, {}).items()}
    a_secs.setdefault(cand.section, []).append(cand)
    for other in partners:
        b_secs = idx.get(other)
        if not b_secs:
            continue
        ok = any(
            not any(x.overlaps(y) for x in ma for y in mb)
            for ma in a_secs.values() for mb in b_secs.values()
        )
        if not ok:
            return False
    return True


def _conflicts(ds: Dataset, placed: list[Placement], cand: Placement,
               fac_minutes: dict[tuple[str, str], int],
               fac_sections: dict[str, set[tuple[str, int]]]) -> bool:
    # The placeholder teacher carries no approval/availability/load limits
    # and never clashes with itself — only its room can clash.
    if is_unassigned(cand.faculty):
        return any(p.overlaps(cand) and p.room == cand.room for p in placed)
    fac = ds.faculty.get(cand.faculty)
    if fac is None or cand.course not in fac.approved_courses:
        return True
    if fac.type == "adjunct" and not any(
        w.contains(cand.day, cand.start, cand.end) for w in fac.availability
    ):
        return True
    if fac_minutes.get((cand.faculty, cand.day), 0) + (cand.end - cand.start) \
            > fac.max_hours_per_day * 60:
        return True
    secs = fac_sections.get(cand.faculty, set())
    if (cand.course, cand.section) not in secs \
            and len(secs) + 1 > fac.load_target + fac.max_overload:
        return True
    for p in placed:
        if p.overlaps(cand) and (p.faculty == cand.faculty or p.room == cand.room):
            return True
    return False


def _local_penalty(ds: Dataset, placed: list[Placement], cand: Placement,
                   course: Course, w: dict[str, int]) -> int:
    # I scored candidates with this cheap local estimate instead of the
    # full scorer because the full one runs over the whole timetable, and
    # doing that for every candidate made generation crawl.
    s = 0
    fac = ds.faculty.get(cand.faculty)
    if fac and fac.preferred_times and not any(
        win.contains(cand.day, cand.start, cand.end) for win in fac.preferred_times
    ):
        s += w["S-FAC-1"]
    room = ds.rooms[cand.room]
    if room.capacity > 2 * ds.section_enrollment(course):
        s += w["S-ROOM-1"]
    if room.type in ENGINEERING_SPACES \
            and course.requires_room_type not in ENGINEERING_SPACES:
        s += w["S-ROOM-2"]
    r = ds.rules
    if cand.start < r.lunch_end and cand.end > r.lunch_start:
        s += 1  # nudge away from the lunch window when free slots exist
    for p in placed:
        if p.course == cand.course and p.section == cand.section:
            if p.kind == cand.kind and p.day == cand.day:
                s += w["S-CRS-1"]
            if p.kind == cand.kind and p.room != cand.room:
                s += w["S-ROOM-3"]
        if fac and fac.type == "adjunct" and p.faculty == cand.faculty \
                and p.day != cand.day:
            s += 1  # keep adjunct days together
    return s


def _weights(overrides: dict[str, int]) -> dict[str, int]:
    from .rules.soft import WEIGHTS
    w = dict(WEIGHTS)
    w.update(overrides)
    return w


def _teacher_order(ds: Dataset, course: str,
                   fac_sections: dict[str, set[tuple[str, int]]]) -> list[str]:
    approved = [f for f in ds.faculty.values() if course in f.approved_courses]
    # No approved lecturer → schedule against the placeholder so the draft
    # still places the meeting; a real lecturer is assigned afterwards.
    if not approved:
        return [UNASSIGNED_FACULTY]
    return [f.id for f in sorted(
        approved,
        key=lambda f: (len(fac_sections.get(f.id, ())) - f.load_target,
                       len(fac_sections.get(f.id, ()))),
    )]


def _why_stuck(ds: Dataset, m: Meeting, course: Course) -> str:
    if not any(m.course in f.approved_courses for f in ds.faculty.values()):
        return "no approved faculty for this course"
    need = ds.section_enrollment(course)
    rooms = [r for r in ds.rooms.values() if r.capacity >= need]
    if m.kind == "lab" and course.requires_room_type:
        rooms = [r for r in rooms if r.type == course.requires_room_type]
    if not rooms:
        return (f"no {course.requires_room_type or 'room'} with capacity "
                f"for {need} students")
    return "every legal slot/room/teacher combination conflicts with the rest"


def _generate_one(ds: Dataset, locked: list[Placement],
                  weights: dict[str, int], max_nodes: int,
                  rng: random.Random) -> GenResult:
    w = _weights(weights)
    pairs = cohort_pairs(ds)

    locked_keys = {(p.course, p.section, p.kind, p.index) for p in locked}
    meetings = sorted(
        (m for m in all_meetings(ds)
         if (m.course, m.section, m.kind, m.index) not in locked_keys),
        key=lambda m: priority(ds, m),
    )

    # I kept these running tallies in sync with the search path so the
    # conflict checks stayed cheap instead of re-counting every time.
    placed: list[Placement] = list(locked)
    fac_minutes: dict[tuple[str, str], int] = {}
    fac_sections: dict[str, set[tuple[str, int]]] = {}
    section_teacher: dict[tuple[str, int], str] = {}
    for p in locked:
        fac_minutes[(p.faculty, p.day)] = \
            fac_minutes.get((p.faculty, p.day), 0) + (p.end - p.start)
        fac_sections.setdefault(p.faculty, set()).add((p.course, p.section))
        section_teacher[(p.course, p.section)] = p.faculty

    def candidates(m: Meeting) -> list[Placement]:
        course = ds.courses[m.course]
        fixed = section_teacher.get((m.course, m.section))
        teachers = [fixed] if fixed else _teacher_order(ds, m.course, fac_sections)
        need = ds.section_enrollment(course)
        rooms = [r for r in ds.rooms.values() if r.capacity >= need]
        if m.kind == "lab" and course.requires_room_type:
            rooms = [r for r in rooms if r.type == course.requires_room_type]
        idx = _sections_by_course(placed)
        partners = pairs.get(m.course, set())

        scored = []
        for teacher in teachers:
            for day, start in timegrid.approved_slots(m.kind, course.program,
                                                      ds.timegrid):
                for room in rooms:
                    cand = ds.make_placement(m.course, m.section, m.kind,
                                             m.index, day, start, room.id, teacher)
                    if _conflicts(ds, placed, cand, fac_minutes, fac_sections):
                        continue
                    if partners and not _pairs_still_ok(idx, cand, partners):
                        continue
                    pen = _local_penalty(ds, placed, cand, course, w)
                    scored.append((pen + rng.random() * 0.5, cand))
        scored.sort(key=lambda t: t[0])
        return [cand for _, cand in scored[:40]]

    nodes = 0
    best_partial: list[Placement] = list(placed)
    best_depth = 0

    def push(cand: Placement):
        placed.append(cand)
        fac_minutes[(cand.faculty, cand.day)] = \
            fac_minutes.get((cand.faculty, cand.day), 0) + (cand.end - cand.start)
        fac_sections.setdefault(cand.faculty, set()).add((cand.course, cand.section))

    def pop(cand: Placement):
        placed.pop()
        fac_minutes[(cand.faculty, cand.day)] -= cand.end - cand.start
        if not any(p.faculty == cand.faculty
                   and (p.course, p.section) == (cand.course, cand.section)
                   for p in placed):
            fac_sections.get(cand.faculty, set()).discard((cand.course, cand.section))

    def search(i: int) -> bool:
        nonlocal nodes, best_partial, best_depth
        if i == len(meetings):
            return True
        nodes += 1
        if nodes > max_nodes:
            return False
        m = meetings[i]
        had_teacher = (m.course, m.section) in section_teacher
        for cand in candidates(m):
            if not had_teacher:
                section_teacher[(m.course, m.section)] = cand.faculty
            push(cand)
            if i + 1 > best_depth:
                best_depth = i + 1
                best_partial = list(placed)
            if search(i + 1):
                return True
            pop(cand)
            if not had_teacher:
                section_teacher.pop((m.course, m.section), None)
            if nodes > max_nodes:
                return False
        return False

    if search(0):
        return GenResult(placements=list(placed))

    # I returned the best partial draft instead of giving up, so the
    # registry could see exactly what got stuck and why.
    placed_keys = {(p.course, p.section, p.kind, p.index) for p in best_partial}
    unplaced = [
        Unplaced(m.course, m.section, m.kind, m.index,
                 _why_stuck(ds, m, ds.courses[m.course]))
        for m in meetings
        if (m.course, m.section, m.kind, m.index) not in placed_keys
    ]
    return GenResult(placements=best_partial, unplaced=unplaced)


#

# I added this polish step because the first draft the search found was
# rarely the best one. Moving meetings around afterwards kept cutting
# the penalty score, so I let it run until the time budget ran out. It
# never touches locked meetings, just in case the registry pinned them.
def _improve(ds: Dataset, placements: list[Placement],
             locked_keys: set[tuple], w: dict[str, int],
             seconds: float, rng: random.Random) -> list[Placement]:
    if not placements or seconds <= 0:
        return placements
    deadline = time.monotonic() + seconds
    placements = list(placements)
    pairs = cohort_pairs(ds)

    def total(plist: list[Placement]) -> int:
        return sum(p.weight for p in soft.score_all(ds, plist, w))

    best_total = total(placements)
    improved = True
    while improved and time.monotonic() < deadline and best_total > 0:
        improved = False
        order = [i for i in range(len(placements))
                 if (placements[i].course, placements[i].section,
                     placements[i].kind, placements[i].index) not in locked_keys]
        rng.shuffle(order)
        for i in order:
            if time.monotonic() > deadline:
                break
            cur = placements[i]
            others = placements[:i] + placements[i + 1:]
            course = ds.courses.get(cur.course)
            if course is None:
                continue

            fac_minutes: dict[tuple[str, str], int] = {}
            fac_sections: dict[str, set[tuple[str, int]]] = {}
            for p in others:
                fac_minutes[(p.faculty, p.day)] = \
                    fac_minutes.get((p.faculty, p.day), 0) + (p.end - p.start)
                fac_sections.setdefault(p.faculty, set()).add((p.course, p.section))
            idx = _sections_by_course(others)
            partners = pairs.get(cur.course, set())

            need = ds.section_enrollment(course)
            rooms = [r for r in ds.rooms.values() if r.capacity >= need]
            if cur.kind == "lab" and course.requires_room_type:
                rooms = [r for r in rooms if r.type == course.requires_room_type]

            # Gather feasible moves and rank them by the cheap local estimate,
            # then pay for the full timetable rescore on only the few most
            # promising ones. The full scorer is the expensive part, so this
            # keeps polish fast even when a meeting has hundreds of legal slots.
            feasible: list[tuple[int, Placement]] = []
            for day, start in timegrid.approved_slots(cur.kind, course.program,
                                                      ds.timegrid):
                if time.monotonic() > deadline:
                    break
                for room in rooms:
                    if (day, start, room.id) == (cur.day, cur.start, cur.room):
                        continue
                    cand = ds.make_placement(cur.course, cur.section, cur.kind,
                                             cur.index, day, start, room.id,
                                             cur.faculty)
                    if _conflicts(ds, others, cand, fac_minutes, fac_sections):
                        continue
                    if partners and not _pairs_still_ok(idx, cand, partners):
                        continue
                    feasible.append((_local_penalty(ds, others, cand, course, w), cand))
            feasible.sort(key=lambda t: t[0])

            best_cand, best_cand_total = None, best_total
            for _, cand in feasible[:_IMPROVE_TOP_K]:
                if time.monotonic() > deadline:
                    break
                t = total(others + [cand])
                if t < best_cand_total:
                    best_cand, best_cand_total = cand, t
            if best_cand is not None:
                placements[i] = best_cand
                best_total = best_cand_total
                improved = True
    return placements


def _solver_option(ds: Dataset, locked: list[Placement],
                   max_seconds: float, improve_seconds: float,
                   rng: random.Random) -> GenOption | None:
    """Run the exact CP-SAT solver, if installed, then polish its result with
    the same local search the heuristic uses, and wrap it as an 'Optimized'
    option. CP-SAT guarantees a clash-free placement (and can place meetings
    the bounded heuristic gives up on); the polish then minimises the full soft
    score, which the solver's lighter objective does not capture on its own.

    Returns None when OR-Tools is unavailable, finds nothing in time, or proves
    the request infeasible — the heuristic profiles then explain what is stuck.
    Never raises."""
    try:
        from . import solver
    except Exception:
        return None
    if not solver.available():
        return None
    try:
        res = solver.solve(ds, locked, max_seconds=max_seconds)
    except Exception:
        return None
    if not res.feasible or not res.placements:
        return None
    locked_keys = {(p.course, p.section, p.kind, p.index) for p in locked}
    polished = _improve(ds, res.placements, locked_keys,
                        _weights({}), improve_seconds, rng)
    total, penalties = engine.score(ds, polished)
    violations = engine.validate(ds, polished)
    # Only surface it if it is genuinely clean; otherwise the heuristic wins.
    if violations:
        return None
    return GenOption("Optimized", polished, total, penalties, [], violations)


def generate_options(ds: Dataset, locked: list[Placement] | None = None,
                     max_nodes: int = 4000, seed: int = 7,
                     improve_seconds: float = 1.0,
                     profiles: dict[str, dict[str, int]] | None = None,
                     solver_seconds: float = 12.0,
                     ) -> list[GenOption]:
    """Best draft first. When OR-Tools is installed, an exact optimal draft is
    offered alongside the heuristic trade-off profiles (Balanced, Student-first,
    Faculty-first); otherwise just the profiles."""
    locked = locked or []
    locked_keys = {(p.course, p.section, p.kind, p.index) for p in locked}
    options: list[GenOption] = []

    solver_opt = _solver_option(ds, locked, solver_seconds, improve_seconds,
                                random.Random(seed))
    if solver_opt is not None:
        options.append(solver_opt)

    for i, (label, overrides) in enumerate((profiles or PROFILES).items()):
        rng = random.Random(seed + i * 101)  # nosec B311 — deterministic scheduling RNG, not used for crypto
        res = _generate_one(ds, locked, overrides, max_nodes, rng)
        polished = _improve(ds, res.placements, locked_keys,
                            _weights(overrides), improve_seconds, rng)
        # I scored every option with the default weights so the profiles
        # stay comparable, and I re-validated the finished draft because the
        # search only enforces pairwise rules. A pool rule could still slip.
        total, penalties = engine.score(ds, polished)
        violations = engine.validate(ds, polished)
        options.append(GenOption(label, polished, total,
                                 penalties, res.unplaced, violations))

    options.sort(key=lambda o: (len(o.unplaced), len(o.violations), o.score))
    seen: set[frozenset] = set()
    unique = []
    for o in options:
        sig = frozenset(
            (p.course, p.section, p.kind, p.index, p.day, p.start, p.room, p.faculty)
            for p in o.placements
        )
        if sig in seen:
            continue
        seen.add(sig)
        unique.append(o)
    return unique


def generate(ds: Dataset, max_nodes: int = 5000) -> list[Placement]:
    """Single best complete draft (backwards-compatible entry point)."""
    options = generate_options(ds, max_nodes=max_nodes)
    complete = [o for o in options if not o.unplaced and not o.violations]
    if not complete:
        stuck = options[0].unplaced if options else []
        detail = "; ".join(
            f"{u.course} sec{u.section} {u.kind}: {u.reason}" for u in stuck[:3]
        )
        raise RuntimeError(
            "Could not place every meeting within the search budget. "
            + (f"Stuck: {detail}" if detail else "")
        )
    return complete[0].placements
