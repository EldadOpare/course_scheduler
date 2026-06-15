-- =============================================================
-- Ashesi Timetabler — add faculty intern (assistant) to placements
-- A class can have a lecturer (faculty) and, optionally, a faculty
-- intern assisting. Stored as a faculty id; null when none.
-- Run after 006_seed_course_plans_sem1.sql
-- =============================================================

ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS assistant TEXT;
