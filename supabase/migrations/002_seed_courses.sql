-- =============================================================
-- Ashesi Timetabler — seed: CS programme course catalogue
-- Source: CAMU student record (Eldad Milagros Khodjo Opare, 65542027)
-- Run in the Supabase SQL Editor after 001_initial_schema.sql
-- =============================================================

-- Allow fractional credits (0.5 for seminars/half-credit courses)
ALTER TABLE public.courses ALTER COLUMN credits TYPE NUMERIC;

-- =============================================================
-- courses
--   code        – official course code (normalised, no spaces)
--   title       – full course title
--   type        – 'liberal_arts_core' | 'required_major' | 'major_elective' | 'non_major_elective'
--   program     – offering department abbreviation (csis | hss | ba)
--   level       – year level derived from course number (1–4)
--   credits     – Ashesi credit units (0, 0.5 or 1)
--   sections    – default number of parallel sections
--   sessions    – meetings per week  {"lecture": N}
--   intake      – 'september' for all standard courses
-- =============================================================

INSERT INTO public.courses
  (code, title, type, program, level, credits, sections, sessions, requires_room_type, intake)
VALUES

  -- ── Year 1 — Liberal Arts Core ────────────────────────────
  ('MATH141',  'Calculus I',
   'liberal_arts_core', 'hss', 1, 1,   3, '{"lecture":2}', '', 'september'),

  ('CS111',    'Introduction to Computing and Information Systems',
   'liberal_arts_core', 'csis', 1, 1,  3, '{"lecture":2}', '', 'september'),

  ('ENGL112',  'Written and Oral Communication',
   'liberal_arts_core', 'hss', 1, 1,   3, '{"lecture":2}', '', 'september'),

  ('BUSA161',  'Foundations of Design and Entrepreneurship I',
   'liberal_arts_core', 'ba', 1, 1,    3, '{"lecture":2}', '', 'september'),

  ('AS111',    'Ashesi Success',
   'liberal_arts_core', 'hss', 1, 0,   3, '{"lecture":1}', '', 'september'),

  ('MATH142',  'Calculus II',
   'liberal_arts_core', 'hss', 1, 1,   3, '{"lecture":2}', '', 'september'),

  ('BUSA162',  'Foundations of Design and Entrepreneurship II',
   'liberal_arts_core', 'ba', 1, 1,    3, '{"lecture":2}', '', 'september'),

  ('SOAN111',  'Leadership Seminar I: What Makes a Good Leader?',
   'liberal_arts_core', 'hss', 1, 0.5, 10, '{"lecture":1}', '', 'september'),

  -- ── Year 1–2 — Liberal Arts Core ─────────────────────────
  ('ENGL113',  'Text and Meaning',
   'liberal_arts_core', 'hss', 1, 1,   3, '{"lecture":2}', '', 'september'),

  -- ── Year 2 — Major Core ───────────────────────────────────
  ('CS212',    'Computer Programming for CS',
   'required_major', 'csis', 2, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS213',    'Object-Oriented Programming',
   'required_major', 'csis', 2, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS221',    'Discrete Structures and Theory',
   'required_major', 'csis', 2, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS222',    'Data Structures and Algorithms',
   'required_major', 'csis', 2, 1,     2, '{"lecture":2}', '', 'september'),

  -- ── Year 2 — Liberal Arts Core ────────────────────────────
  ('ECON100',  'Principles of Economics',
   'liberal_arts_core', 'ba', 1, 1,    4, '{"lecture":2}', '', 'september'),

  ('MATH221',  'Statistics',
   'liberal_arts_core', 'hss', 2, 1,   3, '{"lecture":2}', '', 'september'),

  ('MATH212',  'Linear Algebra',
   'liberal_arts_core', 'hss', 2, 1,   2, '{"lecture":2}', '', 'september'),

  ('MATH211',  'Multivariable Calculus and Linear Algebra',
   'liberal_arts_core', 'hss', 2, 1,   2, '{"lecture":2}', '', 'september'),

  ('SOAN211',  'Leadership Seminar II: Rights, Ethics and Rule of Law',
   'liberal_arts_core', 'hss', 2, 0.5, 10, '{"lecture":1}', '', 'september'),

  -- ── Year 2 — Major Core ───────────────────────────────────
  ('CS254',    'Introduction to Artificial Intelligence',
   'required_major', 'csis', 2, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS323',    'Database Systems / Database Management',
   'required_major', 'csis', 3, 1,     2, '{"lecture":2}', '', 'september'),

  -- ── Year 3 — Major Core ───────────────────────────────────
  ('CS313',    'Intermediate Computer Programming',
   'required_major', 'csis', 3, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS330',    'Hardware and Systems Fundamentals',
   'required_major', 'csis', 3, 0.5,   2, '{"lecture":1}', '', 'september'),

  ('CS331',    'Computer Organization and Architecture',
   'required_major', 'csis', 3, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS341',    'Web Technologies',
   'required_major', 'csis', 3, 1,     2, '{"lecture":2}', '', 'september'),

  -- ── Year 3 — Liberal Arts Core ────────────────────────────
  ('SOAN311',  'Leadership Seminar III: The Economic Organization of a Good Society',
   'liberal_arts_core', 'hss', 3, 0.5, 6, '{"lecture":1}', '', 'september'),

  ('SOAN325',  'Research Methods',
   'liberal_arts_core', 'hss', 3, 1,   2, '{"lecture":2}', '', 'september'),

  ('SOAN328',  'Creative and Research Internship',
   'non_major_elective', 'hss', 3, 1,  2, '{"lecture":2}', '', 'september'),

  -- ── Year 3–4 — Major Electives ────────────────────────────
  ('CS361',    'Introduction to Modelling and Simulation',
   'major_elective', 'csis', 3, 0.5,   2, '{"lecture":1}', '', 'september'),

  ('CS459',    'Natural Language Processing',
   'major_elective', 'csis', 4, 1,     2, '{"lecture":2}', '', 'september'),

  -- ── Year 4 — Major Core ───────────────────────────────────
  ('CS415',    'Software Engineering',
   'required_major', 'csis', 4, 1,     2, '{"lecture":2}', '', 'september'),

  ('CS456',    'Algorithm Design and Analysis',
   'required_major', 'csis', 4, 1,     2, '{"lecture":2}', '', 'september'),

  -- ── Year 4 — Liberal Arts Core ────────────────────────────
  ('SOAN411',  'Leadership Seminar IV: Leadership as Service',
   'liberal_arts_core', 'hss', 4, 1,   6, '{"lecture":2}', '', 'september')

ON CONFLICT (code) DO UPDATE SET
  title               = EXCLUDED.title,
  type                = EXCLUDED.type,
  program             = EXCLUDED.program,
  level               = EXCLUDED.level,
  credits             = EXCLUDED.credits,
  sections            = EXCLUDED.sections,
  sessions            = EXCLUDED.sessions,
  requires_room_type  = EXCLUDED.requires_room_type,
  intake              = EXCLUDED.intake;
