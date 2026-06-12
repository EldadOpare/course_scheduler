import { useState, useCallback, useEffect, useMemo } from "react";
import {
  LayoutDashboard, ShieldAlert, ShieldCheck, SlidersHorizontal,
  CalendarRange, Loader2, CheckCircle2, AlertTriangle, Brain,
} from "lucide-react";
import { useTimetable } from "@/store/timetable";
import { explain, simulate } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import type { Violation, Penalty, SchedulingRules, SimulateResult, Dataset } from "@/types";
import { DEFAULT_RULES, ftTime, pmTime, cohortLetter } from "@/types";
import { cn } from "@/lib/utils";

interface ReadinessItem {
  severity: "error" | "warn";
  message: string;
}

function readinessChecks(ds: Dataset): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const courseCodes = new Set(ds.courses.map(c => c.code));

  for (const c of ds.courses) {
    const approved = ds.faculty.filter(f => f.approved_courses.includes(c.code));
    if (!approved.length) {
      items.push({ severity: "error", message: `${c.code} has no approved lecturer. It cannot be scheduled.` });
    }
    const perSection = Math.ceil(c.expected_enrollment / Math.max(c.sections, 1));
    if (c.requires_room_type) {
      const typed = ds.rooms.filter(r => r.type === c.requires_room_type);
      if (!typed.length) {
        items.push({ severity: "error", message: `${c.code} needs a ${c.requires_room_type} but none exists` });
      } else if (!typed.some(r => r.capacity >= perSection)) {
        items.push({ severity: "error", message: `No ${c.requires_room_type} seats ${perSection} students for ${c.code} labs` });
      }
    }
    if (!ds.rooms.some(r => r.capacity >= perSection)) {
      items.push({ severity: "error", message: `No room has enough seats for ${c.code} (${perSection} students per section). Add a larger room or split into more sections.` });
    }
  }

  for (const plan of ds.course_plans ?? []) {
    for (const code of plan.mandatory) {
      if (!courseCodes.has(code)) {
        items.push({ severity: "error", message: `Plan ${plan.major_id} Y${plan.year} S${plan.semester} lists ${code}, which is not in the course catalogue` });
      }
    }
    for (const pool of plan.elective_pools) {
      const known = pool.courses.filter(c => courseCodes.has(c));
      if (known.length < pool.pick) {
        items.push({ severity: "error", message: `Pool “${pool.label}” (${plan.major_id} Y${plan.year} S${plan.semester}) asks students to pick ${pool.pick} but only ${known.length} of its courses exist` });
      }
    }
  }

  for (const f of ds.faculty) {
    if (f.type === "adjunct" && !f.availability.length) {
      items.push({ severity: "warn", message: `${f.name} is an adjunct with no availability set. Every class placed for them will be a conflict.` });
    }
  }

  const sectionsNeeded = ds.courses.reduce((s, c) => s + c.sections, 0);
  const facultyCapacity = ds.faculty.reduce((s, f) => s + f.load_target + f.max_overload, 0);
  if (sectionsNeeded > facultyCapacity) {
    items.push({ severity: "warn", message: `${sectionsNeeded} sections needed but lecturers can only cover ${facultyCapacity}. More hiring may be required.` });
  }

  if (ds.majors?.length && ds.course_plans?.length) {
    for (const m of ds.majors) {
      for (const sem of [1, 2] as const) {
        if (!ds.course_plans.some(p => p.major_id === m.id && p.semester === sem)) {
          items.push({ severity: "warn", message: `${m.name} has no course plan for semester ${sem}` });
        }
      }
    }
  }

  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

