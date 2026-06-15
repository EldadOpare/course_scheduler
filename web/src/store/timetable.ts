import { create } from "zustand";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import type {
  Dataset, Placement, ValidationResult, SchedulingRules,
  Faculty, Room, Course, YearGroup, Major, AcademicSemester, CoursePlan,
} from "@/types";
import { mkKey } from "@/types";

interface TimetableState {
  dataset: Dataset | null;
  placements: Placement[];
  validation: ValidationResult | null;
  semesterId: string | null;
  isLoading: boolean;

  // What's running this semester. null = nothing chosen yet (the
  // unscheduled tray starts empty — the registrar picks courses in).
  // activeCourses maps a course code to the number of cohorts/sections
  // it should run this semester, so cohort count is configurable per
  // course after it's brought in.
  activeCourses: Record<string, number> | null;
  activeRooms: string[] | null;

  setDataset:    (ds: Dataset) => void;
  setPlacements: (p: Placement[]) => void;
  setValidation: (v: ValidationResult | null) => void;
  setSemesterId: (id: string) => void;
  setActiveCourses: (courses: Record<string, number> | null) => void;
  setActiveRooms:   (ids: string[] | null) => void;

  upsertPlacement: (p: Placement) => void;
  removePlacement: (key: string) => void;
  applyDraft:      (placements: Placement[]) => void;
  updateRules:     (rules: SchedulingRules) => void;

  upsertRoom:       (r: Room) => void;
  removeRoom:       (id: string) => void;
  upsertCourse:     (c: Course) => void;
  removeCourse:     (code: string) => void;
  upsertFaculty:    (f: Faculty) => void;
  removeFaculty:    (id: string) => void;
  upsertYearGroup:  (yg: YearGroup) => void;
  removeYearGroup:  (id: string) => void;
  upsertMajor:      (m: Major) => void;
  removeMajor:      (id: string) => void;
  upsertSemester:   (s: AcademicSemester) => void;
  removeSemester:   (id: string) => void;
  upsertCoursePlan: (cp: CoursePlan) => void;
  removeCoursePlan: (id: string) => void;
}

