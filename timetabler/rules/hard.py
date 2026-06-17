"""Hard rules. Any violation means the timetable is invalid."""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

from ..models import Dataset, Placement, Violation, fmt_time, is_unassigned
from .. import timegrid


def _sections_all_fit(section_lists: list[list[list[Placement]]],
                      max_nodes: int = 50_000) -> bool:
    """Can one section be chosen from each course so the chosen sections never
    overlap? `section_lists` is one entry per course, each a list of that
    course's sections, each section a list of meeting placements. Returns True
    on an empty problem or if the node budget is exceeded (never a false clash)."""
    lists = sorted((s for s in section_lists if s), key=len)
    chosen: list[list[Placement]] = []
    nodes = 0

    def clashes(meetings: list[Placement]) -> bool:
        return any(
            x.overlaps(y)
            for picked in chosen for x in picked for y in meetings
        )

    def search(i: int) -> bool:
        nonlocal nodes
        if i == len(lists):
            return True
        nodes += 1
        if nodes > max_nodes:
            return True
        for section_meetings in lists[i]:
            if not clashes(section_meetings):
                chosen.append(section_meetings)
                if search(i + 1):
                    return True
                chosen.pop()
        return False

    return search(0)


def check_all(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out: list[Violation] = []
    for check in (
        duplicate_meetings,
        cohort_clashes,
        elective_pool_feasibility,
        ug_time_bounds,
        faculty_clashes,
        adjunct_availability,
        faculty_approval,
        faculty_overload,
        faculty_max_hours,
        room_exists,
        room_clashes,
        room_capacity,
        room_type,
        room_restrictions,
        approved_slot,
    ):
        out.extend(check(ds, placements))
    return out


def check_catalog(ds: Dataset) -> list[Violation]:
    out = []
    for course in ds.courses.values():
        for pre in course.prerequisites:
            other = ds.courses.get(pre)
            if not other:
                continue
            for cohort in ds.cohorts():
                if ds.required_for(course, cohort) and ds.required_for(other, cohort):
                    out.append(Violation(
                        "H-PREREQ",
                        f"{course.code} and its prerequisite {pre} are both "
                        f"required of {cohort} this semester",
                    ))
    return out


def duplicate_meetings(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    seen: set[tuple] = set()
    for p in placements:
        if p.key() in seen:
            out.append(Violation(
                "H-DUP",
                f"{p.course} sec{p.section} {p.kind} #{p.index} is placed "
                f"more than once",
            ))
        seen.add(p.key())
    return out


class _SectionIndex:
    # I cached the placements grouped by course and section here so the
    # student rules below could ask "does any pair of sections work?"
    # many times without re-scanning the whole timetable each time.

    def __init__(self, placements: list[Placement]):
        self.by_course: dict[str, dict[int, list[Placement]]] = {}
        for p in placements:
            self.by_course.setdefault(p.course, {}).setdefault(p.section, []).append(p)
        self._pair_cache: dict[tuple[str, str], bool] = {}

    def pair_ok(self, course_a: str, course_b: str) -> bool:
        key = (course_a, course_b) if course_a < course_b else (course_b, course_a)
        cached = self._pair_cache.get(key)
        if cached is not None:
            return cached
        secs_a = self.by_course.get(course_a)
        secs_b = self.by_course.get(course_b)
        ok = True
        if secs_a and secs_b:
            ok = any(
                not any(x.overlaps(y) for x in ma for y in mb)
                for ma in secs_a.values() for mb in secs_b.values()
            )
        self._pair_cache[key] = ok
        return ok

    def all_fit(self, course_codes: list[str], max_nodes: int = 50_000) -> bool:
        """Exact feasibility: can a student pick one section of each course so
        that none of the chosen sections overlap? Pairwise checks miss the case
        where every pair fits but no single combination of all of them does
        (a three-or-more-way clash). This backtracks over the actual sections.

        Only the courses that have placements are considered. If the search
        exceeds the node budget it returns True (never invents a violation)."""
        # Each course contributes a list of its sections; a section is the
        # list of its meeting placements. Skip unplaced courses.
        sections = [
            list(self.by_course[c].values())
            for c in course_codes if c in self.by_course
        ]
        return _sections_all_fit(sections, max_nodes)


@dataclass
class OthersContext:
    """Pre-computed view of a fixed set of placements, so a stream of trial
    candidates can each be checked in roughly the time it takes to scan the
    placements they actually touch — instead of re-validating the whole
    timetable per candidate (the old O(candidates * n^2) hot path in suggest)."""
    by_room: dict[str, list[Placement]] = field(default_factory=dict)
    by_faculty: dict[str, list[Placement]] = field(default_factory=dict)
    fac_minutes: dict[tuple[str, str], int] = field(default_factory=dict)
    fac_sections: dict[str, set[tuple[str, int]]] = field(default_factory=dict)
    idx: _SectionIndex = field(default_factory=lambda: _SectionIndex([]))
    # cohort label -> required course codes that currently have placements
    cohort_required: list[tuple[str, list[str]]] = field(default_factory=list)
    keys: set[tuple[str, int, str, int]] = field(default_factory=set)


def build_context(ds: Dataset, others: list[Placement]) -> OthersContext:
    ctx = OthersContext(idx=_SectionIndex(others))
    for p in others:
        ctx.keys.add(p.key())
        ctx.by_room.setdefault(p.room, []).append(p)
        if not is_unassigned(p.faculty):
            ctx.by_faculty.setdefault(p.faculty, []).append(p)
            ctx.fac_minutes[(p.faculty, p.day)] = \
                ctx.fac_minutes.get((p.faculty, p.day), 0) + (p.end - p.start)
            ctx.fac_sections.setdefault(p.faculty, set()).add((p.course, p.section))
    for cohort in ds.cohorts():
        required = [c.code for c in ds.courses.values()
                    if ds.required_for(c, cohort)]
        ctx.cohort_required.append((str(cohort), required))
    return ctx


def candidate_adds_violation(ds: Dataset, ctx: OthersContext,
                             cand: Placement) -> bool:
    """True if adding `cand` to the context's placements would introduce a new
    hard violation. Mirrors the rules in check_all but only re-examines the
    parts a single new meeting can affect, so it is cheap to call in a loop.

    Note: elective-pool feasibility (H-STU-3) is a whole-cohort property that a
    single candidate rarely changes, so it is left to the full validation the
    UI runs after placement; everything else is checked exactly here."""
    course = ds.courses.get(cand.course)
    if course is None:
        return True

    # Placing the same meeting twice is a duplicate.
    if cand.key() in ctx.keys:
        return True

    # Room: existence, double-booking, capacity, type, restrictions.
    room = ds.rooms.get(cand.room)
    if room is None:
        return True
    if any(p.overlaps(cand) for p in ctx.by_room.get(cand.room, ())):
        return True
    if room.capacity < ds.section_enrollment(course):
        return True
    if cand.kind == "lab" and course.requires_room_type \
            and room.type != course.requires_room_type:
        return True
    if room.restricted_to and course.program not in room.restricted_to:
        return True

    # Time: must be an approved slot inside the teaching day.
    if not timegrid.is_approved(cand.kind, course.program, cand.day, cand.start,
                                ds.timegrid, ds.duration_of(cand.kind)):
        return True

    # Faculty (the placeholder carries no limits and never clashes with itself).
    if not is_unassigned(cand.faculty):
        fac = ds.faculty.get(cand.faculty)
        if fac is None or cand.course not in fac.approved_courses:
            return True
        if fac.type == "adjunct" and not any(
            w.contains(cand.day, cand.start, cand.end) for w in fac.availability
        ):
            return True
        if ctx.fac_minutes.get((cand.faculty, cand.day), 0) + (cand.end - cand.start) \
                > fac.max_hours_per_day * 60:
            return True
        secs = ctx.fac_sections.get(cand.faculty, set())
        if (cand.course, cand.section) not in secs \
                and len(secs) + 1 > fac.load_target + fac.max_overload:
            return True
        if any(p.overlaps(cand) for p in ctx.by_faculty.get(cand.faculty, ())):
            return True

    # Cohort clashes: a new meeting can only break pairs (and the all-courses
    # fit) for cohorts that actually require this course, so only those.
    cand_secs = {s: list(m) for s, m in ctx.idx.by_course.get(cand.course, {}).items()}
    cand_secs.setdefault(cand.section, []).append(cand)
    for _cohort, required in ctx.cohort_required:
        if cand.course not in required:
            continue
        for other in required:
            if other == cand.course:
                continue
            b_secs = ctx.idx.by_course.get(other)
            if not b_secs:
                continue
            fits = any(
                not any(x.overlaps(y) for x in ma for y in mb)
                for ma in cand_secs.values() for mb in b_secs.values()
            )
            if not fits:
                return True
        # Exact all-courses fit, only worth it when a required course is split.
        if any(len(ctx.idx.by_course.get(c, ())) > 1 for c in required):
            section_lists = []
            for c in required:
                if c == cand.course:
                    section_lists.append(list(cand_secs.values()))
                elif c in ctx.idx.by_course:
                    section_lists.append(list(ctx.idx.by_course[c].values()))
            if not _sections_all_fit(section_lists):
                return True

    return False


def cohort_clashes(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    # I checked courses pairwise instead of all together because the full
    # check is a hard cover problem, and pairwise already catches what a
    # registrar would actually run into. Sections give students choices,
    # so two courses only clash when no pair of their sections fits.
    out = []
    idx = _SectionIndex(placements)
    for cohort in ds.cohorts():
        required = [c for c in ds.courses.values() if ds.required_for(c, cohort)]
        pair_failed = False
        for a, b in combinations(required, 2):
            if not idx.pair_ok(a.code, b.code):
                out.append(Violation(
                    "H-STU-1",
                    f"{cohort}: no clash-free section combination for "
                    f"{a.code} and {b.code}",
                ))
                pair_failed = True
        # When every pair fits, an exact all-courses check still catches a
        # three-or-more-way clash (each pair OK, no single combination of all).
        # It only differs from the pairwise scan when a required course runs
        # more than one section, so skip the cost otherwise.
        if not pair_failed and any(
            len(idx.by_course.get(c.code, ())) > 1 for c in required
        ):
            if not idx.all_fit([c.code for c in required]):
                out.append(Violation(
                    "H-STU-1",
                    f"{cohort}: no clash-free way to assign sections across all "
                    f"required courses at once (a three-or-more-way clash)",
                ))
    return out


def elective_pool_feasibility(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    idx = _SectionIndex(placements)
    for cohort in ds.cohorts():
        plan = ds.plan_for(cohort.major, cohort.level)
        if plan is None:
            continue
        mandatory = [m for m in plan.mandatory if m in ds.courses]
        for pool in plan.elective_pools:
            in_catalog = [c for c in pool.courses if c in ds.courses]
            if len(in_catalog) < pool.pick:
                out.append(Violation(
                    "H-STU-3",
                    f"{cohort}: pool '{pool.label}' lists {len(in_catalog)} "
                    f"course(s) in the catalogue but asks students to pick {pool.pick}",
                ))
                continue
            takeable = [c for c in in_catalog
                        if all(idx.pair_ok(c, m) for m in mandatory)]
            if len(takeable) < pool.pick:
                out.append(Violation(
                    "H-STU-3",
                    f"{cohort}: only {len(takeable)} course(s) in pool "
                    f"'{pool.label}' fit around the mandatory timetable "
                    f"(students must pick {pool.pick})",
                ))
                continue
            feasible = any(
                all(idx.pair_ok(x, y) for x, y in combinations(combo, 2))
                for combo in combinations(takeable, pool.pick)
            )
            if not feasible:
                out.append(Violation(
                    "H-STU-3",
                    f"{cohort}: no clash-free way to pick {pool.pick} "
                    f"courses from pool '{pool.label}'",
                ))
    return out


def ug_time_bounds(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    grid = ds.timegrid
    for p in placements:
        course = ds.courses.get(p.course)
        if not course or course.program != "undergraduate":
            continue
        if p.day in grid.weekend:
            out.append(Violation("H-STU-2", f"UG class on weekend: {p.label()}"))
        elif p.start < grid.day_start or p.end > grid.day_end:
            out.append(Violation(
                "H-STU-2",
                f"UG class outside {fmt_time(grid.day_start)}-"
                f"{fmt_time(grid.day_end)}: {p.label()}",
            ))
    return out


def faculty_clashes(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    by_fac: dict[str, list[Placement]] = {}
    for p in placements:
        if is_unassigned(p.faculty):
            continue  # placeholder isn't a real person; can't double-book
        by_fac.setdefault(p.faculty, []).append(p)
    for fac_id, plist in by_fac.items():
        name = ds.faculty[fac_id].name if fac_id in ds.faculty else fac_id
        for a, b in combinations(plist, 2):
            if a.overlaps(b):
                out.append(Violation(
                    "H-FAC-1",
                    f"{name} double-booked: {a.label()} vs {b.label()}",
                ))
    return out


def adjunct_availability(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        fac = ds.faculty.get(p.faculty)
        if not fac or fac.type != "adjunct":
            continue
        if not any(w.contains(p.day, p.start, p.end) for w in fac.availability):
            out.append(Violation(
                "H-FAC-2",
                f"{fac.name} (adjunct) scheduled outside availability: {p.label()}",
            ))
    return out


def faculty_approval(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        if is_unassigned(p.faculty):
            continue  # a lecturer hasn't been assigned yet — allowed
        fac = ds.faculty.get(p.faculty)
        if fac is None:
            out.append(Violation("H-FAC-3", f"Unknown faculty '{p.faculty}': {p.label()}"))
        elif p.course not in fac.approved_courses:
            out.append(Violation(
                "H-FAC-3",
                f"{fac.name} is not approved to teach {p.course}",
            ))
    return out


def faculty_overload(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    sections: dict[str, set[tuple[str, int]]] = {}
    for p in placements:
        sections.setdefault(p.faculty, set()).add((p.course, p.section))
    for fac_id, secs in sections.items():
        fac = ds.faculty.get(fac_id)
        if fac and len(secs) > fac.load_target + fac.max_overload:
            out.append(Violation(
                "H-FAC-4",
                f"{fac.name} teaches {len(secs)} sections, above approved limit "
                f"{fac.load_target + fac.max_overload:g}",
            ))
    return out


def faculty_max_hours(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    minutes: dict[tuple[str, str], int] = {}
    for p in placements:
        key = (p.faculty, p.day)
        minutes[key] = minutes.get(key, 0) + (p.end - p.start)
    for (fac_id, day), mins in minutes.items():
        fac = ds.faculty.get(fac_id)
        if fac and mins > fac.max_hours_per_day * 60:
            out.append(Violation(
                "H-FAC-5",
                f"{fac.name} teaches {mins / 60:g}h on {day}, above daily "
                f"max of {fac.max_hours_per_day:g}h",
            ))
    return out


def room_exists(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        if p.room not in ds.rooms:
            out.append(Violation(
                "H-ROOM-0", f"Unknown room '{p.room}': {p.label()}",
            ))
    return out


def room_clashes(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    by_room: dict[str, list[Placement]] = {}
    for p in placements:
        by_room.setdefault(p.room, []).append(p)
    for room_id, plist in by_room.items():
        for a, b in combinations(plist, 2):
            if a.overlaps(b):
                out.append(Violation(
                    "H-ROOM-1",
                    f"Room {room_id} double-booked: {a.label()} vs {b.label()}",
                ))
    return out


def room_capacity(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        room, course = ds.rooms.get(p.room), ds.courses.get(p.course)
        if not room or not course:
            continue
        per_section = ds.section_enrollment(course)
        if room.capacity < per_section:
            out.append(Violation(
                "H-ROOM-2",
                f"{room.name} seats {room.capacity} but {p.course} sec{p.section} "
                f"expects {per_section}: {p.label()}",
            ))
    return out


def room_type(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        room, course = ds.rooms.get(p.room), ds.courses.get(p.course)
        if not room or not course:
            continue
        if p.kind == "lab" and course.requires_room_type:
            if room.type != course.requires_room_type:
                out.append(Violation(
                    "H-ROOM-3",
                    f"{p.course} lab needs a {course.requires_room_type} but "
                    f"{room.name} is a {room.type}: {p.label()}",
                ))
    return out


def room_restrictions(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        room, course = ds.rooms.get(p.room), ds.courses.get(p.course)
        if room and course and room.restricted_to:
            if course.program not in room.restricted_to:
                out.append(Violation(
                    "H-ROOM-4",
                    f"{room.name} is restricted to {', '.join(room.restricted_to)}: "
                    f"{p.label()}",
                ))
    return out


def approved_slot(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    out = []
    for p in placements:
        course = ds.courses.get(p.course)
        if course is None:
            out.append(Violation("H-TIME-1", f"Unknown course '{p.course}'"))
            continue
        if not timegrid.is_approved(p.kind, course.program, p.day, p.start,
                                    ds.timegrid, ds.duration_of(p.kind)):
            out.append(Violation(
                "H-TIME-1",
                f"Not an approved {p.kind} slot for {course.program}: "
                f"{p.day} {fmt_time(p.start)} ({p.label()})",
            ))
    return out
