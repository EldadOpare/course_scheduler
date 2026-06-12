"""JSON request/response layer shared by the Vercel functions and the dev server.

Every function takes a parsed JSON body (dict) and returns a JSON-serializable
dict. No HTTP in here; that lives in api/ (Vercel) and dev_server.py (local).
The dataset always arrives inline in the request body (sent by the frontend
from Supabase); the engine itself never touches disk or a database.
"""
from __future__ import annotations

from . import assist, engine, generate as gen, loader, suggest as sug, timegrid
from .models import Placement, fmt_time, parse_time


def _dataset(body: dict):
    return loader.load_dataset_from_dicts(
        body["courses"], body["faculty"], body["rooms"],
        majors_list=body.get("majors"),
        course_plans_list=body.get("course_plans"),
        rules=body.get("rules"),
        timegrid=body.get("timegrid"),
        durations=body.get("durations"),
        semester=int(body.get("semester", 1)),
    )


def _key(p: Placement) -> str:
    return f"{p.course}|{p.section}|{p.kind}|{p.index}"


def _placement_dict(p: Placement) -> dict:
    return {
        "course": p.course, "section": p.section, "kind": p.kind,
        "index": p.index, "day": p.day, "start": fmt_time(p.start),
        "room": p.room, "faculty": p.faculty,
    }


def _parse_placements(body: dict, ds=None, key: str = "placements") -> list[Placement]:
    return [
        Placement(
            course=d["course"], section=int(d["section"]), kind=d["kind"],
            index=int(d.get("index", 0)), day=d["day"],
            start=parse_time(d["start"]), room=d["room"], faculty=d["faculty"],
            duration=ds.duration_of(d["kind"]) if ds else 0,
        )
        for d in body.get(key, [])
    ]


def validate_payload(body: dict) -> dict:
    ds = _dataset(body)
    placements = _parse_placements(body, ds)
    violations = engine.validate(ds, placements)
    total, penalties = engine.score(ds, placements)

    # I flagged a chip when removing it lowered the violation count, but I
    # only re-checked placements whose course shows up in a violation
    # message. Re-validating the whole timetable once per placement made
    # big datasets crawl for nothing.
    flagged = []
    if violations:
        mentioned = " ".join(v.message for v in violations)
        for i, p in enumerate(placements):
            if p.course not in mentioned:
                continue
            others = placements[:i] + placements[i + 1:]
            if len(engine.validate(ds, others)) < len(violations):
                flagged.append(_key(p))

    return {
        "valid": not violations,
        "violations": [{"code": v.code, "message": v.message} for v in violations],
        "penalties": [{"code": p.code, "weight": p.weight, "message": p.message}
                      for p in penalties],
        "score": total,
        "flagged": flagged,
    }


def _option_dict(ds, cand: Placement, penalty: int, percent: int = 0) -> dict:
    return {
        "day": cand.day, "start": fmt_time(cand.start), "end": fmt_time(cand.end),
        "room": cand.room, "room_name": ds.rooms[cand.room].name,
        "faculty": cand.faculty, "faculty_name": ds.faculty[cand.faculty].name,
        "penalty": penalty, "percent": percent,
    }


def suggest_payload(body: dict) -> dict:
    ds = _dataset(body)
    placements = _parse_placements(body, ds)
    options = sug.suggest(
        ds, placements, body["course"], int(body.get("section", 1)),
        body.get("kind", "lecture"), int(body.get("index", 0)),
        top=int(body.get("top", 5)),
    )
    return {"options": [
        _option_dict(ds, o.placement, o.penalty, o.percent) for o in options
    ]}


def place_payload(body: dict) -> dict:
    """Best room/teacher options for one meeting at one specific day+start."""
    ds = _dataset(body)
    placements = _parse_placements(body, ds)
    course = ds.courses[body["course"]]
    section = int(body.get("section", 1))
    kind = body.get("kind", "lecture")
    index = int(body.get("index", 0))
    day, start = body["day"], parse_time(body["start"])

    if not timegrid.is_approved(kind, course.program, day, start,
                                ds.timegrid, ds.duration_of(kind)):
        return {"options": [], "reasons": [
            f"{day} {body['start']} is not an approved {kind} slot "
            f"for {course.program} courses",
        ]}

    others = [
        p for p in placements
        if not (p.course == course.code and p.section == section
                and p.kind == kind and p.index == index)
    ]
    baseline = {(v.code, v.message) for v in engine.validate(ds, others)}

    scored, reasons = [], []
    for fac_id in sug.candidate_faculty(ds, others, course.code, section):
        for room in ds.rooms.values():
            cand = ds.make_placement(course.code, section, kind, index,
                                     day, start, room.id, fac_id)
            new = [v for v in engine.validate(ds, others + [cand])
                   if (v.code, v.message) not in baseline]
            if new:
                if not reasons:
                    reasons = [v.message for v in new]
                continue
            total, _ = engine.score(ds, others + [cand])
            scored.append((total, cand))

    scored.sort(key=lambda t: t[0])
    return {
        "options": [_option_dict(ds, c, t) for t, c in scored[:5]],
        "reasons": [] if scored else
            (reasons or ["No legal room/teacher combination for this slot."]),
    }


