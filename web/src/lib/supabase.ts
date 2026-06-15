import { createClient } from "@supabase/supabase-js";
import type {
  Dataset, Placement, SchedulingRules, Timegrid, TimetableSnapshot, TimetableSession,
} from "@/types";
import { DEFAULT_RULES } from "@/types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const SUPABASE_CONFIGURED = !!(url && key);

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder",
);

const DEFAULT_TIMEGRID: Timegrid = {
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  weekend: ["Sat", "Sun"],
  day_start: 480,
  day_end: 990,
  lecture_starts: [480, 585, 690, 795, 900],
  discussion_starts: [480, 585, 690, 795, 900],
  lab_starts: [480, 690, 795],
  weekend_starts: [510, 720],
};

export async function loadDataset(): Promise<Dataset | null> {
  if (!SUPABASE_CONFIGURED) return null;

  const [
    { data: courses },
    { data: faculty },
    { data: rooms },
    { data: yearGroups },
    { data: majors },
    { data: acSemesters },
    { data: coursePlans },
    { data: settings },
  ] = await Promise.all([
    supabase.from("courses").select("*").order("code"),
    supabase.from("faculty").select("*").order("name"),
    supabase.from("rooms").select("*").order("id"),
    supabase.from("year_groups").select("*").order("year"),
    supabase.from("majors").select("*").order("name"),
    supabase.from("academic_semesters").select("*").order("academic_year").order("number"),
    supabase.from("course_plans").select("*"),
    supabase.from("settings").select("*"),
  ]);

  const timegrid: Timegrid =
    (settings?.find(s => s.key === "timegrid")?.value as Timegrid) ?? DEFAULT_TIMEGRID;
  const durations: Record<string, number> =
    (settings?.find(s => s.key === "durations")?.value as Record<string, number>) ??
    { lecture: 90, discussion: 60, lab: 180 };
  const rules: SchedulingRules = {
    ...DEFAULT_RULES,
    ...((settings?.find(s => s.key === "rules")?.value as Partial<SchedulingRules>) ?? {}),
  };

  return {
    courses: courses ?? [],
    faculty: faculty ?? [],
    rooms: rooms ?? [],
    cohorts: [],
    timegrid,
    durations,
    rules,
    year_groups: yearGroups ?? [],
    majors: majors ?? [],
    semesters: acSemesters ?? [],
    course_plans: coursePlans ?? [],
  };
}

function rowToSession(r: Record<string, unknown>): TimetableSession {
  return {
    id: r.id as string,
    label: (r.label as string) ?? "Untitled",
    active_courses: (r.active_courses as Record<string, number> | null) ?? null,
    active_rooms: (r.active_rooms as string[] | null) ?? null,
    published_at: (r.published_at as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

// All sessions, newest first. Ensures at least one exists so the app
// always has a board to show.
export async function listSessions(): Promise<TimetableSession[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const { data } = await supabase
    .from("timetable_sessions")
    .select("*")
    .order("created_at", { ascending: false });
  let rows = data ?? [];
  if (!rows.length) {
    const { data: created } = await supabase
      .from("timetable_sessions")
      .insert({ label: "Semester 1" })
      .select("*")
      .single();
    if (created) rows = [created];
  }
  return rows.map(rowToSession);
}

export async function createSession(label: string): Promise<TimetableSession | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const { data } = await supabase
    .from("timetable_sessions")
    .insert({ label })
    .select("*")
    .single();
  return data ? rowToSession(data) : null;
}

export async function renameSession(id: string, label: string): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  await supabase.from("timetable_sessions").update({ label }).eq("id", id);
}

export async function deleteSession(id: string): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  await supabase.from("timetable_sessions").delete().eq("id", id);
}

export async function setSessionPublished(id: string, published: boolean): Promise<string | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const published_at = published ? new Date().toISOString() : null;
  await supabase.from("timetable_sessions").update({ published_at }).eq("id", id);
  return published_at;
}

export async function saveSessionPicks(
  id: string,
  active_courses: Record<string, number> | null,
  active_rooms: string[] | null,
): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  await supabase.from("timetable_sessions")
    .update({ active_courses, active_rooms }).eq("id", id);
}

export async function loadSessionPlacements(sessionId: string) {
  const { data, error } = await supabase
    .from("placements")
    .select("*")
    .eq("semester_id", sessionId);
  if (error || !data) return [];
  return data.map(r => ({
    course: r.course,
    section: r.section,
    kind: r.kind,
    index: r.index_,
    day: r.day,
    start: r.start_time,
    room: r.room,
    faculty: r.faculty,
    assistant: r.assistant ?? undefined,
  }));
}

export async function listSnapshots(): Promise<TimetableSnapshot[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const { data } = await supabase
    .from("timetable_snapshots")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as TimetableSnapshot[]) ?? [];
}

export async function saveSnapshot(
  label: string,
  placements: Placement[],
  meta: { note?: string; score?: number | null; valid?: boolean | null } = {},
): Promise<TimetableSnapshot | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const { data } = await supabase
    .from("timetable_snapshots")
    .insert({
      label,
      note: meta.note ?? "",
      placements,
      score: meta.score ?? null,
      valid: meta.valid ?? null,
    })
    .select("*")
    .single();
  return (data as TimetableSnapshot) ?? null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await supabase.from("timetable_snapshots").delete().eq("id", id);
}