export default function Dashboard() {
  const { placements, dataset, validation } = useTimetable();
  const [summary, setSummary] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);
  const ds = dataset;
  const v = validation;

  const totalMeetings = ds
    ? ds.courses.reduce((s, c) => s + c.sections * Object.values(c.sessions).reduce((a, b) => a + b, 0), 0)
    : 0;

  const readiness = useMemo(() => (ds ? readinessChecks(ds) : []), [ds]);
  const errors = readiness.filter(r => r.severity === "error").length;

  const handleSummarise = useCallback(async () => {
    if (!ds) return;
    setSummarising(true);
    try {
      const res = await explain(placements, ds);
      setSummary(res.summary || res.error || "No summary returned.");
    } catch {
      setSummary("Could not generate a summary. Check that the AI key is configured.");
    } finally {
      setSummarising(false);
    }
  }, [placements, ds]);

  const kpis = [
    {
      label: "Setup status",
      value: readiness.length ? `${readiness.length} issue${readiness.length !== 1 ? "s" : ""}` : "All good",
      color: errors ? "text-destructive" : readiness.length ? "text-foreground" : "text-success",
      sub: errors ? `${errors} critical issue${errors !== 1 ? "s" : ""} to resolve` : "Courses, lecturers, rooms and plans look consistent",
    },
    {
      label: "Timetable status",
      value: v ? (v.valid ? "No conflicts" : `${v.violations.length} conflict${v.violations.length !== 1 ? "s" : ""}`) : "Not checked",
      color: v ? (v.valid ? "text-success" : "text-destructive") : "text-muted-foreground",
      sub: v ? (v.valid ? "All rules satisfied. Ready to publish." : "Fix these conflicts before publishing.") : "Click Validate on the timetable page.",
    },
    {
      label: "Quality score",
      value: v ? String(v.score) : "—",
      color: "text-foreground",
      sub: "Lower score means a better timetable",
    },
    {
      label: "Classes scheduled",
      value: `${placements.length} / ${totalMeetings}`,
      color: "text-foreground",
      sub: totalMeetings ? `${Math.round((placements.length / totalMeetings) * 100)}% of the catalogue` : "No courses yet",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={LayoutDashboard}
          title="Overview"
          subtitle="Overview of the current timetable and data status"
          actions={
            <StatusBadge
              valid={v?.valid ?? null}
              violations={v?.violations.length}
              score={v?.score}
            />
          }
        />

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((card, i) => (
            <div
              key={card.label}
              className="animate-fade-up bg-card border border-border rounded-xl px-4 py-3.5"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-2">
                {card.label}
              </div>
              <div className={cn("text-2xl", card.color)}>{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Readiness + simulation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReadinessPanel items={readiness} hasData={!!ds} />
          <SimulationCard />
        </div>

        {/* Scheduling rules */}
        <RulesCard />

        {/* Validation issues */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <IssuePanel title="Scheduling conflicts" hint="fix before publishing" items={v?.violations ?? []} type="hard" />
          <IssuePanel title="Quality suggestions" hint="improvements for a better timetable" items={v?.penalties ?? []} type="soft" />
        </div>

        {/* AI summary */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm text-foreground">Timetable summary</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.06em] uppercase">AI overview of the current state</div>
              </div>
            </div>
            <button
              onClick={handleSummarise}
              disabled={summarising || !ds}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              {summarising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              {summarising ? "Generating..." : "Generate summary"}
            </button>
          </div>
          {summary ? (
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Click "Generate summary" for an AI overview of the timetable and any issues found.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

function ReadinessPanel({ items, hasData }: { items: ReadinessItem[]; hasData: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <div className="text-sm text-foreground">Setup checklist</div>
        <span className="text-[10px] text-muted-foreground">fix these before generating a timetable</span>
      </div>
      {!hasData ? (
        <p className="text-xs text-muted-foreground italic">Waiting for the dataset to load.</p>
      ) : !items.length ? (
        <div className="flex items-center gap-2 text-xs text-success">
          <ShieldCheck className="h-4 w-4" /> Everything looks good. Courses, lecturers, rooms and plans are all consistent.
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it, i) => (
            <li key={i} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs", i % 2 === 0 ? "bg-muted/40" : "")}>
              <ShieldAlert className={cn(
                "h-3.5 w-3.5 shrink-0 mt-0.5",
                it.severity === "error" ? "text-destructive" : "text-muted-foreground",
              )} />
              <span className="text-muted-foreground leading-snug">{it.message}</span>
            </li>
          ))}
        </ul>
      )}
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
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm text-foreground">Full-year check</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.06em] uppercase">
              Both semesters, all majors
            </div>
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
          Update student numbers on the Students page, then run this to check whether
          both semesters fit with the current rooms and lecturers.
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
              : <><AlertTriangle className="h-4 w-4" /> Some classes could not be scheduled. See the details below.</>}
          </div>
          {result.semesters.map(s => (
            <div key={s.semester} className="rounded-lg border border-border p-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-foreground">Semester {s.semester}</span>
                <span className="text-[11px] text-muted-foreground">
                  {s.placed}/{s.total_meetings} classes · {s.courses_in_play} courses
                  {s.students > 0 && <> · {s.students} students</>} · quality: {s.score}
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

const BREAK_PRESETS = [15, 25, 60];

function RulesCard() {
  const { dataset, updateRules } = useTimetable();
  const [draft, setDraft] = useState<SchedulingRules>(dataset?.rules ?? DEFAULT_RULES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (dataset?.rules) setDraft(dataset.rules); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm text-foreground">Scheduling rules</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.06em] uppercase">
              Applied during validation and timetable generation
            </div>
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
        {/* minimum break */}
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
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Gaps at or under this count as back-to-back (passing time).
          </p>
        </div>

        {/* maximum gap */}
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
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Student gaps longer than this are penalised as dead time.
          </p>
        </div>

        {/* lunch window */}
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
          <div className="flex items-center gap-1.5 mt-2">
            <input
              type="number" min={0} step={5}
              value={draft.lunch_min}
              onChange={e => setDraft(d => ({ ...d, lunch_min: num(e.target.value, d.lunch_min) }))}
              className="w-16 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
            />
            <span className="text-[11px] text-muted-foreground">min free time students need in the window</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssuePanel({
  title, hint, items, type,
}: {
  title: string; hint: string;
  items: (Violation | Penalty)[];
  type: "hard" | "soft";
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <div className="text-sm text-foreground">{title}</div>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {!items.length ? (
        <p className="text-xs text-muted-foreground italic">
          {type === "hard" ? "No conflicts. This timetable is ready to publish." : "No suggestions. The timetable looks great."}
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it, i) => (
            <li key={i} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs", i % 2 === 0 ? "bg-muted/40" : "")}>
              <span className={cn(
                "mt-0.5 h-1.5 w-1.5 rounded-full shrink-0",
                type === "hard" ? "bg-destructive" : "bg-muted-foreground/50",
              )} />
              <span className="text-muted-foreground leading-snug">{it.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
