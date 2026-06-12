-- =============================================================
-- Ashesi Timetabler — seed: extended course catalogue
-- Source: CAMU timetable / course listing (Semester 3, 2025-2026)
-- Run after 002_seed_courses.sql
-- =============================================================

INSERT INTO public.courses
  (code, title, type, program, level, credits, sections, sessions, requires_room_type, intake)
VALUES

  -- ── Pre-Calculus (bridging) ───────────────────────────────
  ('MATH121',  'Pre-Calculus I',
   'liberal_arts_core', 'csis', 1, 1,   2, '{"lecture":2}', '', 'september'),

  ('MATH122',  'Pre-Calculus II',
   'liberal_arts_core', 'csis', 1, 1,   2, '{"lecture":2}', '', 'september'),

  -- ── Year 1 — Liberal Arts Core ────────────────────────────
  ('MATH144',  'Applied Calculus',
   'liberal_arts_core', 'csis', 1, 1,   2, '{"lecture":2}', '', 'september'),

  ('CS112',    'Computer Programming for Engineering',
   'liberal_arts_core', 'csis', 1, 1,   2, '{"lecture":2,"lab":1}', 'lab', 'september'),

  ('BUSA132',  'Organizational Behaviour',
   'required_major', 'ba', 1, 1,         2, '{"lecture":2}', '', 'september'),

  ('ME101',    'Engineering Mechanics',
   'required_major', 'engr', 1, 1,       2, '{"lecture":2,"lab":1}', 'lab', 'september'),

  -- ── Year 2 — Liberal Arts Core ────────────────────────────
  ('MATH223',  'Quantitative Methods',
   'liberal_arts_core', 'csis', 2, 1,   2, '{"lecture":2}', '', 'september'),

  ('MATH251',  'Differential Equations and Numerical Methods',
   'liberal_arts_core', 'csis', 2, 1,   2, '{"lecture":2}', '', 'september'),

  ('SOAN225',  'Ghanaian Popular Culture',
   'non_major_elective', 'hss', 2, 1,   1, '{"lecture":2,"discussion":1}', '', 'september'),

  ('SOAN242',  'Modern Dance Traditions of Ghana',
   'non_major_elective', 'hss', 2, 1,   1, '{"lecture":2,"discussion":1}', '', 'september'),

  -- ── Year 3 — Liberal Arts Core / Electives ────────────────
  ('POLS322',  'China-Africa Relations',
   'non_major_elective', 'hss', 3, 1,   1, '{"lecture":2,"discussion":1}', '', 'september'),

  ('SOAN303',  'Living Ghana''s History, Culture, and Politics',
   'non_major_elective', 'hss', 3, 1,   1, '{"lecture":2,"discussion":1}', '', 'september'),

  ('SOAN320',  'World Hunger, Population and Food Supplies',
   'non_major_elective', 'hss', 3, 1,   1, '{"lecture":2,"discussion":1}', '', 'september'),

  ('POLS335',  'Introduction to Public Policy: Africa Health Collaborative',
   'non_major_elective', 'hss', 3, 1,   1, '{"lecture":2}', '', 'september'),

  -- ── Year 4 — Major Core (CS) ──────────────────────────────
  ('CS432',    'Networks and Data Communication',
   'required_major', 'csis', 4, 1,      2, '{"lecture":2}', '', 'september'),

  ('CS433',    'Operating Systems and Systems Administration',
   'required_major', 'csis', 4, 1,      2, '{"lecture":1,"lab":1}', 'lab', 'september'),

  -- ── Year 4 — Major Electives ──────────────────────────────
  ('CS452',    'Machine Learning',
   'major_elective', 'csis', 4, 1,      2, '{"lecture":2,"lab":1}', '', 'september'),

  ('BUSA430',  'Human Resource Management',
   'major_elective', 'ba', 4, 1,        1, '{"lecture":2,"discussion":1}', '', 'september')

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
