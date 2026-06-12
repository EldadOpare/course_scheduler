"""One test per rule family, plus end-to-end checks on the sample dataset."""
import unittest
from pathlib import Path

from timetabler import engine, generate, loader, suggest
from timetabler.models import (
    Course, Dataset, Faculty, Placement, Room, Window, parse_time,
)

DATA = Path(__file__).resolve().parent / "fixtures"


def tiny_dataset() -> Dataset:
    courses = {
        "CORE1": Course(code="CORE1", title="Core One", type="core", level=1,
                        expected_enrollment=30),
        "CORE2": Course(code="CORE2", title="Core Two", type="core", level=1,
                        expected_enrollment=30),
        "LAB1": Course(code="LAB1", title="Lab Course", type="major_core", level=2,
                       majors=["CS"], expected_enrollment=20,
                       sessions={"lab": 1}, requires_room_type="computer_lab"),
    }
    faculty = {
        "f1": Faculty(id="f1", name="Prof One", type="full_time",
                      approved_courses=["CORE1", "CORE2", "LAB1"]),
        "f2": Faculty(id="f2", name="Prof Two", type="full_time",
                      approved_courses=["CORE1", "CORE2", "LAB1"]),
        "adj": Faculty(id="adj", name="Adj Three", type="adjunct",
                       approved_courses=["CORE1"],
                       availability=[Window("Tue", parse_time("08:00"),
                                            parse_time("13:00"))]),
    }
    rooms = {
        "big": Room(id="big", name="Big Hall", type="lecture_room", capacity=100),
        "small": Room(id="small", name="Small Room", type="lecture_room", capacity=25),
        "lab": Room(id="lab", name="CS Lab", type="computer_lab", capacity=30),
    }
    return Dataset(courses=courses, faculty=faculty, rooms=rooms)


def place(course, day, start, room, faculty, kind="lecture", section=1, index=0):
    return Placement(course, section, kind, index, day, parse_time(start),
                     room, faculty)


