-- =============================================================
-- Ashesi Timetabler — seed: SEMESTER 1 course plans
-- Source: year_round_courses.xlsx → 'Summary for easy registration'
-- Year mapping: Class of 2028 = Year 1, 2027 = Year 2,
--               2026 = Year 3, 2025 = Year 4.  semester = 1.
-- Generic 'Elective'/'Non-Major Elective'/'Capstone' choices are
-- student-selected and not listed as mandatory here.
-- Course codes for new entries are assigned (not yet confirmed
-- against CAMU) — adjust codes if the registry differs.
-- Run after 005_seed_rooms_majors_yeargroups.sql
-- =============================================================

-- ── New courses referenced by the plans ──────────────────────
INSERT INTO public.courses
  (code, title, type, program, level, credits, sections, sessions, requires_room_type, intake)
VALUES
  ('MATH120', 'College Algebra', 'required_major', 'csis', 1, 1, 1, '{"lecture":2}', '', 'september'),
  ('MATH151', 'Engineering Calculus', 'required_major', 'engr', 1, 1, 1, '{"lecture":2}', '', 'september'),
  ('ENGR101', 'Introduction to Engineering', 'required_major', 'engr', 1, 1, 1, '{"lecture":2}', '', 'september'),
  ('BUSA235', 'Marketing', 'required_major', 'ba', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('ECON101', 'Principles of Macroeconomics', 'required_major', 'econ', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('BUSA210', 'Introduction to Finance', 'required_major', 'ba', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('ECON240', 'Introduction to Environmental Economics', 'required_major', 'econ', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('ECON230', 'The Economy of Ghana', 'required_major', 'econ', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('EE201', 'Circuits and Electronics', 'required_major', 'engr', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('ENGR210', 'Materials Science & Chemistry', 'required_major', 'engr', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('CS215', 'Applied Programming for Engineers', 'required_major', 'engr', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('LAW111', 'Ghana Legal System & Methods', 'required_major', 'law', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('LAW112', 'Legal Writing', 'required_major', 'law', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('LAW121', 'Constitutional Law I', 'required_major', 'law', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('LAW131', 'Contract Law I', 'required_major', 'law', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('LAW141', 'Language for Law', 'required_major', 'law', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('POLS200', 'Introduction to Public Policy', 'required_major', 'hss', 2, 1, 1, '{"lecture":2}', '', 'september'),
  ('BUSA320', 'Managerial Accounting', 'required_major', 'ba', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('BUSA340', 'Business Law', 'required_major', 'ba', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ECON302', 'Intermediate Microeconomic Theory II', 'required_major', 'econ', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ECON312', 'Intermediate Macroeconomic Theory II', 'required_major', 'econ', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ECON320', 'Econometrics I', 'required_major', 'econ', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('MIS310', 'IT Infrastructure & Systems Administration', 'required_major', 'csis', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('MIS320', 'IS Project Management', 'required_major', 'csis', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ENGR340', 'Control Systems', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('EE330', 'Communication Systems', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('EE340', 'Electrical Machines & Power Electronics II', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('CE320', 'Digital Systems Design', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ME320', 'Manufacturing Processes', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ME330', 'Mechanical Machine Design', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('ME340', 'Fluid Mechanics & Applications', 'required_major', 'engr', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('CS340', 'Introduction to AI Robotics', 'required_major', 'csis', 3, 1, 1, '{"lecture":2}', '', 'september'),
  ('BUSA450', 'Competitive Strategy', 'required_major', 'ba', 4, 1, 1, '{"lecture":2}', '', 'september'),
  ('ENGR440', 'Project Management and Professional Practice', 'required_major', 'engr', 4, 1, 1, '{"lecture":2}', '', 'september'),
  ('ENGR450', 'Senior Project & Seminar', 'required_major', 'engr', 4, 1, 1, '{"lecture":2}', '', 'september'),
  ('MEC420', 'Mechatronics', 'required_major', 'engr', 4, 1, 1, '{"lecture":2}', '', 'september')
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title, program = EXCLUDED.program, level = EXCLUDED.level;

-- ── Course plans (semester 1) ────────────────────────────────
INSERT INTO public.course_plans (id, major_id, year, semester, mandatory, elective_pools)
VALUES
  ('ba_y1_s1', 'ba', 1, 1, ARRAY['BUSA161','MATH141','CS111','ENGL112','AS111'], '[]'),
  ('econ_y1_s1', 'econ', 1, 1, ARRAY['BUSA161','MATH141','CS111','ENGL112','AS111'], '[]'),
  ('mis_y1_s1', 'mis', 1, 1, ARRAY['BUSA161','MATH141','CS111','ENGL112','AS111'], '[]'),
  ('cs_y1_s1', 'cs', 1, 1, ARRAY['BUSA161','MATH141','CS111','ENGL112','AS111'], '[]'),
  ('eee_y1_s1', 'eee', 1, 1, ARRAY['BUSA161','MATH151','ENGR101','ENGL112','AS111'], '[]'),
  ('me_y1_s1', 'me', 1, 1, ARRAY['BUSA161','MATH151','ENGR101','ENGL112','AS111'], '[]'),
  ('ce_y1_s1', 'ce', 1, 1, ARRAY['BUSA161','MATH151','ENGR101','ENGL112','AS111'], '[]'),
  ('mec_y1_s1', 'mec', 1, 1, ARRAY['BUSA161','MATH151','ENGR101','ENGL112','AS111'], '[]'),
  ('llb_y1_s1', 'llb', 1, 1, ARRAY['BUSA161','MATH120','CS111','ENGL112'], '[]'),
  ('ba_y2_s1', 'ba', 2, 1, ARRAY['BUSA235','ECON101','BUSA210','MATH223','SOAN311'], '[]'),
  ('econ_y2_s1', 'econ', 2, 1, ARRAY['ECON101','ECON240','ECON230','SOAN311'], '[]'),
  ('mis_y2_s1', 'mis', 2, 1, ARRAY['CS323','CS254','MATH223','SOAN311'], '[]'),
  ('cs_y2_s1', 'cs', 2, 1, ARRAY['CS323','CS254','CS222','MATH212','SOAN311'], '[]'),
  ('eee_y2_s1', 'eee', 2, 1, ARRAY['EE201','ENGR210','MATH251','CS215','ENGL113','SOAN311'], '[]'),
  ('me_y2_s1', 'me', 2, 1, ARRAY['EE201','ENGR210','MATH251','CS215','ENGL113','SOAN311'], '[]'),
  ('ce_y2_s1', 'ce', 2, 1, ARRAY['EE201','ENGR210','MATH251','CS215','ENGL113','SOAN311'], '[]'),
  ('mec_y2_s1', 'mec', 2, 1, ARRAY['EE201','CS254','MATH251','CS215','ENGL113','SOAN311'], '[]'),
  ('llb_y2_s1', 'llb', 2, 1, ARRAY['LAW111','LAW112','LAW121','LAW131','POLS200'], '[]'),
  ('ba_y3_s1', 'ba', 3, 1, ARRAY['BUSA320','SOAN325','BUSA340'], '[]'),
  ('econ_y3_s1', 'econ', 3, 1, ARRAY['ECON302','ECON312','ECON320','SOAN325','BUSA340'], '[]'),
  ('mis_y3_s1', 'mis', 3, 1, ARRAY['MIS310','MIS320','SOAN325'], '[]'),
  ('cs_y3_s1', 'cs', 3, 1, ARRAY['CS415','CS331','SOAN325','CS361'], '[]'),
  ('eee_y3_s1', 'eee', 3, 1, ARRAY['ENGR340','EE330','EE340','CE320'], '[]'),
  ('me_y3_s1', 'me', 3, 1, ARRAY['ENGR340','ME320','ME330','ME340'], '[]'),
  ('ce_y3_s1', 'ce', 3, 1, ARRAY['ENGR340','CS222','CS432','CE320'], '[]'),
  ('mec_y3_s1', 'mec', 3, 1, ARRAY['ENGR340','CS340','ME330','CE320','CS254'], '[]'),
  ('llb_y3_s1', 'llb', 3, 1, ARRAY['LAW111','LAW112','LAW121','LAW131','POLS200','LAW141'], '[]'),
  ('ba_y4_s1', 'ba', 4, 1, ARRAY['BUSA450'], '[]'),
  ('mis_y4_s1', 'mis', 4, 1, ARRAY['BUSA450'], '[]'),
  ('cs_y4_s1', 'cs', 4, 1, ARRAY['CS432'], '[]'),
  ('eee_y4_s1', 'eee', 4, 1, ARRAY['ENGR440','ENGR450'], '[]'),
  ('me_y4_s1', 'me', 4, 1, ARRAY['ENGR440','ENGR450'], '[]'),
  ('ce_y4_s1', 'ce', 4, 1, ARRAY['ENGR440','ENGR450'], '[]'),
  ('mec_y4_s1', 'mec', 4, 1, ARRAY['ENGR440','MEC420','ENGR450'], '[]')
ON CONFLICT (id) DO UPDATE SET
  mandatory = EXCLUDED.mandatory, elective_pools = EXCLUDED.elective_pools;
