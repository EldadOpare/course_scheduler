-- =============================================================
-- Ashesi Timetabler — named timetable sessions
-- Each session is its own timetable: its placements (already keyed by
-- semester_id), the courses/rooms picked for it, and whether it has been
-- published. Lets the registry keep "Sem 1 2026", "Sem 2 2026", drafts,
-- etc. side by side and switch between them.
-- Run after 007_placements_assistant.sql
-- =============================================================

ALTER TABLE public.timetable_sessions
  ADD COLUMN IF NOT EXISTS active_courses JSONB,           -- { "CS101": 2, ... } course -> cohort count
  ADD COLUMN IF NOT EXISTS active_rooms   JSONB,           -- ["nutor-100", ...]; null = all rooms
  ADD COLUMN IF NOT EXISTS published_at   TIMESTAMPTZ;     -- set when published (locked); null = draft

-- Older single-session installs may have parked picks in the settings
-- table. Nothing to migrate automatically; new picks save on the session.
