"""Dataset construction from plain dicts (API bodies) or JSON files (tests/CLI)."""
from __future__ import annotations

import json
from dataclasses import fields as dc_fields
from pathlib import Path

from .models import (
    Course, CoursePlan, Dataset, ElectivePool, Faculty, Major, Placement,
    Room, Rules, Timegrid, Window, parse_time,
)


def _pick(cls, d: dict) -> dict:
    """Keep only the dataclass's own fields. Ignores extras (DB columns like
    created_at, or anything else a client tacks on)."""
    allowed = {f.name for f in dc_fields(cls)}
    return {k: v for k, v in d.items() if k in allowed}


def _window(d: dict) -> Window:
    return Window(d["day"], parse_time(d["start"]), parse_time(d["end"]))


def _minutes(v, default: int) -> int:
    """Accept minutes-since-midnight ints or 'HH:MM' strings."""
    if v is None:
        return default
    if isinstance(v, str):
        return parse_time(v)
    return int(v)


def _rules(d: dict | None) -> Rules:
    base = Rules()
    if not d:
        return base
    return Rules(
        min_break=int(d.get("min_break", base.min_break)),
        max_gap=int(d.get("max_gap", base.max_gap)),
        lunch_start=_minutes(d.get("lunch_start"), base.lunch_start),
        lunch_end=_minutes(d.get("lunch_end"), base.lunch_end),
        lunch_min=int(d.get("lunch_min", base.lunch_min)),
    )


def _timegrid(d: dict | None) -> Timegrid:
    base = Timegrid()
    if not d:
        return base
    return Timegrid(
        weekdays=list(d.get("weekdays") or base.weekdays),
        weekend=list(d.get("weekend") or base.weekend),
        day_start=_minutes(d.get("day_start"), base.day_start),
        day_end=_minutes(d.get("day_end"), base.day_end),
        lecture_starts=[_minutes(v, 0) for v in d.get("lecture_starts") or base.lecture_starts],
        discussion_starts=[_minutes(v, 0) for v in d.get("discussion_starts") or base.discussion_starts],
        lab_starts=[_minutes(v, 0) for v in d.get("lab_starts") or base.lab_starts],
        weekend_starts=[_minutes(v, 0) for v in d.get("weekend_starts") or base.weekend_starts],
    )


def _major(d: dict) -> Major:
    return Major(
        id=d["id"], name=d["name"],
        counts={int(k): int(v) for k, v in (d.get("counts") or {}).items()},
    )


def _course_plan(d: dict) -> CoursePlan:
    return CoursePlan(
        id=d["id"], major_id=d["major_id"], year=int(d["year"]),
        semester=int(d["semester"]),
        mandatory=list(d.get("mandatory") or []),
        elective_pools=[
            ElectivePool(
                id=p.get("id", ""), label=p.get("label", ""),
                kind=p.get("kind", "major"), pick=int(p.get("pick", 1)),
                courses=list(p.get("courses") or []),
            )
            for p in (d.get("elective_pools") or [])
        ],
    )


def load_dataset_from_dicts(
    courses_list: list[dict],
    faculty_list: list[dict],
    rooms_list: list[dict],
    majors_list: list[dict] | None = None,
    course_plans_list: list[dict] | None = None,
    rules: dict | None = None,
    timegrid: dict | None = None,
    durations: dict | None = None,
    semester: int = 1,
) -> Dataset:
    """Build a Dataset from plain dicts (sent inline by the React frontend)."""
    courses = {}
    for d in courses_list:
        courses[d["code"]] = Course(**_pick(Course, d))

    faculty = {}
    for d in faculty_list:
        d = _pick(Faculty, d)
        d["availability"] = [_window(w) for w in d.get("availability") or []]
        d["preferred_times"] = [_window(w) for w in d.get("preferred_times") or []]
        faculty[d["id"]] = Faculty(**d)

    rooms = {}
    for d in rooms_list:
        d = _pick(Room, d)
        d["restricted_to"] = d.get("restricted_to") or []
        rooms[d["id"]] = Room(**d)

    ds = Dataset(courses=courses, faculty=faculty, rooms=rooms,
                 semester=int(semester), rules=_rules(rules),
                 timegrid=_timegrid(timegrid))
    if majors_list:
        ds.majors = {m["id"]: _major(m) for m in majors_list}
    if course_plans_list:
        ds.course_plans = [_course_plan(p) for p in course_plans_list]
    if durations:
        ds.durations.update({k: int(v) for k, v in durations.items()})
    return ds


def load_dataset(data_dir: str | Path) -> Dataset:
    data_dir = Path(data_dir)

    courses = {}
    for d in json.loads((data_dir / "courses.json").read_text()):
        courses[d["code"]] = Course(**_pick(Course, d))

    faculty = {}
    for d in json.loads((data_dir / "faculty.json").read_text()):
        d = _pick(Faculty, d)
        d["availability"] = [_window(w) for w in d.get("availability", [])]
        d["preferred_times"] = [_window(w) for w in d.get("preferred_times", [])]
        faculty[d["id"]] = Faculty(**d)

    rooms = {}
    for d in json.loads((data_dir / "rooms.json").read_text()):
        rooms[d["id"]] = Room(**_pick(Room, d))

    return Dataset(courses=courses, faculty=faculty, rooms=rooms)


def load_timetable(data_dir: str | Path) -> list[Placement]:
    path = Path(data_dir) / "timetable.json"
    if not path.exists():
        return []
    return [
        Placement(
            course=d["course"], section=d["section"], kind=d["kind"],
            index=d.get("index", 0), day=d["day"], start=parse_time(d["start"]),
            room=d["room"], faculty=d["faculty"],
        )
        for d in json.loads(path.read_text())
    ]


def save_timetable(data_dir: str | Path, placements: list[Placement]) -> Path:
    from .models import fmt_time

    path = Path(data_dir) / "timetable.json"
    path.write_text(json.dumps([
        {
            "course": p.course, "section": p.section, "kind": p.kind,
            "index": p.index, "day": p.day, "start": fmt_time(p.start),
            "room": p.room, "faculty": p.faculty,
        }
        for p in placements
    ], indent=2) + "\n")
    return path
