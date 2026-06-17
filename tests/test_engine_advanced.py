"""Tests for the exact N-way cohort check, the incremental candidate checker
that powers suggest, the heuristic generator, and the optional CP-SAT solver."""
import unittest
from pathlib import Path

from timetabler import engine, generate, loader, solver
from timetabler.rules import hard
from timetabler.models import (
    Course, Dataset, Faculty, Placement, Room, parse_time,
)

DATA = Path(__file__).resolve().parent / "fixtures"


def place(course, day, start, room, faculty, kind="lecture", section=1, index=0):
    return Placement(course, section, kind, index, day, parse_time(start),
                     room, faculty)


def three_way_dataset() -> Dataset:
    """Three required courses, two sections each, but only two usable time
    slots. Every pair of courses can be taken together (some section pairing
    is free), yet no student can take all three — a clash the old pairwise-only
    check could not see."""
    courses = {
        c: Course(code=c, title=c, type="core", level=1, majors=["CS"],
                  expected_enrollment=30, sections=2, sessions={"lecture": 1})
        for c in ("A", "B", "C")
    }
    faculty = {
        f"f{i}": Faculty(id=f"f{i}", name=f"Prof {i}", type="full_time",
                         approved_courses=["A", "B", "C"])
        for i in range(1, 4)
    }
    rooms = {
        f"r{i}": Room(id=f"r{i}", name=f"Room {i}", type="lecture_room",
                      capacity=100)
        for i in range(1, 4)
    }
    return Dataset(courses=courses, faculty=faculty, rooms=rooms)


def three_way_timetable():
    # section 1 of every course at 08:00, section 2 at 09:45 — two slots only.
    # Distinct rooms/faculty keep room and faculty rules out of the way so the
    # only possible violation is the cohort one.
    tt = []
    for course, (f, r) in zip("ABC", [("f1", "r1"), ("f2", "r2"), ("f3", "r3")]):
        tt.append(place(course, "Mon", "08:00", r, f, section=1))
        tt.append(place(course, "Mon", "09:45", r, f, section=2))
    return tt


class NWayCohortTests(unittest.TestCase):
    def test_pairwise_all_fit_but_three_way_clashes(self):
        ds = three_way_dataset()
        idx = hard._SectionIndex(three_way_timetable())
        # Every pair can be combined...
        self.assertTrue(idx.pair_ok("A", "B"))
        self.assertTrue(idx.pair_ok("A", "C"))
        self.assertTrue(idx.pair_ok("B", "C"))
        # ...but not all three at once.
        self.assertFalse(idx.all_fit(["A", "B", "C"]))

    def test_validate_reports_the_three_way_clash(self):
        ds = three_way_dataset()
        violations = engine.validate(ds, three_way_timetable())
        codes = {v.code for v in violations}
        self.assertEqual(codes, {"H-STU-1"})
        self.assertTrue(any("three-or-more-way" in v.message for v in violations))

    def test_three_slots_is_feasible(self):
        # Same courses, but spread section 2 to a genuine third slot so a
        # student can take one section of each with no clash.
        ds = three_way_dataset()
        tt = [
            place("A", "Mon", "08:00", "r1", "f1", section=1),
            place("A", "Mon", "09:45", "r1", "f1", section=2),
            place("B", "Mon", "09:45", "r2", "f2", section=1),
            place("B", "Mon", "11:30", "r2", "f2", section=2),
            place("C", "Mon", "11:30", "r3", "f3", section=1),
            place("C", "Mon", "08:00", "r3", "f3", section=2),
        ]
        idx = hard._SectionIndex(tt)
        self.assertTrue(idx.all_fit(["A", "B", "C"]))
        self.assertNotIn("H-STU-1", {v.code for v in engine.validate(ds, tt)})


class IncrementalCheckerTests(unittest.TestCase):
    """hard.candidate_adds_violation must agree with a full re-validation:
    adding a candidate is illegal iff the total violation count goes up."""

    def setUp(self):
        self.ds = loader.load_dataset(DATA)
        self.others = loader.load_timetable(DATA)
        self.ctx = hard.build_context(self.ds, self.others)

    def _agrees(self, cand: Placement):
        base = len(engine.validate(self.ds, self.others))
        full_adds = len(engine.validate(self.ds, self.others + [cand])) > base
        incremental = hard.candidate_adds_violation(self.ds, self.ctx, cand)
        self.assertEqual(incremental, full_adds,
                         f"mismatch for {cand.label()}")

    def test_matches_full_validation_across_candidates(self):
        course = next(iter(self.ds.courses.values()))
        rooms = list(self.ds.rooms.values())
        fac = next(f.id for f in self.ds.faculty.values()
                   if course.code in f.approved_courses)
        # A spread of candidates: different days, times, rooms.
        for day in self.ds.timegrid.weekdays:
            for start in self.ds.timegrid.lecture_starts[:3]:
                for room in rooms[:3]:
                    cand = self.ds.make_placement(
                        course.code, 1, "lecture", 0, day, start, room.id, fac)
                    self._agrees(cand)


class GeneratorTests(unittest.TestCase):
    def test_generate_options_are_valid(self):
        ds = loader.load_dataset(DATA)
        # No solver here so the call stays fast and deterministic.
        options = generate.generate_options(ds, solver_seconds=0.0)
        self.assertTrue(options)
        best = options[0]
        self.assertEqual(engine.validate(ds, best.placements), [])
        self.assertFalse(best.unplaced)

    def test_generate_returns_complete_draft(self):
        ds = loader.load_dataset(DATA)
        placements = generate.generate(ds)
        self.assertTrue(placements)
        self.assertEqual(engine.validate(ds, placements), [])


@unittest.skipUnless(solver.available(), "OR-Tools not installed")
class SolverTests(unittest.TestCase):
    def test_solver_produces_valid_timetable(self):
        ds = loader.load_dataset(DATA)
        res = solver.solve(ds, max_seconds=15)
        self.assertTrue(res.feasible)
        self.assertEqual(engine.validate(ds, res.placements), [])
        # Every meeting placed exactly once.
        self.assertEqual(len(res.placements), len(solver._meetings(ds)))

    def test_solver_proves_infeasible(self):
        ds = loader.load_dataset(DATA)
        # Demand a room type that does not exist for a lab.
        course = next(iter(ds.courses.values()))
        course.sessions = {"lab": 1}
        course.requires_room_type = "does_not_exist"
        res = solver.solve(ds, max_seconds=10)
        self.assertTrue(res.proven_infeasible)


if __name__ == "__main__":
    unittest.main()
