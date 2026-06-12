import { useState, useMemo } from "react";
import {
  GraduationCap, Plus, Pencil, Trash2, X, Check,
  ChevronDown, Users, BookOpen, CalendarDays, Search, Map,
} from "lucide-react";
import { useTimetable } from "@/store/timetable";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SortIcon from "@/components/SortIcon";
import { cn } from "@/lib/utils";
import type {
  YearGroup, Major, AcademicSemester, CoursePlan, ElectivePool,
} from "@/types";

const YEARS = [1, 2, 3, 4];
const INTAKES = ["september", "january"];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function planId(majorId: string, year: number, semester: 1 | 2) {
  return `${majorId}_y${year}_s${semester}`;
}

function fmt(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
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

function ModalShell({ title, sub, onClose, footer, children }: {
  title: string; sub?: string; onClose: () => void;
  footer: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[520px] max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm text-foreground">{title}</h2>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{sub}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">{children}</div>
        <div className="shrink-0 px-6 py-4 border-t border-border flex items-center gap-2">{footer}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSave, onDelete, disabled, isNew }: {
  onClose: () => void; onSave: () => void; onDelete?: () => void; disabled?: boolean; isNew: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {!isNew && onDelete && !confirm && (
        <button onClick={() => setConfirm(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors mr-auto">
          <Trash2 className="h-3.5 w-3.5" />Remove
        </button>
      )}
      {confirm && (
        <>
          <span className="text-xs text-destructive mr-auto">Remove this entry?</span>
          <button onClick={onDelete} className="px-3 py-1.5 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Yes</button>
          <button onClick={() => setConfirm(false)} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
        </>
      )}
      {!confirm && (
        <>
          <button onClick={onClose} className={cn("px-4 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors", isNew && "ml-auto")}>Cancel</button>
          <button onClick={onSave} disabled={disabled}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isNew ? "Add" : "Save changes"}
          </button>
        </>
      )}
    </>
  );
}

type Tab = "Year Groups" | "Majors" | "Semesters" | "Course Plans";

const TAB_ICONS: Record<Tab, React.ElementType> = {
  "Year Groups": Users,
  "Majors": GraduationCap,
  "Semesters": CalendarDays,
  "Course Plans": BookOpen,
};

/* ═══════════════════════════════════════════════════════════
   YEAR GROUPS
═══════════════════════════════════════════════════════════ */

const EMPTY_YG: YearGroup = { id: "", label: "", year: 1, intake: "september", capacity: 0 };

function YearGroupsTab() {
  const { dataset, upsertYearGroup, removeYearGroup } = useTimetable();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"year" | "capacity">("year");
  const [asc, setAsc] = useState(true);
  const [editing, setEditing] = useState<YearGroup | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<YearGroup>(EMPTY_YG);

  const list = dataset?.year_groups ?? [];

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = list.filter(yg => !q || yg.label.toLowerCase().includes(q) || String(yg.year).includes(q));
    return [...filtered].sort((a, b) => {
      const av = sort === "year" ? a.year : a.capacity;
      const bv = sort === "year" ? b.year : b.capacity;
      return asc ? av - bv : bv - av;
    });
  }, [list, search, sort, asc]);

  function toggleSort(key: typeof sort) {
    if (sort === key) setAsc(v => !v);
    else { setSort(key); setAsc(true); }
  }


  const thCls = (k: typeof sort) => cn(
    "text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
    sort === k && "text-foreground",
  );

  const totalCapacity = list.reduce((s, yg) => s + yg.capacity, 0);

  function openAdd() {
    setDraft({ ...EMPTY_YG });
    setIsNew(true);
    setEditing(EMPTY_YG);
  }

  function openEdit(yg: YearGroup) {
    setDraft({ ...yg });
    setIsNew(false);
    setEditing(yg);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Year groups", value: list.length },
          { label: "Total students", value: totalCapacity },
          { label: "Avg capacity", value: list.length ? Math.round(totalCapacity / list.length) : 0 },
          { label: "Intakes tracked", value: [...new Set(list.map(yg => yg.intake))].length },
        ].map((s, i) => (
          <div key={s.label} className="animate-fade-up bg-card border border-border rounded-xl px-4 py-3.5" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="text-2xl text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search year groups..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground" />
          {search && <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <button onClick={openAdd} disabled={!dataset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />Add
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className={thCls("year")} onClick={() => toggleSort("year")}>Year <SortIcon active={sort==="year"} asc={asc} /></th>
              <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Label</th>
              <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Intake</th>
              <th className={thCls("capacity")} onClick={() => toggleSort("capacity")}>Capacity <SortIcon active={sort==="capacity"} asc={asc} /></th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {!visible.length && (
              <tr><td colSpan={5}>{search ? <EmptyState icon={Search} title="No year groups match your search" compact /> : <EmptyState icon={Users} title="No year groups added yet" description="Year groups represent each intake of students. Add one to track capacity and link to course plans." compact />}</td></tr>
            )}
            {visible.map((yg, i) => (
              <tr key={yg.id} className={cn("group border-b border-border/50 hover:bg-muted/30 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                <td className="px-4 py-3">
                  <span className="inline-flex w-7 h-7 rounded-lg bg-primary/8 border border-primary/15 text-primary items-center justify-center text-xs">{yg.year}</span>
                </td>
                <td className="px-4 py-3 text-foreground">{yg.label}</td>
                <td className="px-4 py-3 text-muted-foreground capitalize">{yg.intake}</td>
                <td className="px-4 py-3 text-foreground tabular-nums">{yg.capacity.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(yg)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <ModalShell
          title={isNew ? "Add year group" : "Edit year group"}
          sub={isNew ? undefined : draft.id}
          onClose={() => setEditing(null)}
          footer={
            <ModalActions
              onClose={() => setEditing(null)}
              onSave={() => { upsertYearGroup(draft); setEditing(null); }}
              onDelete={() => { removeYearGroup(editing.id); setEditing(null); }}
              disabled={!draft.label.trim()}
              isNew={isNew}
            />
          }
        >
          <section className="space-y-3">
            <SectionLabel>Year group</SectionLabel>
            <div className="space-y-2.5">
              <Field label="Label">
                <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value, id: isNew ? `yg_${slugify(e.target.value)}` : draft.id })}
                  placeholder="e.g. Year 1, Sept 2025" autoFocus className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Academic year">
                  <div className="flex gap-1">
                    {YEARS.map(y => (
                      <button key={y} type="button" onClick={() => setDraft({ ...draft, year: y })}
                        className={cn("flex-1 py-2 text-xs rounded-lg border transition-all",
                          draft.year === y ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/60")}>
                        {y}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Intake">
                  <div className="relative">
                    <select value={draft.intake} onChange={e => setDraft({ ...draft, intake: e.target.value })}
                      className="appearance-none w-full text-xs border border-border rounded-lg px-3 pr-7 py-2 bg-background outline-none focus:border-primary/50">
                      {INTAKES.map(i => <option key={i} value={i} className="capitalize">{i}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>
              </div>
              <Field label="Total student capacity">
                <input type="number" min={0} value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} className={inputCls} />
              </Field>
            </div>
          </section>
        </ModalShell>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAJORS
═══════════════════════════════════════════════════════════ */

const EMPTY_MAJOR: Major = { id: "", name: "", counts: { 1: 0, 2: 0, 3: 0, 4: 0 } };

function MajorsTab() {
  const { dataset, upsertMajor, removeMajor } = useTimetable();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Major | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<Major>(EMPTY_MAJOR);

  const list = dataset?.majors ?? [];

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return list.filter(m => !q || m.name.toLowerCase().includes(q) || m.id.includes(q));
  }, [list, search]);

  const totalStudents = list.reduce((s, m) => s + Object.values(m.counts).reduce((a, b) => a + b, 0), 0);

  function openAdd() {
    setDraft({ ...EMPTY_MAJOR, counts: { 1: 0, 2: 0, 3: 0, 4: 0 } });
    setIsNew(true);
    setEditing(EMPTY_MAJOR);
  }

  function openEdit(m: Major) {
    setDraft({ ...m, counts: { ...m.counts } });
    setIsNew(false);
    setEditing(m);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Majors / programmes", value: list.length },
          { label: "Total students", value: totalStudents },
          { label: "Largest major", value: list.length ? Math.max(...list.map(m => Object.values(m.counts).reduce((a, b) => a + b, 0))) : 0 },
          { label: "Year 1 total", value: list.reduce((s, m) => s + (m.counts[1] ?? 0), 0) },
        ].map((s, i) => (
          <div key={s.label} className="animate-fade-up bg-card border border-border rounded-xl px-4 py-3.5" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="text-2xl text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search majors..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground" />
          {search && <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <button onClick={openAdd} disabled={!dataset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />Add
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Major</th>
                {YEARS.map(y => (
                  <th key={y} className="text-center px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Year {y}</th>
                ))}
                <th className="text-center px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Total</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {!visible.length && (
                <tr><td colSpan={7}>{search ? <EmptyState icon={Search} title="No programmes match your search" compact /> : <EmptyState icon={Map} title="No degree programmes added yet" description="Add your majors here. Each major gets its own course plan for each semester." compact />}</td></tr>
              )}
              {visible.map((m, i) => {
                const total = Object.values(m.counts).reduce((a, b) => a + b, 0);
                return (
                  <tr key={m.id} className={cn("group border-b border-border/50 hover:bg-muted/30 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                    <td className="px-4 py-3">
                      <div className="text-xs text-foreground">{m.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/60">{m.id}</div>
                    </td>
                    {YEARS.map(y => (
                      <td key={y} className="px-4 py-3 text-center text-muted-foreground tabular-nums">
                        {m.counts[y] ?? <span className="text-muted-foreground/40">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-foreground tabular-nums">{total}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(m)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground">
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

      {editing !== null && (
        <ModalShell
          title={isNew ? "Add major" : "Edit major"}
          sub={isNew ? undefined : draft.id}
          onClose={() => setEditing(null)}
          footer={
            <ModalActions
              onClose={() => setEditing(null)}
              onSave={() => { upsertMajor(draft); setEditing(null); }}
              onDelete={() => { removeMajor(editing.id); setEditing(null); }}
              disabled={!draft.name.trim()}
              isNew={isNew}
            />
          }
        >
          <section className="space-y-3">
            <SectionLabel>Programme</SectionLabel>
            <Field label="Name">
              <input value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value, id: isNew ? slugify(e.target.value) : draft.id })}
                placeholder="Computer Science" autoFocus className={inputCls} />
            </Field>
            <Field label="ID">
              <input value={draft.id} onChange={e => setDraft({ ...draft, id: e.target.value })}
                placeholder="cs" className={cn(inputCls, "font-mono")} />
            </Field>
          </section>
          <section className="space-y-3">
            <SectionLabel>Student counts per year</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {YEARS.map(y => (
                <Field key={y} label={`Year ${y}`}>
                  <input type="number" min={0} value={draft.counts[y] ?? ""}
                    onChange={e => setDraft({ ...draft, counts: { ...draft.counts, [y]: Number(e.target.value) } })}
                    placeholder="0" className={inputCls} />
                </Field>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Leave a year at 0 if this major doesn't have students at that level.</p>
          </section>
        </ModalShell>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SEMESTERS
═══════════════════════════════════════════════════════════ */

const EMPTY_SEM: AcademicSemester = {
  id: "", name: "", academic_year: "2025/2026", number: 1,
  start_date: "", weeks: 15, active_years: [1, 2, 3, 4],
};

function SemestersTab() {
  const { dataset, upsertSemester, removeSemester } = useTimetable();
  const [editing, setEditing] = useState<AcademicSemester | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<AcademicSemester>(EMPTY_SEM);

  const list = dataset?.semesters ?? [];

  const academicYears = [...new Set(list.map(s => s.academic_year))].sort();

  function openAdd() {
    setDraft({ ...EMPTY_SEM });
    setIsNew(true);
    setEditing(EMPTY_SEM);
  }

  function openEdit(s: AcademicSemester) {
    setDraft({ ...s, active_years: [...s.active_years] });
    setIsNew(false);
    setEditing(s);
  }

  function toggleYear(y: number) {
    setDraft(d => ({
      ...d,
      active_years: d.active_years.includes(y) ? d.active_years.filter(x => x !== y) : [...d.active_years, y].sort(),
    }));
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Semesters configured", value: list.length },
          { label: "Academic years", value: academicYears.length },
          { label: "Avg duration (weeks)", value: list.length ? Math.round(list.reduce((s, x) => s + x.weeks, 0) / list.length) : 0 },
          { label: "Full-year pairs", value: academicYears.filter(y => list.filter(s => s.academic_year === y).length === 2).length },
        ].map((s, i) => (
          <div key={s.label} className="animate-fade-up bg-card border border-border rounded-xl px-4 py-3.5" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="text-2xl text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <button onClick={openAdd} disabled={!dataset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />Add semester
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Name</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Academic year</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Sem #</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Start date</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Weeks</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Active years</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr><td colSpan={7}><EmptyState icon={CalendarDays} title="No semesters set up yet" description="Add your academic semesters to define the scheduling calendar." compact /></td></tr>
              )}
              {list.map((s, i) => (
                <tr key={s.id} className={cn("group border-b border-border/50 hover:bg-muted/30 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                  <td className="px-4 py-3 text-foreground">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.academic_year}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      Sem {s.number}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.start_date ? fmt(s.start_date) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.weeks}w</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {s.active_years.map(y => (
                        <span key={y} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Y{y}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(s)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null && (
        <ModalShell
          title={isNew ? "Add semester" : "Edit semester"}
          sub={isNew ? undefined : draft.id}
          onClose={() => setEditing(null)}
          footer={
            <ModalActions
              onClose={() => setEditing(null)}
              onSave={() => { upsertSemester(draft); setEditing(null); }}
              onDelete={() => { removeSemester(editing.id); setEditing(null); }}
              disabled={!draft.name.trim()}
              isNew={isNew}
            />
          }
        >
          <section className="space-y-3">
            <SectionLabel>Semester details</SectionLabel>
            <div className="space-y-2.5">
              <Field label="Name">
                <input value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value, id: isNew ? `sem_${slugify(e.target.value)}` : draft.id })}
                  placeholder="e.g. Semester 1, 2025/2026" autoFocus className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Academic year">
                  <input value={draft.academic_year} onChange={e => setDraft({ ...draft, academic_year: e.target.value })}
                    placeholder="2025/2026" className={inputCls} />
                </Field>
                <Field label="Semester number">
                  <div className="flex gap-2">
                    {([1, 2] as const).map(n => (
                      <button key={n} type="button" onClick={() => setDraft({ ...draft, number: n })}
                        className={cn("flex-1 py-2 text-xs rounded-lg border transition-all",
                          draft.number === n ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/60")}>
                        {n}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <input type="date" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Duration (weeks)">
                  <input type="number" min={1} max={52} value={draft.weeks} onChange={e => setDraft({ ...draft, weeks: Number(e.target.value) })} className={inputCls} />
                </Field>
              </div>
            </div>
          </section>
          <section className="space-y-3">
            <SectionLabel>Active year groups</SectionLabel>
            <div className="flex gap-2">
              {YEARS.map(y => (
                <button key={y} type="button" onClick={() => toggleYear(y)}
                  className={cn("flex-1 py-2 text-xs rounded-lg border transition-all",
                    draft.active_years.includes(y) ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/60")}>
                  Year {y}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Select which year groups attend classes during this semester. This drives the full-year simulation scope.</p>
          </section>
        </ModalShell>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COURSE PLANS
═══════════════════════════════════════════════════════════ */

const EMPTY_PLAN = (majorId: string, year: number, semester: 1 | 2): CoursePlan => ({
  id: planId(majorId, year, semester),
  major_id: majorId,
  year,
  semester,
  mandatory: [],
  elective_pools: [],
});

function CourseChip({ code, title }: { code: string; title?: string }) {
  return (
    <span title={title} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
      {code}
    </span>
  );
}

function SemesterColumn({
  semester, plan, courseMap, onEdit,
}: {
  semester: 1 | 2;
  plan: CoursePlan | null;
  courseMap: Record<string, string>;
  onEdit: () => void;
}) {
  const majorPools = plan?.elective_pools.filter(p => p.kind === "major") ?? [];
  const freePools = plan?.elective_pools.filter(p => p.kind === "free") ?? [];
  const hasContent = plan && (plan.mandatory.length > 0 || plan.elective_pools.length > 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Semester {semester}</span>
        <button onClick={onEdit}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="h-3 w-3" />{plan ? "Edit plan" : "Add plan"}
        </button>
      </div>

      {!hasContent ? (
        <div className="px-5"><EmptyState icon={BookOpen} title="No plan for this semester" description="Use the pencil icon above to set which courses students must take this semester." compact /></div>
      ) : (
        <div className="px-5 py-4 space-y-4">

          {/* Mandatory */}
          {plan!.mandatory.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] tracking-[0.06em] uppercase text-muted-foreground/60">Mandatory</div>
              <div className="flex flex-wrap gap-1.5">
                {plan!.mandatory.map(code => (
                  <div key={code} className="flex flex-col">
                    <CourseChip code={code} title={courseMap[code]} />
                    {courseMap[code] && <span className="text-[9px] text-muted-foreground/60 px-1 truncate max-w-[80px]">{courseMap[code]}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Major electives */}
          {majorPools.map(pool => (
            <div key={pool.id} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <div className="text-[10px] tracking-[0.06em] uppercase text-muted-foreground/60">
                  {pool.label || "Major electives"}
                </div>
                <span className="text-[10px] text-primary bg-primary/8 px-1.5 py-0.5 rounded-full">pick {pool.pick}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pool.courses.map(code => <CourseChip key={code} code={code} title={courseMap[code]} />)}
              </div>
            </div>
          ))}

          {/* Free electives */}
          {freePools.map(pool => (
            <div key={pool.id} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <div className="text-[10px] tracking-[0.06em] uppercase text-muted-foreground/60">
                  {pool.label || "Free electives"}
                </div>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">pick {pool.pick}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pool.courses.map(code => <CourseChip key={code} code={code} title={courseMap[code]} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PlanSection = "mandatory" | "major" | "free";

function CoursePlanModal({ draft, setDraft, courseCodes, courseMap, isNew, onSave, onDelete, onClose }: {
  draft: CoursePlan; setDraft: (p: CoursePlan) => void;
  courseCodes: string[]; courseMap: Record<string, string>;
  isNew: boolean; onSave: () => void; onDelete?: () => void; onClose: () => void;
}) {
  const [section, setSection] = useState<PlanSection>("mandatory");

  function toggleMandatory(code: string) {
    const m = draft.mandatory;
    setDraft({ ...draft, mandatory: m.includes(code) ? m.filter(x => x !== code) : [...m, code] });
  }

  function addPool(kind: "major" | "free") {
    const id = `pool_${Date.now()}`;
    setDraft({ ...draft, elective_pools: [...draft.elective_pools, { id, label: "", kind, pick: 1, courses: [] }] });
  }

  function updatePool(poolId: string, patch: Partial<ElectivePool>) {
    setDraft({ ...draft, elective_pools: draft.elective_pools.map(p => p.id === poolId ? { ...p, ...patch } : p) });
  }

  function removePool(poolId: string) {
    setDraft({ ...draft, elective_pools: draft.elective_pools.filter(p => p.id !== poolId) });
  }

  function togglePoolCourse(poolId: string, code: string) {
    const pool = draft.elective_pools.find(p => p.id === poolId);
    if (!pool) return;
    const courses = pool.courses.includes(code) ? pool.courses.filter(x => x !== code) : [...pool.courses, code];
    updatePool(poolId, { courses });
  }

  const sectionPills: { key: PlanSection; label: string }[] = [
    { key: "mandatory", label: "Mandatory" },
    { key: "major", label: "Major electives" },
    { key: "free", label: "Free electives" },
  ];

  const majorPools = draft.elective_pools.filter(p => p.kind === "major");
  const freePools = draft.elective_pools.filter(p => p.kind === "free");
  const activePools = section === "major" ? majorPools : freePools;

  return (
    <ModalShell
      title={isNew ? `Add course plan` : `Edit course plan`}
      sub={`${draft.major_id.toUpperCase()} · Year ${draft.year} · Semester ${draft.semester}`}
      onClose={onClose}
      footer={
        <ModalActions
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
          isNew={isNew}
        />
      }
    >
      {/* section pills */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {sectionPills.map(({ key, label }) => (
          <button key={key} onClick={() => setSection(key)}
            className={cn("px-3 py-1.5 text-xs rounded-md transition-all",
              section === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {/* mandatory */}
      {section === "mandatory" && (
        <section className="space-y-3">
          <SectionLabel>Mandatory courses (all students take these)</SectionLabel>
          {!courseCodes.length
            ? <p className="text-xs text-muted-foreground italic">No courses in dataset.</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {courseCodes.map(code => {
                  const on = draft.mandatory.includes(code);
                  return (
                    <button key={code} type="button" onClick={() => toggleMandatory(code)}
                      className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all",
                        on ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/60")}>
                      {on && <Check className="h-2.5 w-2.5 shrink-0" />}
                      {code}
                    </button>
                  );
                })}
              </div>
            )}
        </section>
      )}

      {/* major / free electives */}
      {(section === "major" || section === "free") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>
              {section === "major" ? "Major elective pools" : "Free elective pools"}
            </SectionLabel>
            <button onClick={() => addPool(section)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              <Plus className="h-3.5 w-3.5" />Add pool
            </button>
          </div>

          {!activePools.length && (
            <p className="text-xs text-muted-foreground italic">No {section === "major" ? "major" : "free"} elective pools. Click "Add pool" to create one.</p>
          )}

          {activePools.map(pool => (
            <div key={pool.id} className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input value={pool.label} onChange={e => updatePool(pool.id, { label: e.target.value })}
                  placeholder={section === "major" ? "e.g. CS electives" : "e.g. Open electives"}
                  className={cn(inputCls, "flex-1")} />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] text-muted-foreground">Pick</span>
                  <input type="number" min={1} max={20} value={pool.pick}
                    onChange={e => updatePool(pool.id, { pick: Number(e.target.value) })}
                    className="w-14 text-xs border border-border rounded-lg px-2 py-2 bg-background outline-none focus:border-primary/50 text-center" />
                </div>
                <button onClick={() => removePool(pool.id)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive/70 transition-colors shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {courseCodes.map(code => {
                  const on = pool.courses.includes(code);
                  return (
                    <button key={code} type="button" onClick={() => togglePoolCourse(pool.id, code)}
                      className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all",
                        on ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/60")}>
                      {on && <Check className="h-2.5 w-2.5 shrink-0" />}
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </ModalShell>
  );
}

function CoursePlansTab() {
  const { dataset, upsertCoursePlan, removeCoursePlan } = useTimetable();
  const [majorId, setMajorId] = useState<string>("");
  const [year, setYear] = useState(1);
  const [editPlan, setEditPlan] = useState<{ plan: CoursePlan; isNew: boolean } | null>(null);

  const majors = dataset?.majors ?? [];
  const plans = dataset?.course_plans ?? [];
  const courseCodes = useMemo(() => (dataset?.courses ?? []).map(c => c.code).sort(), [dataset]);
  const courseMap = useMemo(
    () => Object.fromEntries((dataset?.courses ?? []).map(c => [c.code, c.title])),
    [dataset],
  );

  const activeMajorId = majorId || majors[0]?.id || "";

  function getPlan(semester: 1 | 2) {
    return plans.find(p => p.major_id === activeMajorId && p.year === year && p.semester === semester) ?? null;
  }

  function openPlan(semester: 1 | 2) {
    const existing = getPlan(semester);
    if (existing) {
      setEditPlan({ plan: { ...existing, mandatory: [...existing.mandatory], elective_pools: existing.elective_pools.map(p => ({ ...p, courses: [...p.courses] })) }, isNew: false });
    } else {
      setEditPlan({ plan: EMPTY_PLAN(activeMajorId, year, semester), isNew: true });
    }
  }

  const planStats = {
    configured: plans.length,
    majorsWithPlans: [...new Set(plans.map(p => p.major_id))].length,
    totalMandatory: plans.reduce((s, p) => s + p.mandatory.length, 0),
  };

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Plans configured", value: planStats.configured },
          { label: "Majors with plans", value: planStats.majorsWithPlans },
          { label: "Mandatory course slots", value: planStats.totalMandatory },
        ].map((s, i) => (
          <div key={s.label} className="animate-fade-up bg-card border border-border rounded-xl px-4 py-3.5" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="text-2xl text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select value={activeMajorId} onChange={e => setMajorId(e.target.value)}
            className="appearance-none text-xs border border-border rounded-lg px-3 pr-8 py-2 bg-card outline-none focus:border-primary/50 cursor-pointer text-foreground">
            {majors.length === 0 && <option value="">No majors yet. Add one first.</option>}
            {majors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden bg-card">
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={cn("px-4 py-2 text-xs transition-colors", year === y ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              Year {y}
            </button>
          ))}
        </div>
      </div>

      {/* two semester columns */}
      {!majors.length ? (
        <EmptyState icon={Map} title="Add degree programmes first" description="Course plans are linked to majors. Head to the Programmes tab and add your degree programmes, then come back here." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SemesterColumn semester={1} plan={getPlan(1)} courseMap={courseMap} onEdit={() => openPlan(1)} />
          <SemesterColumn semester={2} plan={getPlan(2)} courseMap={courseMap} onEdit={() => openPlan(2)} />
        </div>
      )}

      {editPlan && (
        <CoursePlanModal
          draft={editPlan.plan}
          setDraft={plan => setEditPlan({ ...editPlan, plan })}
          courseCodes={courseCodes}
          courseMap={courseMap}
          isNew={editPlan.isNew}
          onSave={() => { upsertCoursePlan(editPlan.plan); setEditPlan(null); }}
          onDelete={() => { removeCoursePlan(editPlan.plan.id); setEditPlan(null); }}
          onClose={() => setEditPlan(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════ */

const TABS: Tab[] = ["Year Groups", "Majors", "Semesters", "Course Plans"];

export default function StudentsPage() {
  const [tab, setTab] = useState<Tab>("Year Groups");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={GraduationCap}
          title="Students"
          subtitle="Year groups, majors, semesters and course plans"
        />

        {/* sub-tab nav */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {TABS.map(t => {
            const TIcon = TAB_ICONS[t];
            return (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg transition-all duration-150",
                  tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}>
                <TIcon className="h-3.5 w-3.5 shrink-0" />
                {t}
              </button>
            );
          })}
        </div>

        {/* active tab */}
        {tab === "Year Groups"  && <YearGroupsTab />}
        {tab === "Majors"       && <MajorsTab />}
        {tab === "Semesters"    && <SemestersTab />}
        {tab === "Course Plans" && <CoursePlansTab />}

      </div>
    </div>
  );
}
