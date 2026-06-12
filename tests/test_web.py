"""Tests for the JSON layer used by the UI and the Vercel functions."""
import json
import unittest
from pathlib import Path

from timetabler import web

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def dataset_body() -> dict:
    """The inline dataset the frontend sends with every request."""
    return {
        "courses": json.loads((FIXTURES / "courses.json").read_text()),
        "faculty": json.loads((FIXTURES / "faculty.json").read_text()),
        "rooms": json.loads((FIXTURES / "rooms.json").read_text()),
    }


def sample_placements() -> list[dict]:
    return json.loads((FIXTURES / "timetable.json").read_text())


class WebPayloadTests(unittest.TestCase):
    def test_validate_flags_the_clashing_chips(self):
        res = web.validate_payload({**dataset_body(),
                                    "placements": sample_placements()})
        self.assertFalse(res["valid"])
        self.assertIn("MATH121|1|lecture|0", res["flagged"])
        self.assertIn("STAT221|1|lecture|0", res["flagged"])

    def test_place_offers_only_legal_rooms(self):
        res = web.place_payload({
            **dataset_body(),
            "placements": sample_placements(),
            "course": "CS212", "section": 1, "kind": "lab", "index": 0,
            "day": "Wed", "start": "11:30",
        })
        self.assertTrue(res["options"])
        self.assertTrue(all(o["room"] == "r_cslab" for o in res["options"]))

    def test_place_rejects_off_grid_time(self):
        res = web.place_payload({
            **dataset_body(),
            "placements": sample_placements(),
            "course": "ENGL112", "section": 1, "kind": "lecture", "index": 0,
            "day": "Fri", "start": "08:30",
        })
        self.assertEqual(res["options"], [])
        self.assertTrue(res["reasons"])

    def test_generate_payload_round_trips_through_validate(self):
        res = web.generate_payload(dataset_body())
        self.assertIsNone(res["error"])
        self.assertTrue(res["options"])
        best = res["options"][0]
        self.assertTrue(best["complete"])
        self.assertEqual(best["unplaced"], [])
        check = web.validate_payload({**dataset_body(),
                                      "placements": best["placements"]})
        self.assertTrue(check["valid"])

    def test_simulate_runs_both_semesters(self):
        res = web.simulate_payload(dataset_body())
        self.assertIsNone(res["error"])
        self.assertEqual([s["semester"] for s in res["semesters"]], [1, 2])
        for s in res["semesters"]:
            self.assertIn("complete", s)
            self.assertIn("unplaced", s)

    def test_explain_degrades_without_key(self):
        import os
        old = os.environ.pop("XAI_API_KEY", None)
        try:
            res = web.explain_payload({**dataset_body(), "placements": []})
            self.assertIsNone(res["summary"])
            self.assertIn("XAI_API_KEY", res["error"])
        finally:
            if old is not None:
                os.environ["XAI_API_KEY"] = old


if __name__ == "__main__":
    unittest.main()
