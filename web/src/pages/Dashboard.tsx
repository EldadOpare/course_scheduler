import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, SlidersHorizontal, CalendarRange, Loader2,
  ArrowRight, BookOpen, Users, DoorOpen,
} from "lucide-react";
import { useTimetable } from "@/store/timetable";
import { simulate } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import type { SchedulingRules, SimulateResult, Placement } from "@/types";
import { DEFAULT_RULES, ftTime, pmTime, cohortLetter, UNASSIGNED_FACULTY } from "@/types";
import { cn } from "@/lib/utils";

const UNASSIGNED = UNASSIGNED_FACULTY;

const DAY_LABEL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { placements, dataset, validation, activeCourses } = useTimetable();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Everything below is framed for a registrar: plain counts and a glance
  // at the week, not engine internals.
  const stats = useMemo(() => {
    const picked = activeCourses ? Object.keys(activeCourses) : [];
    const pickedSet = new Set(picked);
    let meetings = 0;
    for (const c of dataset?.courses ?? []) {
      if (!pickedSet.has(c.code)) continue;
      const cohorts = activeCourses?.[c.code] || c.sections;
      meetings += cohorts * Object.values(c.sessions).reduce((a, b) => a + b, 0);
    }
    const unassigned = placements.filter(p => p.faculty === UNASSIGNED).length;
    const roomsUsed = new Set(placements.map(p => p.room)).size;
    return {
      coursesThisSemester: picked.length,
      totalMeetings: meetings,
      placed: placements.length,
      unassigned,
      roomsUsed,
    };
  }, [dataset, activeCourses, placements]);

  const conflicts = validation?.violations.length ?? 0;
  const checked = validation != null;

  // The single most important line for a registrar: can I publish this?
  const status: { tone: "good" | "warn" | "bad" | "idle"; title: string; detail: string } =
    !dataset
      ? { tone: "idle", title: "Loading…", detail: "Fetching your data." }
      : stats.coursesThisSemester === 0
        ? { tone: "idle", title: "No courses selected yet",
            detail: "Open the timetable and choose which courses run this semester to begin." }
        : !checked
          ? { tone: "warn", title: "Not validated yet",
              detail: "Open the timetable and click Validate to check for conflicts." }
          : conflicts > 0
            ? { tone: "bad", title: `${conflicts} conflict${conflicts !== 1 ? "s" : ""} to resolve`,
                detail: "Some classes clash. Fix them before publishing the timetable." }
            : { tone: "good", title: "Ready to publish",
                detail: "No conflicts. The timetable satisfies every rule." };

  // Plain-language to-do list — only what a registrar can act on.
  const todos = useMemo(() => {
    const out: { text: string; tone: "bad" | "warn"; to: string }[] = [];
    if (conflicts > 0)
      out.push({ text: `${conflicts} scheduling conflict${conflicts !== 1 ? "s" : ""} to fix`, tone: "bad", to: "/timetable" });
    const unscheduled = Math.max(stats.totalMeetings - stats.placed, 0);
    if (stats.coursesThisSemester > 0 && unscheduled > 0)
      out.push({ text: `${unscheduled} class${unscheduled !== 1 ? "es" : ""} still need a time slot`, tone: "warn", to: "/timetable" });
    if (stats.unassigned > 0)
      out.push({ text: `${stats.unassigned} class${stats.unassigned !== 1 ? "es have" : " has"} no lecturer assigned`, tone: "warn", to: "/timetable" });
    return out;
  }, [conflicts, stats]);

  const kpis = [
    { label: "Classes scheduled", value: `${stats.placed}${stats.totalMeetings ? ` / ${stats.totalMeetings}` : ""}`, icon: CalendarDays, to: "/timetable" },
    { label: "Courses this semester", value: stats.coursesThisSemester, icon: BookOpen, to: "/timetable" },
    { label: "Lecturers assigned", value: stats.placed ? `${stats.placed - stats.unassigned} / ${stats.placed}` : "0", icon: Users, to: "/timetable" },
    { label: "Rooms in use", value: stats.roomsUsed, icon: DoorOpen, to: "/classrooms" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={LayoutDashboard}
          title="Overview"
          subtitle="A quick look at this semester's timetable"
        />

        {/* status hero */}
        <StatusHero status={status} onOpen={() => navigate("/timetable")} />

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k, i) => (
            <button
              key={k.label}
              onClick={() => navigate(k.to)}
              className="animate-fade-up text-left bg-card border border-border rounded-xl px-4 py-4 hover:border-primary/40 hover:shadow-sm transition-all"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <k.icon className="h-4 w-4 text-muted-foreground/60 mb-2" />
              <div className="text-2xl text-foreground tabular-nums">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </button>
          ))}
        </div>

        {/* week + to-do */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <WeekGlance placements={placements} />
          </div>
          <TodoCard todos={todos} onOpen={() => navigate("/timetable")} />
        </div>

        {/* advanced (kept, tucked away) */}
        <div className="bg-card border border-border rounded-xl">
          <button
            onClick={() => setAdvancedOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Advanced settings</span>
              <span className="text-[10px] text-muted-foreground tracking-[0.06em] uppercase">scheduling rules · full-year check</span>
            </div>
            {advancedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {advancedOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              <RulesCard />
              <SimulationCard />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function StatusHero({
  status, onOpen,
}: {
  status: { tone: "good" | "warn" | "bad" | "idle"; title: string; detail: string };
  onOpen: () => void;
}) {
  const tone = {
    good: { ring: "border-success/30 bg-success/5", icon: <CheckCircle2 className="h-6 w-6 text-success" /> },
    bad:  { ring: "border-destructive/30 bg-destructive/5", icon: <AlertTriangle className="h-6 w-6 text-destructive" /> },
    warn: { ring: "border-amber-500/30 bg-amber-500/5", icon: <AlertTriangle className="h-6 w-6 text-amber-500" /> },
    idle: { ring: "border-border bg-muted/30", icon: <CalendarDays className="h-6 w-6 text-muted-foreground" /> },
  }[status.tone];

  return (
    <div className={cn("animate-fade-up rounded-xl border p-5 flex items-center gap-4", tone.ring)}>
      <div className="shrink-0">{tone.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-base text-foreground">{status.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{status.detail}</div>
      </div>
      <button
        onClick={onOpen}
        className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Open timetable <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WeekGlance({ placements }: { placements: Placement[] }) {
  const { dataset } = useTimetable();
  const roomName = useMemo(
    () => new Map((dataset?.rooms ?? []).map(r => [r.id, r.name])),
    [dataset],
  );
  const multi = useMemo(
    () => new Set((dataset?.courses ?? []).filter(c => c.sections > 1).map(c => c.code)),
    [dataset],
  );
  const days = dataset?.timegrid?.weekdays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const byDay = useMemo(() => {
    const m = new Map<string, Placement[]>();
    for (const d of days) m.set(d, []);
    for (const p of placements) {
      if (m.has(p.day)) m.get(p.day)!.push(p);
    }
    for (const list of m.values()) list.sort((a, b) => pmTime(a.start) - pmTime(b.start));
    return m;
  }, [placements, days]);

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground">This week at a glance</span>
      </div>
      {!placements.length ? (
        <div className="py-10 text-center">
          <CalendarDays className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Nothing scheduled yet.</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Generate or place classes on the timetable to see them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {days.map(d => {
            const list = byDay.get(d) ?? [];
            return (
              <div key={d} className="min-w-0">
                <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-2">
                  {DAY_LABEL[d] ?? d}
                  <span className="ml-1 text-muted-foreground/40">{list.length || ""}</span>
                </div>
                <div className="space-y-1.5">
                  {list.length === 0 && <div className="text-[11px] text-muted-foreground/40">No classes</div>}
                  {list.map((p, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background px-2 py-1.5">
                      <div className="text-[11px] text-foreground truncate">
                        {p.course}{multi.has(p.course) ? ` · ${cohortLetter(p.section)}` : ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{p.start}</div>
                      <div className="text-[10px] text-muted-foreground/70 truncate">{roomName.get(p.room) ?? p.room}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TodoCard({
  todos, onOpen,
}: {
  todos: { text: string; tone: "bad" | "warn"; to: string }[];
  onOpen: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      <div className="text-sm text-foreground mb-4">Needs attention</div>
      {!todos.length ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <CheckCircle2 className="h-6 w-6 text-success mb-2" />
          <p className="text-xs text-foreground">All clear</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <ul className="space-y-2 flex-1">
          {todos.map((t, i) => (
            <li key={i}>
              <button
                onClick={onOpen}
                className="w-full flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left hover:border-primary/40 transition-colors"
              >
                <span className={cn("mt-1 h-2 w-2 rounded-full shrink-0", t.tone === "bad" ? "bg-destructive" : "bg-amber-500")} />
                <span className="text-xs text-foreground leading-snug">{t.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BREAK_PRESETS = [15, 25, 60];

function RulesCard() {
  const { dataset, updateRules } = useTimetable();
  const [draft, setDraft] = useState<SchedulingRules>(dataset?.rules ?? DEFAULT_RULES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Sync the editable draft when the saved rules load/change from the store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dataset?.rules) setDraft(dataset.rules);
  }, [dataset?.rules]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(dataset?.rules ?? DEFAULT_RULES);

  const save = () => {
    updateRules(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const num = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <div className="text-sm text-foreground">Scheduling rules</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.06em] uppercase">
            Applied during validation and generation
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-success">Saved</span>}
          <button
            onClick={save}
            disabled={!dirty || !dataset}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Save rules
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-2">
            Minimum break between classes
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {BREAK_PRESETS.map(m => (
              <button
                key={m}
                onClick={() => setDraft(d => ({ ...d, min_break: m }))}
                className={cn(
                  "px-2.5 py-1.5 text-xs rounded-lg border transition-colors",
                  draft.min_break === m
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border hover:bg-muted text-muted-foreground",
                )}
              >
                {m} min
              </button>
            ))}
            <input
              type="number" min={0} step={5}
              value={draft.min_break}
              onChange={e => setDraft(d => ({ ...d, min_break: num(e.target.value, d.min_break) }))}
              className="w-16 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-2">
            Maximum idle gap
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={30} step={15}
              value={draft.max_gap}
              onChange={e => setDraft(d => ({ ...d, max_gap: num(e.target.value, d.max_gap) }))}
              className="w-20 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
            />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-2">
            Lunch window
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              type="time"
              value={ftTime(draft.lunch_start)}
              onChange={e => e.target.value && setDraft(d => ({ ...d, lunch_start: pmTime(e.target.value) }))}
              className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="time"
              value={ftTime(draft.lunch_end)}
              onChange={e => e.target.value && setDraft(d => ({ ...d, lunch_end: pmTime(e.target.value) }))}
              className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SimulationCard() {
  const { dataset } = useTimetable();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!dataset || running) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await simulate(dataset));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <div className="text-sm text-foreground">Full-year check</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.06em] uppercase">
            Both semesters, all majors
          </div>
        </div>
        <button
          onClick={run}
          disabled={running || !dataset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarRange className="h-3.5 w-3.5" />}
          {running ? "Simulating…" : "Run"}
        </button>
      </div>

      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      {!result && !error && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Checks whether both semesters fit with the current rooms and lecturers,
          using the student numbers on the Students page.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <div className={cn(
            "flex items-center gap-2 text-xs",
            result.feasible ? "text-success" : "text-destructive",
          )}>
            {result.feasible
              ? <><CheckCircle2 className="h-4 w-4" /> The whole year works with the current numbers.</>
              : <><AlertTriangle className="h-4 w-4" /> Some classes could not be scheduled.</>}
          </div>
          {result.semesters.map(s => (
            <div key={s.semester} className="rounded-lg border border-border p-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-foreground">Semester {s.semester}</span>
                <span className="text-[11px] text-muted-foreground">
                  {s.placed}/{s.total_meetings} classes · {s.courses_in_play} courses
                  {s.students > 0 && <> · {s.students} students</>}
                </span>
              </div>
              {s.note && <p className="text-[11px] text-muted-foreground italic mt-1">{s.note}</p>}
              {s.unplaced.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {s.unplaced.slice(0, 5).map((u, i) => (
                    <li key={i} className="text-[11px] text-destructive/90">
                      · {u.course}{u.section > 1 ? ` (Cohort ${cohortLetter(u.section)})` : ""} {u.kind}: {u.reason}
                    </li>
                  ))}
                  {s.unplaced.length > 5 && (
                    <li className="text-[11px] text-muted-foreground">…and {s.unplaced.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
