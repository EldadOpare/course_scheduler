// The placeholder "teacher" the engine uses while a timetable is being
// built before lecturers are assigned. Must match UNASSIGNED_FACULTY in
// timetabler/models.py. Kept in one place so a typo can't silently break
// the placeholder logic.
export const UNASSIGNED_FACULTY = "__unassigned__";

export interface Window_ {
  day: string;
  start: string;
  end: string;
}

export interface Course {
  code: string;
  title: string;
  type: string;
  program: string;
  level: number;
  majors: string[];
  prerequisites: string[];
  credits: number;
  expected_enrollment: number;
  sections: number;
  sessions: Record<string, number>;
  requires_room_type: string;
  intake: string;
}

export interface Faculty {
  id: string;
  name: string;
  type: string;
  load_target: number;
  max_overload: number;
  max_hours_per_day?: number; // default 6, enforced as a hard daily cap
  approved_courses: string[];
  availability: Window_[];
  preferred_times: Window_[];
}

export interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  equipment: string[];
  restricted_to?: string[]; // programs allowed; empty = any
  building: string;
}

export interface Placement {
  course: string;
  section: number;
  kind: string;
  index: number;
  day: string;
  start: string;
  room: string;
  faculty: string;
  assistant?: string; // optional faculty intern (FI) assisting the lecturer
}

export interface MeetingKey {
  course: string;
  section: number;
  kind: string;
  index: number;
}

export interface Timegrid {
  weekdays: string[];
  weekend: string[];
  day_start: number;
  day_end: number;
  lecture_starts: number[];
  discussion_starts: number[];
  lab_starts: number[];
  weekend_starts: number[];
}

export interface YearGroup {
  id: string;          // "yg_2025_y1"
  label: string;       // e.g. "Year 1, Sept 2025"
  year: number;        // 1 | 2 | 3 | 4
  intake: string;      // "september"
  capacity: number;    // total students in this cohort
}

export interface Major {
  id: string;          // "cs", "ba", "ee", "mba"
  name: string;        // "Computer Science"
  counts: Record<number, number>; // { 1: 85, 2: 72, 3: 68, 4: 55 }
}

export interface AcademicSemester {
  id: string;          // "sem_2025_s1"
  name: string;        // e.g. "Semester 1, 2025/2026"
  academic_year: string; // "2025/2026"
  number: 1 | 2;
  start_date: string;  // "2025-09-01"
  weeks: number;
  active_years: number[]; // [1, 2, 3, 4]
}

export interface ElectivePool {
  id: string;          // "pool_a"
  label: string;       // "Science electives"
  kind: "major" | "free"; // major-programme vs open/non-major
  pick: number;        // how many to choose
  courses: string[];   // course codes
}

export interface CoursePlan {
  id: string;          // "${major_id}_y${year}_s${semester}"
  major_id: string;
  year: number;
  semester: 1 | 2;
  mandatory: string[];         // course codes every student must take
  elective_pools: ElectivePool[];
}

export interface SchedulingRules {
  min_break: number;   // minutes between classes still counted back-to-back
  max_gap: number;     // idle gap above this is penalised
  lunch_start: number; // minutes since midnight
  lunch_end: number;
  lunch_min: number;   // minimum free stretch students need in the window
}

export const DEFAULT_RULES: SchedulingRules = {
  min_break: 15,
  max_gap: 180,
  lunch_start: 690,
  lunch_end: 810,
  lunch_min: 30,
};

export interface Dataset {
  courses: Course[];
  faculty: Faculty[];
  rooms: Room[];
  cohorts: string[];
  timegrid: Timegrid;
  durations: Record<string, number>;
  rules: SchedulingRules;
  // academic structure (optional, added progressively)
  year_groups?: YearGroup[];
  majors?: Major[];
  semesters?: AcademicSemester[];
  course_plans?: CoursePlan[];
}

export interface Violation {
  code: string;
  message: string;
}

export interface Penalty {
  code: string;
  weight: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  penalties: Penalty[];
  score: number;
  flagged: string[];
}

export interface UnplacedMeeting {
  course: string;
  section: number;
  kind: string;
  index: number;
  reason: string;
}

export interface GenerateOption {
  label: string;
  score: number;
  complete: boolean;
  placements: Placement[];
  penalties: Penalty[];
  violations: Violation[];
  unplaced: UnplacedMeeting[];
}

export interface SemesterSimResult {
  semester: 1 | 2;
  complete: boolean;
  score: number;
  placed: number;
  total_meetings: number;
  courses_in_play: number;
  students: number;
  unplaced: UnplacedMeeting[];
  top_penalties: string[];
  note?: string;
}

export interface SimulateResult {
  semesters: SemesterSimResult[];
  feasible: boolean;
  error: string | null;
}

// A named timetable the registry switches between (e.g. "Sem 1 2026").
// Its placements live in the placements table keyed by this id; its
// course/room picks and published state live on the row itself.
export interface TimetableSession {
  id: string;
  label: string;
  active_courses: Record<string, number> | null;
  active_rooms: string[] | null;
  published_at: string | null;  // set = published/locked; null = draft
  created_at: string;
}

export interface TimetableSnapshot {
  id: string;
  label: string;
  note: string;
  placements: Placement[];
  score: number | null;
  valid: boolean | null;
  created_at: string;
}

export interface PlaceOption {
  day: string;
  start: string;
  end: string;
  room: string;
  room_name: string;
  faculty: string;
  faculty_name: string;
  penalty: number;
  percent: number;
}

export function mkKey(p: MeetingKey) {
  return `${p.course}|${p.section}|${p.kind}|${p.index}`;
}

export function pmTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function ftTime(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// Cohort 1 shows as "A", 2 as "B", and so on, matching how the
// university names its teaching cohorts.
export function cohortLetter(n: number) {
  return n >= 1 && n <= 26 ? String.fromCharCode(64 + n) : `#${n}`;
}
