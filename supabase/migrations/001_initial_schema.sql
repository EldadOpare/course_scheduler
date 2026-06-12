-- =============================================================
-- Ashesi Timetabler — initial schema
-- Run once in the Supabase SQL Editor
-- =============================================================

-- ── Course catalogue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  code                TEXT    PRIMARY KEY,
  title               TEXT    NOT NULL,
  type                TEXT    NOT NULL DEFAULT '',
  program             TEXT    NOT NULL DEFAULT '',
  level               INTEGER NOT NULL DEFAULT 1,
  majors              TEXT[]  DEFAULT '{}',
  prerequisites       TEXT[]  DEFAULT '{}',
  credits             INTEGER NOT NULL DEFAULT 1,
  expected_enrollment INTEGER NOT NULL DEFAULT 0,
  sections            INTEGER NOT NULL DEFAULT 1,
  sessions            JSONB   NOT NULL DEFAULT '{}',
  requires_room_type  TEXT    NOT NULL DEFAULT '',
  intake              TEXT    NOT NULL DEFAULT 'september'
);

-- ── Faculty ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.faculty (
  id              TEXT  PRIMARY KEY,
  name            TEXT  NOT NULL,
  type            TEXT  NOT NULL DEFAULT 'full_time',
  load_target     INTEGER NOT NULL DEFAULT 4,
  max_overload    INTEGER NOT NULL DEFAULT 2,
  max_hours_per_day NUMERIC NOT NULL DEFAULT 6,
  approved_courses TEXT[] DEFAULT '{}',
  availability     JSONB  DEFAULT '[]',
  preferred_times  JSONB  DEFAULT '[]'
);

-- ── Classrooms ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id            TEXT    PRIMARY KEY,
  name          TEXT    NOT NULL,
  type          TEXT    NOT NULL DEFAULT '',
  capacity      INTEGER NOT NULL DEFAULT 0,
  equipment     TEXT[]  DEFAULT '{}',
  restricted_to TEXT[]  DEFAULT '{}',   -- programs allowed; empty = any
  building      TEXT    NOT NULL DEFAULT ''
);

-- ── Academic structure ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.year_groups (
  id       TEXT    PRIMARY KEY,
  label    TEXT    NOT NULL,
  year     INTEGER NOT NULL,
  intake   TEXT    NOT NULL DEFAULT 'september',
  capacity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.majors (
  id     TEXT  PRIMARY KEY,
  name   TEXT  NOT NULL,
  counts JSONB NOT NULL DEFAULT '{}'   -- { "1": 85, "2": 72, ... }
);

CREATE TABLE IF NOT EXISTS public.academic_semesters (
  id            TEXT    PRIMARY KEY,
  name          TEXT    NOT NULL,
  academic_year TEXT    NOT NULL,
  number        INTEGER NOT NULL CHECK (number IN (1, 2)),
  start_date    DATE,
  weeks         INTEGER NOT NULL DEFAULT 15,
  active_years  INTEGER[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.course_plans (
  id            TEXT  PRIMARY KEY,
  major_id      TEXT  NOT NULL REFERENCES public.majors(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  semester      INTEGER NOT NULL CHECK (semester IN (1, 2)),
  mandatory     TEXT[]  DEFAULT '{}',
  elective_pools JSONB  DEFAULT '[]'
);

-- ── Engine settings (timegrid, session durations) ─────────────
CREATE TABLE IF NOT EXISTS public.settings (
  key   TEXT  PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO public.settings (key, value) VALUES
  ('timegrid', '{
    "weekdays": ["Mon","Tue","Wed","Thu","Fri"],
    "weekend":  ["Sat","Sun"],
    "day_start": 480,
    "day_end":   990,
    "lecture_starts":    [480,585,690,795,900],
    "discussion_starts": [480,585,690,795,900],
    "lab_starts":        [480,690,795],
    "weekend_starts":    [510,720]
  }'),
  ('durations', '{"lecture":90,"discussion":60,"lab":180}'),
  ('rules', '{
    "min_break": 15,
    "max_gap":   180,
    "lunch_start": 690,
    "lunch_end":   810,
    "lunch_min":   30
  }')
ON CONFLICT (key) DO NOTHING;

-- ── Timetabling sessions (scheduling runs) ────────────────────
CREATE TABLE IF NOT EXISTS public.timetable_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                TEXT NOT NULL DEFAULT 'Untitled',
  academic_semester_id TEXT REFERENCES public.academic_semesters(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Placements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.placements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id UUID NOT NULL REFERENCES public.timetable_sessions(id) ON DELETE CASCADE,
  course      TEXT    NOT NULL,
  section     INTEGER NOT NULL,
  kind        TEXT    NOT NULL,
  index_      INTEGER NOT NULL DEFAULT 0,
  day         TEXT    NOT NULL,
  start_time  TEXT    NOT NULL,
  room        TEXT    NOT NULL,
  faculty     TEXT    NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS placements_meeting_idx
  ON public.placements(semester_id, course, section, kind, index_);

-- ── Saved timetables (snapshots the registry wants to keep) ───
CREATE TABLE IF NOT EXISTS public.timetable_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  placements JSONB NOT NULL DEFAULT '[]',
  score      INTEGER,
  valid      BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row-level security ────────────────────────────────────────
-- All tables open to anon for now. Tighten once auth is added.

ALTER TABLE public.courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.year_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.majors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full" ON public.courses            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.faculty            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.rooms              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.year_groups        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.majors             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.academic_semesters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.course_plans       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.settings           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.timetable_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.placements         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full" ON public.timetable_snapshots FOR ALL USING (true) WITH CHECK (true);

-- ── Realtime (live multi-user sync for placements) ────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.placements;
