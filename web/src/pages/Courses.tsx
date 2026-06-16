import { BookOpen, X, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { useTimetable } from "@/store/timetable";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SortIcon from "@/components/SortIcon";
import { cn } from "@/lib/utils";
import type { Course } from "@/types";

type SortKey = "code" | "title" | "type" | "program" | "level" | "sections" | "credits";

const COURSE_TYPES = [
  { value: "liberal_arts_core",  label: "Liberal Arts Core" },
  { value: "required_major",     label: "Required Major" },
  { value: "major_elective",     label: "Major Elective" },
  { value: "non_major_elective", label: "Non-Major Elective" },
];

const PROGRAMS = ["csis", "hss", "ba", "econ", "engr", "law", "mba"];

const EMPTY: Course = {
  code: "", title: "", type: "liberal_arts_core", program: "csis", level: 1,
  majors: [], prerequisites: [], credits: 1, expected_enrollment: 30,
  sections: 1, sessions: { lecture: 2 }, requires_room_type: "", intake: "september",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-1.5">
        {label}{hint && <span className="normal-case tracking-normal ml-1 opacity-60">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = COURSE_TYPES.find(t => t.value === type)?.label ?? type;
  const isCore = type === "liberal_arts_core";
  const isMajor = type === "required_major";
  return (
    <span className={cn(
      "text-[10px] tracking-[0.03em] px-2 py-0.5 rounded-full whitespace-nowrap",
      isCore  ? "bg-primary/10 text-primary" :
      isMajor ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                "bg-muted text-muted-foreground",
    )}>
      {label}
    </span>
  );
}

function CourseModal({
  initial, onSave, onClose, isNew,
}: {
  initial: Course; onSave: (c: Course) => void; onClose: () => void; isNew: boolean;
}) {
  const [form, setForm] = useState<Course>({ ...initial });
  const [error, setError] = useState("");

  const patch = (p: Partial<Course>) => setForm(f => ({ ...f, ...p }));

  const save = () => {
    if (!form.code.trim()) return setError("Course code is required.");
    if (!form.title.trim()) return setError("Title is required.");
    onSave({ ...form });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="text-sm text-foreground">{isNew ? "Add course" : "Edit course"}</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3.5">
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Course code">
              <input
                value={form.code}
                onChange={e => patch({ code: e.target.value.toUpperCase() })}
                disabled={!isNew}
                placeholder="e.g. CS101"
                className="field-input disabled:opacity-50"
              />
            </Field>
            <Field label="Credits">
              <input
                type="number" min={0} step={0.5}
                value={form.credits}
                onChange={e => patch({ credits: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="field-input"
              />
            </Field>
          </div>

          <Field label="Title">
            <input
              value={form.title}
              onChange={e => patch({ title: e.target.value })}
              placeholder="e.g. Introduction to Computer Science"
              className="field-input"
            />
          </Field>

          <Field label="Category">
            <select value={form.type} onChange={e => patch({ type: e.target.value })} className="field-input">
              {COURSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <select value={form.program} onChange={e => patch({ program: e.target.value })} className="field-input">
                {PROGRAMS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </Field>
            <Field label="Year level">
              <select value={form.level} onChange={e => patch({ level: parseInt(e.target.value) })} className="field-input">
                {[1, 2, 3, 4].map(l => <option key={l} value={l}>Year {l}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sections" hint="parallel cohorts">
              <input
                type="number" min={1}
                value={form.sections}
                onChange={e => patch({ sections: Math.max(1, parseInt(e.target.value) || 1) })}
                className="field-input"
              />
            </Field>
            <Field label="Expected enrolment" hint="per section">
              <input
                type="number" min={0}
                value={form.expected_enrollment}
                onChange={e => patch({ expected_enrollment: Math.max(0, parseInt(e.target.value) || 0) })}
                className="field-input"
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5 sticky bottom-0 bg-card pt-2 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {isNew ? "Add course" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Courses() {
  const { dataset, upsertCourse, removeCourse } = useTimetable();
  const [sort, setSort] = useState<SortKey>("code");
  const [asc, setAsc] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modal, setModal] = useState<{ course: Course; isNew: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Course | null>(null);

  const courses = dataset?.courses ?? [];

  const activeTypes = useMemo(
    () => Array.from(new Set(courses.map(c => c.type))).sort(),
    [courses],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter(c =>
      (typeFilter === "all" || c.type === typeFilter) &&
      (!q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.program.toLowerCase().includes(q)),
    );
  }, [courses, search, typeFilter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0;
    if (sort === "code")         { av = a.code;    bv = b.code; }
    else if (sort === "title")   { av = a.title;   bv = b.title; }
    else if (sort === "type")    { av = a.type;    bv = b.type; }
    else if (sort === "program") { av = a.program; bv = b.program; }
    else if (sort === "level")   { av = a.level;   bv = b.level; }
    else if (sort === "sections"){ av = a.sections; bv = b.sections; }
    else if (sort === "credits") { av = a.credits;  bv = b.credits; }
    if (typeof av === "string") return asc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  }), [filtered, sort, asc]);

  function toggle(key: SortKey) {
    if (sort === key) setAsc(v => !v);
    else { setSort(key); setAsc(true); }
  }

  const thCls = (k: SortKey) => cn(
    "text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
    sort === k && "text-foreground",
  );

  const stats = [
    { label: "Total courses",    value: courses.length },
    { label: "Liberal Arts",     value: courses.filter(c => c.type === "liberal_arts_core").length },
    { label: "Required Major",   value: courses.filter(c => c.type === "required_major").length },
    { label: "Electives",        value: courses.filter(c => c.type === "major_elective" || c.type === "non_major_elective").length },
  ];

  const TYPE_FILTER_LABELS: Record<string, string> = {
    liberal_arts_core:  "Liberal Arts",
    required_major:     "Required",
    major_elective:     "Major Elective",
    non_major_elective: "Non-Major",
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={BookOpen}
          title="Courses"
          subtitle="Course catalogue"
          actions={
            <button
              onClick={() => dataset && setModal({ course: { ...EMPTY }, isNew: true })}
              disabled={!dataset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add course
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

        {/* toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-48 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, title or department..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {activeTypes.length > 0 && (
            <div className="flex rounded-lg border border-border overflow-hidden bg-card text-xs">
              <button
                onClick={() => setTypeFilter("all")}
                className={cn("px-3 py-2 transition-colors", typeFilter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
              >
                All
              </button>
              {activeTypes.map(t => (
                <button
                  key={t} onClick={() => setTypeFilter(t)}
                  className={cn("px-3 py-2 transition-colors whitespace-nowrap", typeFilter === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
                >
                  {TYPE_FILTER_LABELS[t] ?? t}
                </button>
              ))}
            </div>
          )}

          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {sorted.length} / {courses.length}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls("code")}    onClick={() => toggle("code")}>Code <SortIcon active={sort==="code"} asc={asc} /></th>
                  <th className={thCls("title")}   onClick={() => toggle("title")}>Title <SortIcon active={sort==="title"} asc={asc} /></th>
                  <th className={thCls("type")}    onClick={() => toggle("type")}>Category <SortIcon active={sort==="type"} asc={asc} /></th>
                  <th className={thCls("program")} onClick={() => toggle("program")}>Dept <SortIcon active={sort==="program"} asc={asc} /></th>
                  <th className={thCls("level")}   onClick={() => toggle("level")}>Year <SortIcon active={sort==="level"} asc={asc} /></th>
                  <th className={thCls("credits")} onClick={() => toggle("credits")}>Credits <SortIcon active={sort==="credits"} asc={asc} /></th>
                  <th className={thCls("sections")} onClick={() => toggle("sections")}>Sections <SortIcon active={sort==="sections"} asc={asc} /></th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {!sorted.length && (
                  <tr>
                    <td colSpan={8}>
                      {search || typeFilter !== "all"
                        ? <EmptyState icon={Search} title="No courses match" description="Try a different search or clear the filter." compact />
                        : <EmptyState icon={BookOpen} title="No courses in the catalogue yet" description="Add your first course above." compact />
                      }
                    </td>
                  </tr>
                )}
                {sorted.map((c, i) => (
                  <tr key={c.code} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors group", i % 2 !== 0 && "bg-muted/10")}>
                    <td className="px-4 py-3 font-mono text-primary">{c.code}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-foreground">{c.title}</td>
                    <td className="px-4 py-3"><TypeBadge type={c.type} /></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground uppercase">{c.program}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.level}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{c.credits}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{c.sections}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal({ course: { ...c }, isNew: false })}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(c)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {modal && (
        <CourseModal
          initial={modal.course}
          isNew={modal.isNew}
          onClose={() => setModal(null)}
          onSave={c => { upsertCourse(c); setModal(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="text-sm text-foreground">Remove {confirmDelete.code}?</div>
            <p className="text-xs text-muted-foreground">This will remove the course from the catalogue. Any timetable entries for it will become unassigned.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => { removeCourse(confirmDelete.code); setConfirmDelete(null); }}
                className="px-4 py-2 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
