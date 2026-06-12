-- =============================================================
-- Ashesi Timetabler — seed: rooms, majors, year groups
-- Run after 004_seed_faculty.sql
-- =============================================================

-- ── Classrooms / Lecture Halls ────────────────────────────────
INSERT INTO public.rooms (id, name, type, capacity, equipment, restricted_to, building)
VALUES
  ('nutor-100',    'Nutor 100',              'lecture_hall', 250, '{}', '{}', ''),
  ('nutor-115',    'Nutor 115',              'lecture_hall', 150, '{}', '{}', ''),
  ('norton-207a',  'Norton Motulsky 207A',   'lecture_hall', 250, '{}', '{}', ''),
  ('norton-207b',  'Norton Motulsky 207B',   'lecture_hall', 250, '{}', '{}', ''),
  ('databank-218', 'Databank 218',           'classroom',    100, '{}', '{}', ''),
  ('lab-222',      'Lab 222',                'lab',           75, '{}', '{}', ''),
  ('lab-221',      'Lab 221',                'lab',           75, '{}', '{}', ''),
  ('jackson-115',  'Jackson Hall 115',       'classroom',    100, '{}', '{}', ''),
  ('jackson-116',  'Jackson Hall 116',       'classroom',    100, '{}', '{}', '')
ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  type          = EXCLUDED.type,
  capacity      = EXCLUDED.capacity;

-- ── Majors ────────────────────────────────────────────────────
-- counts will be filled in later: { "1": <yr1 headcount>, "2": ..., "3": ..., "4": ... }
INSERT INTO public.majors (id, name, counts)
VALUES
  -- Undergraduate
  ('ba',       'Business Administration',                    '{}'),
  ('mis',      'Management Information Systems',             '{}'),
  ('cs',       'Computer Science',                           '{}'),
  ('llb',      'Law with Public Policy',                     '{}'),
  ('bioe',     'Biological Engineering',                     '{}'),
  ('ce',       'Computer Engineering',                       '{}'),
  ('eee',      'Electrical and Electronic Engineering',      '{}'),
  ('me',       'Mechanical Engineering',                     '{}'),
  ('mec',      'Mechatronics Engineering',                   '{}'),
  ('econ',     'Economics',                                  '{}'),
  -- Graduate
  ('mba',      'Master of Business Administration',          '{}'),
  ('msc-ics',  'MSc in Intelligent Computing Systems',       '{}'),
  ('msc-me',   'MSc in Mechatronic Engineering',             '{}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name;

-- ── Year Groups ───────────────────────────────────────────────
-- year  = graduation year
-- label = display name shown in the UI
-- capacity = total headcount across all majors for that cohort (fill in later)
INSERT INTO public.year_groups (id, label, year, intake, capacity)
VALUES
  ('class-2027',  'Class of 2027',   2027, 'september', 0),
  ('class-2028',  'Class of 2028',   2028, 'september', 0),
  ('class-2029a', 'Class of 2029 A', 2029, 'september', 0),
  ('class-2029b', 'Class of 2029 B', 2029, 'january',   0),
  ('class-2030a', 'Class of 2030 A', 2030, 'september', 0)
ON CONFLICT (id) DO UPDATE SET
  label    = EXCLUDED.label,
  year     = EXCLUDED.year,
  intake   = EXCLUDED.intake;