def generate_payload(body: dict) -> dict:
    """Multiple ranked drafts; `locked` placements are kept where they are."""
    ds = _dataset(body)
    locked = _parse_placements(body, ds, key="locked")
    try:
        options = gen.generate_options(ds, locked=locked)
    except ValueError as e:
        return {"options": [], "error": str(e)}
    return {
        "options": [
            {
                "label": o.label,
                "score": o.score,
                "complete": not o.unplaced and not o.violations,
                "placements": [_placement_dict(p) for p in o.placements],
                "violations": [
                    {"code": v.code, "message": v.message} for v in o.violations
                ],
                "penalties": [
                    {"code": p.code, "weight": p.weight, "message": p.message}
                    for p in o.penalties
                ],
                "unplaced": [
                    {"course": u.course, "section": u.section, "kind": u.kind,
                     "index": u.index, "reason": u.reason}
                    for u in o.unplaced
                ],
            }
            for o in options
        ],
        "error": None,
    }


def simulate_payload(body: dict) -> dict:
    """Full-year feasibility run for Admissions: generate both semesters
    (each restricted to the courses its plans reference) and report whether
    the intake numbers actually fit the rooms and faculty."""
    semesters_out = []
    for sem in (1, 2):
        ds = _dataset({**body, "semester": sem})

        # I narrowed the catalogue to the courses this semester's plans
        # mention, so semester 1 was not forced to schedule semester 2's
        # classes too. Non-undergrad programs (like MBA) stayed in.
        plans = [p for p in ds.course_plans if p.semester == sem]
        if plans:
            in_play: set[str] = set()
            for plan in plans:
                in_play.update(plan.mandatory)
                for pool in plan.elective_pools:
                    in_play.update(pool.courses)
            ds.courses = {
                code: c for code, c in ds.courses.items()
                if code in in_play or c.program != "undergraduate"
            }

        total_meetings = sum(
            c.sections * sum(c.sessions.values()) for c in ds.courses.values()
        )
        if not total_meetings:
            semesters_out.append({
                "semester": sem, "complete": True, "score": 0,
                "placed": 0, "total_meetings": 0, "courses_in_play": 0,
                "students": 0, "unplaced": [], "top_penalties": [],
                "note": "no courses planned for this semester",
            })
            continue

        # I ran just one fast profile per semester here so the whole-year
        # run stays inside the serverless time limit.
        options = gen.generate_options(
            ds, max_nodes=3000, improve_seconds=0.5,
            profiles={"Balanced": {}},
        )
        best = options[0]
        students = sum(
            m.counts.get(p.year, 0)
            for p in plans for m in [ds.majors.get(p.major_id)] if m
        )
        semesters_out.append({
            "semester": sem,
            "complete": not best.unplaced and not best.violations,
            "score": best.score,
            "placed": len(best.placements),
            "total_meetings": total_meetings,
            "courses_in_play": len(ds.courses),
            "students": students,
            "unplaced": [
                {"course": u.course, "section": u.section, "kind": u.kind,
                 "index": u.index, "reason": u.reason}
                for u in best.unplaced
            ],
            "top_penalties": [p.message for p in best.penalties[:8]],
        })

    return {
        "semesters": semesters_out,
        "feasible": all(s["complete"] for s in semesters_out),
        "error": None,
    }


def explain_payload(body: dict) -> dict:
    ds = _dataset(body)
    placements = _parse_placements(body, ds)
    if not assist.available():
        return {"summary": None,
                "error": "XAI_API_KEY is not set. Grok summaries are disabled."}
    try:
        summary = assist.explain(engine.report(ds, placements))
    except Exception as e:  # network/API errors should never break the UI
        return {"summary": None, "error": f"Grok request failed: {e}"}
    return {"summary": summary, "error": None}
