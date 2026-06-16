import type {
  Dataset, GenerateOption, Placement, PlaceOption, SimulateResult, ValidationResult,
} from "@/types";


async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${path} failed`);
  return data as T;
}

/* Everything the engine needs to judge a timetable, sent inline. */
function ctx(ds: Dataset) {
  return {
    courses: ds.courses,
    faculty: ds.faculty,
    rooms: ds.rooms,
    majors: ds.majors ?? [],
    course_plans: ds.course_plans ?? [],
    rules: ds.rules,
    timegrid: ds.timegrid,
    durations: ds.durations,
  };
}

export function validate(
  placements: Placement[],
  ds: Dataset,
): Promise<ValidationResult> {
  return post("validate", { placements, ...ctx(ds) });
}

export function suggest(
  placements: Placement[],
  ds: Dataset,
  course: string,
  section: number,
  kind: string,
  index: number,
  top = 5,
): Promise<{ options: PlaceOption[] }> {
  return post("suggest", {
    placements, ...ctx(ds),
    course, section, kind, index, top,
  });
}

export function place(
  placements: Placement[],
  ds: Dataset,
  course: string,
  section: number,
  kind: string,
  index: number,
  day: string,
  start: string,
): Promise<{ options: PlaceOption[]; reasons: string[] }> {
  return post("place", {
    placements, ...ctx(ds),
    course, section, kind, index, day, start,
  });
}

export function generate(
  ds: Dataset,
  locked: Placement[] = [],
): Promise<{ options: GenerateOption[]; error: string | null }> {
  return post("generate", { ...ctx(ds), locked });
}

export function simulate(ds: Dataset): Promise<SimulateResult> {
  return post("simulate", ctx(ds));
}

