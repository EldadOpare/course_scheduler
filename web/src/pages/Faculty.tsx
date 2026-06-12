import { useState, useMemo } from "react";
import {
  Users, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, LayoutGrid, List, Search,
} from "lucide-react";
import { useTimetable } from "@/store/timetable";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { Faculty, Window_ } from "@/types";

const DAYS_OF_WEEK = [
  { label: "Mon", day: "Mon" }, { label: "Tue", day: "Tue" },
  { label: "Wed", day: "Wed" }, { label: "Thu", day: "Thu" },
  { label: "Fri", day: "Fri" }, { label: "Sat", day: "Sat" },
  { label: "Sun", day: "Sun" },
];

const TIME_OPTIONS = [
  "07:00","07:30","08:00","08:30","09:00","09:30","09:45",
  "10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:15",
  "14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00",
];

const EMPTY_FACULTY: Faculty = {
  id: "", name: "", type: "full_time",
  load_target: 4, max_overload: 2,
  approved_courses: [], availability: [], preferred_times: [],
};

type SortKey = "name" | "type" | "courses";

function initials(name: string) {
  const cleaned = name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, "").trim();
  return cleaned.split(/\s+/).slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
}

function slugify(name: string) {
  return "fac_" + name
    .replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function groupWindows(windows: Window_[]) {
  const byTime: Record<string, string[]> = {};
  for (const w of windows) {
    const key = `${w.start}–${w.end}`;
    (byTime[key] ??= []).push(w.day);
  }
  return Object.entries(byTime).map(([time, days]) => ({ time, days }));
}

function TypeBadge({ type }: { type: string }) {
  const isAdjunct = type === "adjunct";
  return (
    <span className={cn(
      "text-[10px] tracking-[0.05em] uppercase px-2 py-0.5 rounded-full",
      isAdjunct
        ? "bg-muted text-muted-foreground"
        : "bg-primary/10 text-primary",
    )}>
      {isAdjunct ? "Adjunct" : "Full-time"}
    </span>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none text-xs font-mono border border-border rounded-lg pl-3 pr-7 py-1.5 bg-background outline-none cursor-pointer text-foreground focus:border-primary/50 hover:border-border/80 transition-colors"
      >
        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <ChevronDown className="absolute right-2 h-3 w-3 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function DayTimeSchedule({ windows, onChange, hint }: {
  windows: Window_[]; onChange: (w: Window_[]) => void; hint?: string;
}) {
  const activeDays = new Set(windows.map(w => w.day));

  function toggleDay(day: string) {
    if (activeDays.has(day)) {
      onChange(windows.filter(w => w.day !== day));
    } else {
      const order = DAYS_OF_WEEK.map(d => d.day);
      const next = [...windows, { day, start: "08:00", end: "17:00" }]
        .sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
      onChange(next);
    }
  }

  function update(idx: number, field: keyof Window_, val: string) {
    onChange(windows.map((w, i) => i === idx ? { ...w, [field]: val } : w));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {DAYS_OF_WEEK.map(({ label, day }) => {
          const active = activeDays.has(day);
          return (
            <button
              key={day} type="button" onClick={() => toggleDay(day)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] border transition-all duration-150 select-none",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground bg-background",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {windows.length > 0 ? (
        <div className="space-y-2 pl-0.5">
          {windows.map((w, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-8 shrink-0 text-xs text-foreground">{w.day}</span>
              <TimeSelect value={w.start} onChange={v => update(i, "start", v)} />
              <span className="text-[10px] text-muted-foreground">to</span>
              <TimeSelect value={w.end} onChange={v => update(i, "end", v)} />
              <button
                type="button"
                onClick={() => onChange(windows.filter((_, j) => j !== i))}
                className="ml-auto p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic pl-0.5">{hint ?? "No days selected."}</p>
      )}
    </div>
  );
}

function FacultyCard({ faculty, courseMap, onEdit }: {
  faculty: Faculty; courseMap: Record<string, string>; onEdit: () => void;
}) {
  const windows = faculty.availability.length ? faculty.availability : faculty.preferred_times;
  const windowLabel = faculty.availability.length ? "Availability"
    : faculty.preferred_times.length ? "Preferred times" : null;
  const groups = groupWindows(windows);

  return (
    <div className="group bg-card border border-border rounded-xl p-5 flex flex-col gap-3.5 hover:shadow-[0_2px_12px_hsl(0_0%_60%_/_0.1)] transition-all duration-200">
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center text-xs shrink-0",
          faculty.type === "adjunct"
            ? "bg-muted text-muted-foreground border border-border"
            : "bg-primary/8 text-primary border border-primary/15",
        )}>
          {initials(faculty.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground truncate">{faculty.name}</div>
          <div className="mt-0.5">
            <TypeBadge type={faculty.type} />
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {faculty.approved_courses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {faculty.approved_courses.map(code => (
            <span key={code} title={courseMap[code]}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
              {code}
            </span>
          ))}
        </div>
      )}

      {windowLabel && groups.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] tracking-[0.06em] uppercase text-muted-foreground/60">{windowLabel}</div>
          {groups.map(({ days, time }, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              <span className="text-foreground">{days.join(" ")}</span>&ensp;·&ensp;{time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return asc
    ? <ChevronUp className="h-3 w-3 inline-block ml-0.5 align-middle" />
    : <ChevronDown className="h-3 w-3 inline-block ml-0.5 align-middle" />;
}

function EditModal({ draft, setDraft, courseCodes, isNew, onSave, onDelete, onClose }: {
  draft: Faculty; setDraft: (f: Faculty) => void;
  courseCodes: string[]; isNew: boolean;
  onSave: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  function set<K extends keyof Faculty>(key: K, value: Faculty[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function toggleCourse(code: string) {
    const c = draft.approved_courses;
    set("approved_courses", c.includes(code) ? c.filter(x => x !== code) : [...c, code]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[520px] max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-sm text-foreground">{isNew ? "Add faculty member" : "Edit faculty member"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <section className="space-y-3">
            <SectionLabel>Identity</SectionLabel>
            <div className="space-y-2.5">
              <Field label="Full name">
                <input
                  value={draft.name}
                  onChange={e => {
                    const name = e.target.value;
                    setDraft({ ...draft, name, id: isNew ? slugify(name) : draft.id });
                  }}
                  placeholder="Dr. Kwame Mensah"
                  autoFocus
                  className={inputCls}
                />
              </Field>
              <Field label="Type">
                <div className="flex gap-2">
                  {(["full_time", "adjunct"] as const).map(t => (
                    <button
                      key={t} type="button" onClick={() => set("type", t)}
                      className={cn(
                        "flex-1 py-2 text-xs rounded-lg border transition-all duration-150",
                        draft.type === t
                          ? t === "adjunct"
                            ? "bg-muted border-border text-foreground"
                            : "bg-primary/10 border-primary/30 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      {t === "full_time" ? "Full-time" : "Adjunct"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Approved courses</SectionLabel>
            {courseCodes.length === 0
              ? <p className="text-xs text-muted-foreground italic">No courses in dataset.</p>
              : (
                <div className="flex flex-wrap gap-1.5">
                  {courseCodes.map(code => {
                    const on = draft.approved_courses.includes(code);
                    return (
                      <button
                        key={code} type="button" onClick={() => toggleCourse(code)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all duration-150",
                          on
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted/60",
                        )}
                      >
                        {on && <Check className="h-2.5 w-2.5 shrink-0" />}
                        {code}
                      </button>
                    );
                  })}
                </div>
              )}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Availability</SectionLabel>
              <span className="text-[10px] text-muted-foreground">Hard constraint</span>
            </div>
            <DayTimeSchedule windows={draft.availability} onChange={w => set("availability", w)} hint="No restrictions set. This lecturer is available all day." />
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Preferred times</SectionLabel>
              <span className="text-[10px] text-muted-foreground">Soft preference</span>
            </div>
            <DayTimeSchedule windows={draft.preferred_times} onChange={w => set("preferred_times", w)} hint="No preferences set." />
          </section>
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-border flex items-center gap-2">
          {!isNew && !deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors mr-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />Remove
            </button>
          )}
          {deleteConfirm && (
            <>
              <span className="text-xs text-destructive mr-auto">Remove this person?</span>
              <button
                onClick={() => { onDelete(); setDeleteConfirm(false); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Yes, remove
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {!deleteConfirm && (
            <>
              <button
                onClick={onClose}
                className={cn("px-4 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors", isNew && "ml-auto")}
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={!draft.name.trim() || !draft.id.trim()}
                className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isNew ? "Add faculty" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full text-xs border border-border rounded-lg px-3 py-2 bg-background outline-none focus:border-primary/50 hover:border-border/80 transition-colors placeholder:text-muted-foreground/60";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">{children}</h3>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

type Filter = "all" | "full_time" | "adjunct";
type View = "cards" | "table";

export default function FacultyPage() {
  const { dataset, upsertFaculty, removeFaculty } = useTimetable();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("table");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [editTarget, setEditTarget] = useState<Faculty | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<Faculty>(EMPTY_FACULTY);

  const faculty = dataset?.faculty ?? [];
  const courseCodes = useMemo(() => (dataset?.courses ?? []).map(c => c.code).sort(), [dataset]);
  const courseMap = useMemo(
    () => Object.fromEntries((dataset?.courses ?? []).map(c => [c.code, c.title])),
    [dataset],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = faculty.filter(f =>
      (!q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.approved_courses.some(c => c.toLowerCase().includes(q)))
      && (filter === "all" || f.type === filter),
    );
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (sortKey === "name")    { av = a.name;                    bv = b.name; }
      else if (sortKey === "type")    { av = a.type;                    bv = b.type; }
      else                            { av = a.approved_courses.length; bv = b.approved_courses.length; }
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortAsc ? (av - (bv as number)) : ((bv as number) - av);
    });
  }, [faculty, search, filter, sortKey, sortAsc]);

  function openEdit(f: Faculty) {
    setDraft({ ...f, availability: [...f.availability], preferred_times: [...f.preferred_times] });
    setIsNew(false);
    setEditTarget(f);
  }

  function openAdd() {
    setDraft({ ...EMPTY_FACULTY });
    setIsNew(true);
    setEditTarget(EMPTY_FACULTY);
  }

  const stats = [
    { label: "Total", value: faculty.length },
    { label: "Full-time", value: faculty.filter(f => f.type === "full_time").length },
    { label: "Adjuncts", value: faculty.filter(f => f.type === "adjunct").length },
    { label: "With courses", value: faculty.filter(f => f.approved_courses.length > 0).length },
  ];

  const thCls = (key: SortKey) => cn(
    "text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
    sortKey === key && "text-foreground",
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={Users}
          title="Faculty"
          subtitle="Manage the faculty roster and teaching availability"
          actions={
            <button
              onClick={openAdd}
              disabled={!dataset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add faculty
            </button>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <div key={s.label} className="animate-fade-up bg-card border border-border rounded-xl px-4 py-3.5" style={{ animationDelay: `${i * 55}ms` }}>
              <div className="text-2xl text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-48 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or course..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex rounded-lg border border-border overflow-hidden bg-card text-xs">
            {(["all", "full_time", "adjunct"] as Filter[]).map(f => (
              <button
                key={f} onClick={() => setFilter(f)}
                className={cn("px-3 py-2 transition-colors", filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
              >
                {f === "all" ? "All" : f === "full_time" ? "Full-time" : "Adjuncts"}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-border overflow-hidden bg-card">
            <button
              onClick={() => setView("table")}
              className={cn("p-2 transition-colors", view === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
              aria-label="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("cards")}
              className={cn("p-2 transition-colors", view === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
              aria-label="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="text-xs text-muted-foreground tabular-nums">{visible.length} / {faculty.length}</span>
        </div>

        {!faculty.length ? (
          <EmptyState
            icon={Users}
            title="No lecturers added yet"
            description="Add your lecturers here. Each one can have approved courses and availability windows — used when generating the timetable."
          />
        ) : !visible.length ? (
          <EmptyState
            icon={Search}
            title="No lecturers match your search"
            description="Try a different name or clear the search to see everyone."
          />
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((f, i) => (
              <div key={f.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <FacultyCard faculty={f} courseMap={courseMap} onEdit={() => openEdit(f)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thCls("name")} onClick={() => toggleSort("name")}>
                      Name <SortIcon active={sortKey === "name"} asc={sortAsc} />
                    </th>
                    <th className={thCls("type")} onClick={() => toggleSort("type")}>
                      Type <SortIcon active={sortKey === "type"} asc={sortAsc} />
                    </th>
                    <th className={thCls("courses")} onClick={() => toggleSort("courses")}>
                      Courses <SortIcon active={sortKey === "courses"} asc={sortAsc} />
                    </th>
                    <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">
                      Availability
                    </th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f, i) => {
                    const windows = f.availability.length ? f.availability : f.preferred_times;
                    const groups = groupWindows(windows);
                    return (
                      <tr
                        key={f.id}
                        className={cn(
                          "group border-b border-border/50 hover:bg-muted/30 transition-colors",
                          i % 2 !== 0 && "bg-muted/10",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] shrink-0",
                              f.type === "adjunct"
                                ? "bg-muted text-muted-foreground border border-border"
                                : "bg-primary/8 text-primary border border-primary/15",
                            )}>
                              {initials(f.name)}
                            </div>
                            <span className="text-xs text-foreground">{f.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={f.type} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {f.approved_courses.map(code => (
                              <span key={code} title={courseMap[code]}
                                className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {code}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {groups.length
                            ? groups.map(({ days, time }, gi) => (
                                <div key={gi}>
                                  <span className="text-foreground">{days.join(" ")}</span> · {time}
                                </div>
                              ))
                            : <span className="italic">Open</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openEdit(f)}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editTarget !== null && (
        <EditModal
          draft={draft} setDraft={setDraft}
          courseCodes={courseCodes} isNew={isNew}
          onSave={() => { upsertFaculty(draft); setEditTarget(null); }}
          onDelete={() => { if (editTarget) removeFaculty(editTarget.id); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
