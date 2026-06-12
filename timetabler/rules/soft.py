"""Soft rules. Each emits weighted penalties; lower total = better timetable."""
from __future__ import annotations

from ..models import Dataset, Placement, Penalty, fmt_time

WEIGHTS = {
    "S-FAC-1": 5,   # outside preferred teaching times
    "S-FAC-2": 8,   # 3+ back-to-back classes in a day
    "S-FAC-3": 5,   # adjunct scattered across many days
    "S-FAC-4": 3,   # full-time faculty under agreed load
    "S-FAC-5": 6,   # load above 5.5 sections
    "S-FAC-6": 4,   # one section taught by several instructors
    "S-STU-1": 4,   # cohort idle gap over the configured maximum
    "S-STU-2": 6,   # cohort has 4+ classes in one day
    "S-STU-3": 4,   # cohort has an 08:00 class every teaching day
    "S-STU-4": 3,   # cohort changes building back-to-back
    "S-STU-5": 5,   # cohort left with no lunch window
    "S-CRS-1": 6,   # same section meets twice the same day (should spread out)
    "S-ROOM-1": 2,  # room grossly oversized (capacity > 2x enrollment)
    "S-ROOM-2": 10, # engineering space used by non-engineering course
    "S-ROOM-3": 2,  # section hops rooms between meetings of the same kind
}

ENGINEERING_SPACES = {"engineering_lab", "workshop", "fab_lab"}


def score_all(ds: Dataset, placements: list[Placement],
              weights: dict[str, int] | None = None) -> list[Penalty]:
    w = dict(WEIGHTS)
    if weights:
        w.update(weights)

    def pen(code: str, message: str) -> Penalty:
        return Penalty(code, w[code], message)

    out: list[Penalty] = []
    for rule in (
        faculty_preferences,
        faculty_back_to_back,
        adjunct_scatter,
        faculty_load_balance,
        section_teacher_consistency,
        cohort_gaps_and_density,
        cohort_lunch,
        same_day_repeat,
        room_fit,
        room_stability,
        engineering_space_use,
    ):
        out.extend(rule(ds, placements, pen))
    return out


def faculty_preferences(ds, placements, pen) -> list[Penalty]:
    out = []
    for p in placements:
        fac = ds.faculty.get(p.faculty)
        if fac and fac.preferred_times:
            if not any(w.contains(p.day, p.start, p.end) for w in fac.preferred_times):
                out.append(pen("S-FAC-1", f"{fac.name}: scheduled outside preferred hours ({p.label()})"))
    return out


def _by_faculty_day(placements: list[Placement]) -> dict[tuple[str, str], list[Placement]]:
    out: dict[tuple[str, str], list[Placement]] = {}
    for p in placements:
        out.setdefault((p.faculty, p.day), []).append(p)
    return out


def faculty_back_to_back(ds, placements, pen) -> list[Penalty]:
    out = []
    gap = ds.rules.min_break
    for (fac_id, day), plist in _by_faculty_day(placements).items():
        fac = ds.faculty.get(fac_id)
        if not fac:
            continue
        plist.sort(key=lambda p: p.start)
        run = 1
        longest = 1
        for prev, cur in zip(plist, plist[1:]):
            run = run + 1 if cur.start - prev.end <= gap else 1
            longest = max(longest, run)
        if longest >= 3:
            out.append(pen(
                "S-FAC-2",
                f"{fac.name}: {longest} back-to-back classes on {day}",
            ))
    return out


def adjunct_scatter(ds, placements, pen) -> list[Penalty]:
    out = []
    days: dict[str, set[str]] = {}
    for p in placements:
        days.setdefault(p.faculty, set()).add(p.day)
    for fac_id, dayset in days.items():
        fac = ds.faculty.get(fac_id)
        if fac and fac.type == "adjunct" and len(dayset) >= 3:
            out.append(pen(
                "S-FAC-3",
                f"{fac.name} (adjunct) spread across {len(dayset)} days",
            ))
    return out


def faculty_load_balance(ds, placements, pen) -> list[Penalty]:
    out = []
    sections: dict[str, set[tuple[str, int]]] = {}
    for p in placements:
        sections.setdefault(p.faculty, set()).add((p.course, p.section))
    for fac in ds.faculty.values():
        n = len(sections.get(fac.id, set()))
        if fac.type == "full_time" and 0 < n < fac.load_target:
            out.append(pen(
                "S-FAC-4",
                f"{fac.name} under agreed load ({n} of {fac.load_target:g} sections)",
            ))
        if n > 5.5:
            out.append(pen("S-FAC-5", f"{fac.name} overloaded ({n} sections)"))
    return out


def section_teacher_consistency(ds, placements, pen) -> list[Penalty]:
    # I made this a soft rule, not a hard one, because labs run by a
    # different instructor are normal. It should nag, not block.
    out = []
    teachers: dict[tuple[str, int], set[str]] = {}
    for p in placements:
        teachers.setdefault((p.course, p.section), set()).add(p.faculty)
    for (course, section), facs in teachers.items():
        if len(facs) > 1:
            names = ", ".join(
                ds.faculty[f].name if f in ds.faculty else f for f in sorted(facs)
            )
            out.append(pen(
                "S-FAC-6",
                f"{course} sec{section} split between instructors: {names}",
            ))
    return out


