-- =============================================================
-- Ashesi Timetabler — seed: faculty
-- Source: CAMU course listing (Semester 3, 2025-2026)
-- Run after 003_seed_courses_extended.sql
-- =============================================================
-- approved_courses lists every course they were seen teaching.
-- load_target / max_overload are defaults; adjust per contract.
-- =============================================================

INSERT INTO public.faculty
  (id, name, type, approved_courses)
VALUES

  -- ── CSIS department ───────────────────────────────────────
  ('justice-appati',       'Justice Kwame Appati',    'full_time', ARRAY['MATH121']),
  ('rebecca-awuah',        'Rebecca Awuah',           'full_time', ARRAY['MATH122']),
  ('enock-opoku',          'Enock Opoku',             'full_time', ARRAY['MATH144','MATH223']),
  ('eric-ocran',           'Eric Ocran',              'full_time', ARRAY['MATH223']),
  ('emmanuel-annor',       'Emmanuel Annor',          'full_time', ARRAY['MATH223']),
  ('pius-gadosey',         'Pius Gadosey',            'full_time', ARRAY['CS112']),
  ('daniel-sewory',        'Daniel Mawuli Sewory',    'full_time', ARRAY['CS112']),
  ('daniel-byiringiro',    'Daniel Byiringiro',       'full_time', ARRAY['CS112']),
  ('barbara-marie-doh',    'Barbara-Marie Doh',       'full_time', ARRAY['CS112']),
  ('selasi-ocloo',         'Selasi Kwaku Ocloo',      'full_time', ARRAY['MATH251','MATH211']),
  ('eugene-adjei',         'Eugene Adjei',            'full_time', ARRAY['MATH251']),
  ('bright-antwi',         'Bright Anim Antwi',       'full_time', ARRAY['MATH251','MATH211']),
  ('abubakar-essel',       'Abubakar Essel',          'full_time', ARRAY['MATH251','MATH211']),
  ('noah-adasi',           'Noah Adasi',              'full_time', ARRAY['MATH251']),
  ('patrick-dwomfuor',     'Patrick Dwomfuor',        'full_time', ARRAY['MATH211']),
  ('james-okae',           'James Okae',              'full_time', ARRAY['CS452']),
  ('dave-donbo',           'Dave Leori Donbo',        'full_time', ARRAY['CS452']),
  ('jamal-deen-abdulai',   'Jamal-Deen Abdulai',      'full_time', ARRAY['CS432']),
  ('charles-adjetey',      'Charles Adjetey',         'full_time', ARRAY['CS433']),

  -- ── HSS department ────────────────────────────────────────
  ('philip-aka',           'Philip Aka',              'full_time', ARRAY['POLS322']),
  ('joseph-oduro-frimpong','Joseph Oduro-Frimpong',   'full_time', ARRAY['SOAN225']),
  ('joseph-asare',         'Joseph Mensah Asare',     'full_time', ARRAY['SOAN225','SOAN242']),
  ('nii-tete-yartey',      'Nii-Tete Yartey',         'full_time', ARRAY['SOAN242']),
  ('richard-ekumah',       'Richard Ekumah',          'full_time', ARRAY['POLS335']),
  ('ebenezer-addo',        'Ebenezer Obiri Addo',     'full_time', ARRAY['SOAN303']),
  ('david-boateng',        'David Asiamah Boateng',   'full_time', ARRAY['SOAN303','SOAN320']),
  ('gideon-hosu-porbley',  'Gideon Hosu-Porbley',     'full_time', ARRAY['SOAN320']),
  ('theodora-aryee',       'Theodora Aryee',          'full_time', ARRAY['SOAN320']),

  -- ── BA department ─────────────────────────────────────────
  ('mercy-desouza',        'Mercy DeSouza',           'full_time', ARRAY['BUSA430','BUSA132']),
  ('ishmael-asiedu',       'Ishmael Asiedu',          'full_time', ARRAY['BUSA430','BUSA132']),
  ('phyllis-swanzy-krah',  'Phyllis Swanzy-Krah',     'full_time', ARRAY['BUSA132']),
  ('deborah-benning',      'Deborah Benning',         'full_time', ARRAY['BUSA132']),

  -- ── ENGR department ───────────────────────────────────────
  ('miriam-abade-abugre',  'Miriam Abade-Abugre',     'full_time', ARRAY['ME101']),
  ('keziah-noamesi',       'Keziah Noamesi',          'full_time', ARRAY['ME101']),
  ('wendy-osei',           'Wendy Osei',              'full_time', ARRAY['ME101'])

ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  type             = EXCLUDED.type,
  approved_courses = EXCLUDED.approved_courses;