export const useTimetable = create<TimetableState>((set, get) => ({
  dataset:     null,
  placements:  [],
  validation:  null,
  semesterId:  null,
  isLoading:   false,
  activeCourses: null,
  activeRooms:   null,

  setDataset:    (ds) => set({ dataset: ds }),
  setValidation: (v)  => set({ validation: v }),
  setSemesterId: (id) => set({ semesterId: id }),
  setPlacements: (placements) => set({ placements }),

  setActiveCourses: (courses) => {
    set({ activeCourses: courses });
    if (SUPABASE_CONFIGURED) {
      supabase.from("settings")
        .upsert({ key: "active_courses", value: { map: courses } }).then();
    }
  },
  setActiveRooms: (ids) => {
    set({ activeRooms: ids });
    if (SUPABASE_CONFIGURED) {
      supabase.from("settings")
        .upsert({ key: "active_rooms", value: { items: ids } }).then();
    }
  },

  upsertPlacement: (p) => {
    const k = mkKey(p);
    set((s) => ({ placements: [...s.placements.filter(x => mkKey(x) !== k), p] }));
    const sid = get().semesterId;
    if (sid && sid !== "offline") persistPlacement(sid, p);
  },
  removePlacement: (key) => {
    set((s) => ({ placements: s.placements.filter(x => mkKey(x) !== key) }));
    const sid = get().semesterId;
    const [course, sec, kind, idx] = key.split("|");
    if (sid && sid !== "offline") deletePlacement(sid, course, Number(sec), kind, Number(idx));
  },

  // I replaced the whole timetable in one shot here (instead of one
  // upsert per meeting) so applying a generated draft felt instant and
  // never left half-saved leftovers in the database.
  applyDraft: (placements) => {
    set({ placements, validation: null });
    const sid = get().semesterId;
    if (sid && sid !== "offline") replaceSessionPlacements(sid, placements);
  },

  updateRules: (rules) => {
    set((s) => (s.dataset ? { dataset: { ...s.dataset, rules } } : s));
    if (SUPABASE_CONFIGURED) {
      supabase.from("settings").upsert({ key: "rules", value: rules }).then();
    }
  },

  upsertRoom: (r) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.rooms;
      return { dataset: { ...s.dataset, rooms: list.some(x => x.id === r.id) ? list.map(x => x.id === r.id ? r : x) : [...list, r] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("rooms").upsert(r).then();
  },
  removeRoom: (id) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, rooms: s.dataset.rooms.filter(r => r.id !== id) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("rooms").delete().eq("id", id).then();
  },

  upsertCourse: (c) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.courses;
      return { dataset: { ...s.dataset, courses: list.some(x => x.code === c.code) ? list.map(x => x.code === c.code ? c : x) : [...list, c] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("courses").upsert(c).then();
  },
  removeCourse: (code) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, courses: s.dataset.courses.filter(c => c.code !== code) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("courses").delete().eq("code", code).then();
  },

  upsertFaculty: (f) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.faculty;
      return { dataset: { ...s.dataset, faculty: list.some(x => x.id === f.id) ? list.map(x => x.id === f.id ? f : x) : [...list, f] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("faculty").upsert(f).then();
  },
  removeFaculty: (id) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, faculty: s.dataset.faculty.filter(f => f.id !== id) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("faculty").delete().eq("id", id).then();
  },

  upsertYearGroup: (yg) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.year_groups ?? [];
      return { dataset: { ...s.dataset, year_groups: list.some(x => x.id === yg.id) ? list.map(x => x.id === yg.id ? yg : x) : [...list, yg] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("year_groups").upsert(yg).then();
  },
  removeYearGroup: (id) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, year_groups: (s.dataset.year_groups ?? []).filter(x => x.id !== id) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("year_groups").delete().eq("id", id).then();
  },

  upsertMajor: (m) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.majors ?? [];
      return { dataset: { ...s.dataset, majors: list.some(x => x.id === m.id) ? list.map(x => x.id === m.id ? m : x) : [...list, m] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("majors").upsert(m).then();
  },
  removeMajor: (id) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, majors: (s.dataset.majors ?? []).filter(x => x.id !== id) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("majors").delete().eq("id", id).then();
  },

  upsertSemester: (sem) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.semesters ?? [];
      return { dataset: { ...s.dataset, semesters: list.some(x => x.id === sem.id) ? list.map(x => x.id === sem.id ? sem : x) : [...list, sem] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("academic_semesters").upsert(sem).then();
  },
  removeSemester: (id) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, semesters: (s.dataset.semesters ?? []).filter(x => x.id !== id) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("academic_semesters").delete().eq("id", id).then();
  },

  upsertCoursePlan: (cp) => {
    set((s) => {
      if (!s.dataset) return s;
      const list = s.dataset.course_plans ?? [];
      return { dataset: { ...s.dataset, course_plans: list.some(x => x.id === cp.id) ? list.map(x => x.id === cp.id ? cp : x) : [...list, cp] } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("course_plans").upsert(cp).then();
  },
  removeCoursePlan: (id) => {
    set((s) => {
      if (!s.dataset) return s;
      return { dataset: { ...s.dataset, course_plans: (s.dataset.course_plans ?? []).filter(x => x.id !== id) } };
    });
    if (SUPABASE_CONFIGURED) supabase.from("course_plans").delete().eq("id", id).then();
  },
}));

async function persistPlacement(sessionId: string, p: Placement) {
  await supabase.from("placements").upsert(
    {
      semester_id: sessionId,
      course: p.course,
      section: p.section,
      kind: p.kind,
      index_: p.index,
      day: p.day,
      start_time: p.start,
      room: p.room,
      faculty: p.faculty,
      assistant: p.assistant ?? null,
    },
    { onConflict: "semester_id,course,section,kind,index_" },
  );
}

async function deletePlacement(
  sessionId: string, course: string, section: number, kind: string, index: number,
) {
  await supabase.from("placements").delete()
    .match({ semester_id: sessionId, course, section, kind, index_: index });
}

async function replaceSessionPlacements(sessionId: string, placements: Placement[]) {
  await supabase.from("placements").delete().eq("semester_id", sessionId);
  if (!placements.length) return;
  await supabase.from("placements").insert(placements.map(p => ({
    semester_id: sessionId,
    course: p.course,
    section: p.section,
    kind: p.kind,
    index_: p.index,
    day: p.day,
    start_time: p.start,
    room: p.room,
    faculty: p.faculty,
    assistant: p.assistant ?? null,
  })));
}

