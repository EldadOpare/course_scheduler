# Ashesi Timetabling Engine

A constraint-aware academic scheduling system: a **rules engine** that decides whether
a timetable is valid, plus an **optimization layer** that scores and ranks valid
options, a draft generator with local-search polish, and a full-year
feasibility simulator.

Pure Python, standard library only — nothing to install.

## Web UI

```bash
python3 dev_server.py      # → http://localhost:3000
```

A dashboard in the Ashesi house style: validity ring, quality score, key-concerns
carousel, itemized hard violations and soft penalties, plus a **drag-and-drop weekly
timetable**. Drag a meeting from the *Unscheduled* tray onto the grid — it snaps to
approved slots, and the engine picks the best legal room and teacher for that slot
(or tells you exactly why none exists). Chips involved in hard violations get a red
outline; click any chip for details, issues, and ranked better options ("Find best
slots"). The toolbar has Generate draft / Sample / Clear / Export / Import.

Your working timetable is kept in the browser (localStorage) — use **Export** to
save a `timetable.json` the CLI understands, **Import** to load one.

## Deploying to Vercel (free tier)

The repo is Vercel-ready: `public/` is served statically and `api/*.py` run as
Python serverless functions (no dependencies, `vercel.json` already configured).

```bash
npm i -g vercel    # once
vercel             # deploy a preview
vercel --prod      # deploy to production
```

Optionally set `XAI_API_KEY` (and `XAI_MODEL`) under *Project Settings →
Environment Variables* to enable the "Ask Grok" summaries. Locally, copy
`.env.example` to `.env` and fill it in. Never commit `.env`.

## CLI quickstart

```bash
# V1 — validate the sample timetable (tests/fixtures/timetable.json)
python3 -m timetabler validate

# V2 — ranked legal options for one meeting
python3 -m timetabler suggest CS212 --kind lab
python3 -m timetabler suggest ENGL112 --section 1

# V3 — generate a conflict-free draft from scratch
python3 -m timetabler generate          # dry run
python3 -m timetabler generate --save   # overwrite timetable.json

# run the tests
python3 -m unittest discover -s tests
```

The shipped sample timetable contains **three deliberate mistakes** so you can see
V1 in action: a double-booked professor, an adjunct scheduled outside their
availability, and a computer-lab course placed in a lecture room. Run `validate`
to see them flagged, then `generate --save` to replace the draft with a clean one.

## Your data

Real data lives in Supabase (run `supabase/migrations/001_initial_schema.sql` once).
The CLI reads JSON fixtures instead — `tests/fixtures/` by default, or pass `--data path/`:

| File | What goes in it |
|---|---|
| `courses.json` | code, type (core/major_core/elective), level, majors, enrollment, sections, weekly sessions, required room type |
| `faculty.json` | full-time/adjunct, approved courses, availability windows (required for adjuncts), preferred times, load targets |
| `rooms.json` | capacity, type (lecture_room/computer_lab/engineering_lab/workshop/fab_lab), building |
| `timetable.json` | the placements — what the engine judges |

Time slots (the UG weekday grid and MBA weekend blocks) live in
`timetabler/timegrid.py`.

## Optional Grok summary

The engine never needs an LLM. If you want a plain-English summary of a validation
report, set an x.ai API key:

```bash
export XAI_API_KEY=...
python3 -m timetabler validate --explain
```

## Known simplifications

- Cohort clashes are checked pairwise across courses (with section
  alternatives respected); a full exact-cover check across every required
  course at once is intentionally out of scope.
- The generator is constructive search plus local-search improvement;
  provably optimal solving (OR-Tools CP-SAT) is a possible future upgrade.