def _cohort_days(ds: Dataset, placements: list[Placement], cohort) -> dict[str, list[Placement]]:
    by_day: dict[str, list[Placement]] = {}
    for p in placements:
        course = ds.courses.get(p.course)
        if course and ds.required_for(course, cohort):
            by_day.setdefault(p.day, []).append(p)
    return by_day


def cohort_gaps_and_density(ds, placements, pen) -> list[Penalty]:
    out = []
    min_break, max_gap = ds.rules.min_break, ds.rules.max_gap
    for cohort in ds.cohorts():
        by_day = _cohort_days(ds, placements, cohort)
        eight_am_days = 0
        for day, plist in by_day.items():
            plist.sort(key=lambda p: p.start)
            if len(plist) >= 4:
                out.append(pen("S-STU-2", f"{cohort}: {len(plist)} classes on {day}"))
            if plist[0].start <= 8 * 60:
                eight_am_days += 1
            for prev, cur in zip(plist, plist[1:]):
                gap = cur.start - prev.end
                if gap > max_gap:
                    out.append(pen(
                        "S-STU-1",
                        f"{cohort}: {gap // 60}h{gap % 60:02d} idle gap on {day}",
                    ))
                room_a, room_b = ds.rooms.get(prev.room), ds.rooms.get(cur.room)
                if (
                    gap <= min_break
                    and room_a and room_b
                    and room_a.building and room_b.building
                    and room_a.building != room_b.building
                ):
                    out.append(pen(
                        "S-STU-4",
                        f"{cohort}: back-to-back building change on {day} "
                        f"({room_a.building} → {room_b.building})",
                    ))
        if by_day and eight_am_days == len(by_day) and len(by_day) >= 3:
            out.append(pen(
                "S-STU-3",
                f"{cohort}: 08:00 class on all {eight_am_days} teaching days",
            ))
    return out


def cohort_lunch(ds, placements, pen) -> list[Penalty]:

    out = []
    r = ds.rules
    for cohort in ds.cohorts():
        for day, plist in _cohort_days(ds, placements, cohort).items():
            busy = sorted(
                (max(p.start, r.lunch_start), min(p.end, r.lunch_end))
                for p in plist if p.start < r.lunch_end and p.end > r.lunch_start
            )
            free, cursor = 0, r.lunch_start
            for s, e in busy:
                free = max(free, s - cursor)
                cursor = max(cursor, e)
            free = max(free, r.lunch_end - cursor)
            if free < r.lunch_min:
                out.append(pen(
                    "S-STU-5",
                    f"{cohort}: no lunch break on {day} "
                    f"({fmt_time(r.lunch_start)}–{fmt_time(r.lunch_end)} fully booked)",
                ))
    return out


def same_day_repeat(ds, placements, pen) -> list[Penalty]:

    out = []
    seen: dict[tuple[str, int, str, str], int] = {}
    for p in placements:
        key = (p.course, p.section, p.kind, p.day)
        seen[key] = seen.get(key, 0) + 1
    for (course, section, kind, day), n in seen.items():
        if n > 1:
            out.append(pen(
                "S-CRS-1",
                f"{course} sec{section}: {n} {kind}s on {day}. Ideally spread across different days.",
            ))
    return out


def room_fit(ds, placements, pen) -> list[Penalty]:
    out = []
    for p in placements:
        room, course = ds.rooms.get(p.room), ds.courses.get(p.course)
        if room and course and room.capacity > 2 * ds.section_enrollment(course):
            out.append(pen(
                "S-ROOM-1",
                f"{room.name} ({room.capacity} seats) oversized for {p.course} "
                f"sec{p.section} ({ds.section_enrollment(course)} students)",
            ))
    return out


def room_stability(ds, placements, pen) -> list[Penalty]:

    out = []
    rooms: dict[tuple[str, int, str], set[str]] = {}
    for p in placements:
        rooms.setdefault((p.course, p.section, p.kind), set()).add(p.room)
    for (course, section, kind), used in rooms.items():
        if len(used) > 1:
            out.append(pen(
                "S-ROOM-3",
                f"{course} sec{section} {kind}s move between rooms "
                f"({', '.join(sorted(used))})",
            ))
    return out


def engineering_space_use(ds, placements, pen) -> list[Penalty]:
    out = []
    for p in placements:
        room, course = ds.rooms.get(p.room), ds.courses.get(p.course)
        if (
            room and course
            and room.type in ENGINEERING_SPACES
            and course.requires_room_type not in ENGINEERING_SPACES
        ):
            out.append(pen(
                "S-ROOM-2",
                f"Engineering space {room.name} used by {p.course}",
            ))
    return out
