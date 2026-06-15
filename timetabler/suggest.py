"""V2: assisted scheduling. Ranks every legal (slot, room, faculty) option."""
from __future__ import annotations

from dataclasses import dataclass

from . import engine, timegrid
from .models import Dataset, Placement, fmt_time, UNASSIGNED_FACULTY


@dataclass
class Option:
    placement: Placement
    penalty: int
    percent: int

    def label(self, ds: Dataset) -> str:
        p = self.placement
        room = ds.rooms[p.room].name
        fac = ds.faculty[p.faculty].name
        return (
            f"{p.day} {fmt_time(p.start)}-{fmt_time(p.end)}, {room}, {fac} "
            f"— score {self.percent}% (penalty {self.penalty})"
        )


def candidate_faculty(ds: Dataset, placements: list[Placement],
                      course: str, section: int) -> list[str]:
    # I kept the teacher already attached to this section if there was one,
    # so moving a meeting never silently changes who teaches it.
    attached = {p.faculty for p in placements
                if p.course == course and p.section == section}
    if attached:
        return sorted(attached)
    approved = sorted(f.id for f in ds.faculty.values()
                      if course in f.approved_courses)
    # No lecturer approved yet → offer the slot against the placeholder so
    # the room/time can still be chosen and a lecturer assigned later.
    return approved or [UNASSIGNED_FACULTY]


def suggest(ds: Dataset, placements: list[Placement], course_code: str,
            section: int = 1, kind: str = "lecture", index: int = 0,
            top: int = 5) -> list[Option]:
    course = ds.courses[course_code]

    others = [
        p for p in placements
        if not (p.course == course_code and p.section == section
                and p.kind == kind and p.index == index)
    ]
    baseline = len(engine.validate(ds, others))
    need = ds.section_enrollment(course)

    options: list[Option] = []
    for fac_id in candidate_faculty(ds, others, course_code, section):
        for day, start in timegrid.approved_slots(kind, course.program, ds.timegrid):
            for room in ds.rooms.values():
                if room.capacity < need:
                    continue
                if kind == "lab" and course.requires_room_type \
                        and room.type != course.requires_room_type:
                    continue
                cand = ds.make_placement(course_code, section, kind, index,
                                         day, start, room.id, fac_id)
                if len(engine.validate(ds, others + [cand])) > baseline:
                    continue
                total, _ = engine.score(ds, others + [cand])
                options.append(Option(cand, total, 0))

    options.sort(key=lambda o: o.penalty)
    if options:
        best, worst = options[0].penalty, options[-1].penalty
        span = max(worst - best, 1)
        for o in options:
            o.percent = round(100 * (1 - (o.penalty - best) / span)) \
                if worst > best else 100
    return options[:top]
