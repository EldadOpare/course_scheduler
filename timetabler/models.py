"""Core data model. A timetable is just data; the engine judges it."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
WEEKEND = ["Sat", "Sun"]

DURATIONS = {"lecture": 90, "discussion": 60, "lab": 180}


def parse_time(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


@dataclass(frozen=True)
class Window:
    day: str
    start: int
    end: int

    def contains(self, day: str, start: int, end: int) -> bool:
        return day == self.day and self.start <= start and end <= self.end


@dataclass
class Rules:
    min_break: int = 15
    max_gap: int = 180
    lunch_start: int = 11 * 60 + 30
    lunch_end: int = 13 * 60 + 30
    lunch_min: int = 30


@dataclass
class Timegrid:
    weekdays: list[str] = field(default_factory=lambda: list(WEEKDAYS))
    weekend: list[str] = field(default_factory=lambda: list(WEEKEND))
    day_start: int = 8 * 60
    day_end: int = 16 * 60 + 30
    lecture_starts: list[int] = field(
        default_factory=lambda: [480, 585, 690, 795, 900])
    discussion_starts: list[int] = field(
        default_factory=lambda: [480, 585, 690, 795, 900])
    lab_starts: list[int] = field(default_factory=lambda: [480, 690, 795])
    weekend_starts: list[int] = field(default_factory=lambda: [510, 720])

    def starts_for(self, kind: str) -> list[int]:
        return {
            "lecture": self.lecture_starts,
            "discussion": self.discussion_starts,
            "lab": self.lab_starts,
        }.get(kind, self.lecture_starts)


@dataclass
class Room:
    id: str
    name: str
    type: str
    capacity: int
    equipment: list[str] = field(default_factory=list)
    restricted_to: list[str] = field(default_factory=list)
    building: str = ""


@dataclass
class Faculty:
    id: str
    name: str
    type: str
    load_target: float = 4.0
    max_overload: float = 1.5
    max_hours_per_day: float = 6.0
    availability: list[Window] = field(default_factory=list)
    preferred_times: list[Window] = field(default_factory=list)
    approved_courses: list[str] = field(default_factory=list)
    back_to_back_tolerance: int = 2


@dataclass
class Course:
    code: str
    title: str
    type: str
    program: str = "undergraduate"
    level: int = 1
    majors: list[str] = field(default_factory=list)
    prerequisites: list[str] = field(default_factory=list)
    credits: float = 1.0
    expected_enrollment: int = 30
    sections: int = 1
    sessions: dict[str, int] = field(default_factory=lambda: {"lecture": 2})
    requires_room_type: str = ""
    intake: str = "september"


@dataclass
class Major:
    id: str
    name: str
    counts: dict[int, int] = field(default_factory=dict)


@dataclass
class ElectivePool:
    id: str
    label: str
    kind: str
    pick: int
    courses: list[str] = field(default_factory=list)


@dataclass
class CoursePlan:
    id: str
    major_id: str
    year: int
    semester: int
    mandatory: list[str] = field(default_factory=list)
    elective_pools: list[ElectivePool] = field(default_factory=list)


@dataclass(frozen=True)
class Cohort:
    intake: str
    level: int
    major: str

    def __str__(self) -> str:
        return f"{self.major} Y{self.level} ({self.intake})"


@dataclass
class Placement:
    course: str
    section: int
    kind: str
    index: int
    day: str
    start: int
    room: str
    faculty: str
    duration: int = 0

    @property
    def end(self) -> int:
        return self.start + (self.duration or DURATIONS.get(self.kind, 90))

    def overlaps(self, other: "Placement") -> bool:
        return (
            self.day == other.day
            and self.start < other.end
            and other.start < self.end
        )

    def label(self) -> str:
        return (
            f"{self.course} sec{self.section} {self.kind} "
            f"{self.day} {fmt_time(self.start)}-{fmt_time(self.end)}"
        )

    def key(self) -> tuple[str, int, str, int]:
        return (self.course, self.section, self.kind, self.index)


@dataclass
class Dataset:
    courses: dict[str, Course]
    faculty: dict[str, Faculty]
    rooms: dict[str, Room]
    majors: dict[str, Major] = field(default_factory=dict)
    course_plans: list[CoursePlan] = field(default_factory=list)
    semester: int = 1
    rules: Rules = field(default_factory=Rules)
    timegrid: Timegrid = field(default_factory=Timegrid)
    durations: dict[str, int] = field(default_factory=lambda: dict(DURATIONS))

    # I made course plans the source of truth when they exist, and kept the
    # old guess-from-course-fields path so older datasets still work.

    def _plans_now(self) -> list[CoursePlan]:
        return [p for p in self.course_plans if p.semester == self.semester]

    def plan_for(self, major: str, year: int) -> CoursePlan | None:
        for p in self._plans_now():
            if p.major_id == major and p.year == year:
                return p
        return None

    def cohorts(self) -> list[Cohort]:
        plans = self._plans_now()
        if plans:
            return sorted(
                {Cohort("september", p.year, p.major_id) for p in plans},
                key=lambda x: (x.intake, x.level, x.major),
            )
        majors = sorted({m for c in self.courses.values() for m in c.majors})
        out = set()
        for c in self.courses.values():
            if c.program != "undergraduate":
                continue
            for major in c.majors or majors:
                out.add(Cohort(c.intake, c.level, major))
        return sorted(out, key=lambda x: (x.intake, x.level, x.major))

    def required_for(self, course: Course, cohort: Cohort) -> bool:
        if course.program != "undergraduate":
            return False
        plan = self.plan_for(cohort.major, cohort.level)
        if plan is not None:
            return course.code in plan.mandatory
        if course.intake != cohort.intake or course.level != cohort.level:
            return False
        if course.type == "core":
            return not course.majors or cohort.major in course.majors
        if course.type == "major_core":
            return cohort.major in course.majors
        return False

    def enrollment(self, course: Course) -> int:
        # I derived enrollment from the major head-counts and plans so the
        # numbers follow Admissions automatically; the hand-typed figure is
        # only the fallback when no plans mention the course.
        if not self.majors or not self._plans_now():
            return course.expected_enrollment
        total = 0.0
        seen = False
        for plan in self._plans_now():
            count = self.majors.get(plan.major_id, Major("", "")).counts.get(plan.year, 0)
            if course.code in plan.mandatory:
                total += count
                seen = True
            else:
                for pool in plan.elective_pools:
                    if course.code in pool.courses and pool.courses:
                        total += count * pool.pick / len(pool.courses)
                        seen = True
        return math.ceil(total) if seen else course.expected_enrollment

    def section_enrollment(self, course: Course) -> int:
        return math.ceil(self.enrollment(course) / max(course.sections, 1))

    def duration_of(self, kind: str) -> int:
        return self.durations.get(kind, DURATIONS.get(kind, 90))

    def make_placement(self, course: str, section: int, kind: str, index: int,
                       day: str, start: int, room: str, faculty: str) -> Placement:
        return Placement(course, section, kind, index, day, start, room,
                         faculty, duration=self.duration_of(kind))


@dataclass
class Violation:
    code: str
    message: str


@dataclass
class Penalty:
    code: str
    weight: int
    message: str