class HardRuleTests(unittest.TestCase):
    def setUp(self):
        self.ds = tiny_dataset()

    def codes(self, placements):
        return {v.code for v in engine.validate(self.ds, placements)}

    def test_clean_timetable_passes(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE2", "Mon", "09:45", "big", "f2")]
        self.assertEqual(engine.validate(self.ds, tt), [])

    def test_cohort_clash(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE2", "Mon", "08:00", "small", "f2")]
        self.assertIn("H-STU-1", self.codes(tt))

    def test_ug_weekend_rejected(self):
        tt = [place("CORE1", "Sat", "08:00", "big", "f1")]
        self.assertIn("H-STU-2", self.codes(tt))

    def test_faculty_double_booked(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE2", "Mon", "08:00", "small", "f1")]
        self.assertIn("H-FAC-1", self.codes(tt))

    def test_adjunct_outside_availability(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "adj")]
        self.assertIn("H-FAC-2", self.codes(tt))
        ok = [place("CORE1", "Tue", "08:00", "big", "adj")]
        self.assertNotIn("H-FAC-2", self.codes(ok))

    def test_unapproved_course(self):
        tt = [place("CORE2", "Mon", "08:00", "big", "adj", section=1)]
        self.assertIn("H-FAC-3", self.codes(tt))

    def test_room_double_booked(self):
        # Different levels so no cohort clash; different faculty.
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("LAB1", "Mon", "08:00", "big", "f2", kind="lab")]
        self.assertIn("H-ROOM-1", self.codes(tt))

    def test_room_too_small(self):
        tt = [place("CORE1", "Mon", "08:00", "small", "f1")]
        self.assertIn("H-ROOM-2", self.codes(tt))

    def test_lab_needs_lab_room(self):
        tt = [place("LAB1", "Mon", "08:00", "big", "f1", kind="lab")]
        self.assertIn("H-ROOM-3", self.codes(tt))
        ok = [place("LAB1", "Mon", "08:00", "lab", "f1", kind="lab")]
        self.assertNotIn("H-ROOM-3", self.codes(ok))

    def test_off_grid_time_rejected(self):
        tt = [place("CORE1", "Mon", "08:30", "big", "f1")]
        self.assertIn("H-TIME-1", self.codes(tt))


class SoftRuleTests(unittest.TestCase):
    def setUp(self):
        self.ds = tiny_dataset()

    def codes(self, placements):
        _, penalties = engine.score(self.ds, placements)
        return {p.code for p in penalties}

    def test_oversized_room(self):
        tt = [place("LAB1", "Mon", "08:00", "big", "f1")]  # 100 seats for 20
        # Judged as a lecture meeting here so the hard lab rule stays out of it.
        self.assertIn("S-ROOM-1", self.codes(tt))

    def test_back_to_back_run(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE1", "Mon", "09:45", "big", "f1", index=1),
              place("CORE2", "Mon", "11:30", "big", "f1")]
        self.assertIn("S-FAC-2", self.codes(tt))

    def test_cohort_long_gap(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE2", "Mon", "15:00", "big", "f2")]
        self.assertIn("S-STU-1", self.codes(tt))


class SectionAwareTests(unittest.TestCase):
    """Sections give students alternatives — only flag when no combo works."""

    def setUp(self):
        self.ds = tiny_dataset()
        self.ds.courses["CORE1"].sections = 2

    def test_clash_excused_by_alternate_section(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1", section=1),
              place("CORE1", "Tue", "09:45", "big", "f1", section=2),
              place("CORE2", "Mon", "08:00", "small", "f2")]
        codes = {v.code for v in engine.validate(self.ds, tt)}
        self.assertNotIn("H-STU-1", codes)

    def test_clash_when_every_section_collides(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1", section=1),
              place("CORE1", "Mon", "08:00", "small", "f2", section=2),
              place("CORE2", "Mon", "08:00", "lab", "f1")]
        codes = {v.code for v in engine.validate(self.ds, tt)}
        self.assertIn("H-STU-1", codes)


class AcademicStructureTests(unittest.TestCase):
    """Course plans drive cohorts, requirements, pools and enrollment."""

    def setUp(self):
        from timetabler.models import CoursePlan, ElectivePool, Major
        self.ds = tiny_dataset()
        self.ds.courses["EL1"] = Course(code="EL1", title="Elective One",
                                        type="elective", level=1)
        self.ds.courses["EL2"] = Course(code="EL2", title="Elective Two",
                                        type="elective", level=1)
        for f in self.ds.faculty.values():
            f.approved_courses += ["EL1", "EL2"]
        self.ds.majors = {"cs": Major(id="cs", name="CS", counts={1: 50})}
        self.ds.course_plans = [CoursePlan(
            id="cs_y1_s1", major_id="cs", year=1, semester=1,
            mandatory=["CORE1", "CORE2"],
            elective_pools=[ElectivePool(id="p1", label="Sci", kind="major",
                                         pick=2, courses=["EL1", "EL2"])],
        )]

    def test_enrollment_derived_from_major_counts(self):
        self.assertEqual(self.ds.enrollment(self.ds.courses["CORE1"]), 50)
        # elective: 50 students picking 2 of 2 → both fully enrolled
        self.assertEqual(self.ds.enrollment(self.ds.courses["EL1"]), 50)

    def test_pool_infeasible_when_electives_clash_mandatory(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE2", "Tue", "08:00", "big", "f2"),
              place("EL1", "Mon", "08:00", "lab", "f2"),   # clashes CORE1
              place("EL2", "Tue", "08:00", "lab", "f1")]   # clashes CORE2
        codes = {v.code for v in engine.validate(self.ds, tt)}
        self.assertIn("H-STU-3", codes)

    def test_pool_feasible_when_spread_out(self):
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE2", "Tue", "08:00", "big", "f2"),
              place("EL1", "Wed", "08:00", "lab", "f2"),
              place("EL2", "Thu", "08:00", "lab", "f1")]
        codes = {v.code for v in engine.validate(self.ds, tt)}
        self.assertNotIn("H-STU-3", codes)


class DataIntegrityTests(unittest.TestCase):
    def test_duplicate_meeting_flagged(self):
        ds = tiny_dataset()
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE1", "Tue", "08:00", "big", "f1")]  # same key twice
        codes = {v.code for v in engine.validate(ds, tt)}
        self.assertIn("H-DUP", codes)

    def test_unknown_room_flagged(self):
        ds = tiny_dataset()
        tt = [place("CORE1", "Mon", "08:00", "ghost_room", "f1")]
        codes = {v.code for v in engine.validate(ds, tt)}
        self.assertIn("H-ROOM-0", codes)

    def test_custom_timegrid_respected(self):
        from timetabler.models import Timegrid
        ds = tiny_dataset()
        ds.timegrid = Timegrid(lecture_starts=[9 * 60], discussion_starts=[9 * 60])
        ok = [place("CORE1", "Mon", "09:00", "big", "f1")]
        bad = [place("CORE1", "Mon", "08:00", "big", "f1")]
        self.assertNotIn("H-TIME-1", {v.code for v in engine.validate(ds, ok)})
        self.assertIn("H-TIME-1", {v.code for v in engine.validate(ds, bad)})


class FacultyLimitTests(unittest.TestCase):
    def test_daily_hours_cap(self):
        ds = tiny_dataset()
        ds.faculty["f1"].max_hours_per_day = 3.0
        tt = [place("CORE1", "Mon", "08:00", "big", "f1"),
              place("CORE1", "Mon", "09:45", "big", "f1", index=1),
              place("CORE2", "Mon", "13:15", "big", "f1")]  # 4.5h total
        codes = {v.code for v in engine.validate(ds, tt)}
        self.assertIn("H-FAC-5", codes)


class GenerateOptionTests(unittest.TestCase):
    def setUp(self):
        self.ds = loader.load_dataset(DATA)

    def test_options_are_returned_and_best_is_valid(self):
        options = generate.generate_options(self.ds)
        self.assertTrue(options)
        best = options[0]
        self.assertEqual(best.unplaced, [])
        self.assertEqual(engine.validate(self.ds, best.placements), [])

    def test_locked_placements_survive_generation(self):
        first = generate.generate(self.ds)
        lock = first[0]
        options = generate.generate_options(self.ds, locked=[lock])
        for o in options:
            self.assertIn(
                (lock.course, lock.section, lock.kind, lock.index,
                 lock.day, lock.start, lock.room, lock.faculty),
                {(p.course, p.section, p.kind, p.index,
                  p.day, p.start, p.room, p.faculty) for p in o.placements},
            )


class SampleDatasetTests(unittest.TestCase):
    def setUp(self):
        self.ds = loader.load_dataset(DATA)

    def test_sample_draft_is_flagged(self):
        tt = loader.load_timetable(DATA)
        codes = {v.code for v in engine.validate(self.ds, tt)}
        # The shipped draft contains three deliberate mistakes.
        self.assertEqual(codes, {"H-FAC-1", "H-FAC-2", "H-ROOM-3"})

    def test_suggestions_are_all_valid(self):
        tt = loader.load_timetable(DATA)
        before = len(engine.validate(self.ds, tt))
        for option in suggest.suggest(self.ds, tt, "ECON101"):
            others = [p for p in tt if p.course != "ECON101"]
            after = engine.validate(self.ds, others + [option.placement])
            self.assertLessEqual(len(after), before)

    def test_generate_produces_valid_timetable(self):
        draft = generate.generate(self.ds)
        self.assertEqual(engine.validate(self.ds, draft), [])
        expected = sum(c.sections * sum(c.sessions.values())
                       for c in self.ds.courses.values())
        self.assertEqual(len(draft), expected)


if __name__ == "__main__":
    unittest.main()
