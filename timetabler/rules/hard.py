"""Hard rules. Any violation means the timetable is invalid."""
from __future__ import annotations

from itertools import combinations

from ..models import Dataset, Placement, Violation, fmt_time
from .. import timegrid


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


def cohort_clashes(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    # I checked courses pairwise instead of all together because the full
    # check is a hard cover problem, and pairwise already catches what a
    # registrar would actually run into. Sections give students choices,
    # so two courses only clash when no pair of their sections fits.
    out = []
    idx = _SectionIndex(placements)
    for cohort in ds.cohorts():
        required = [c for c in ds.courses.values() if ds.required_for(c, cohort)]
        for a, b in combinations(required, 2):
            if not idx.pair_ok(a.code, b.code):
                out.append(Violation(
                    "H-STU-1",
                    f"{cohort}: no clash-free section combination for "
                    f"{a.code} and {b.code}",
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
