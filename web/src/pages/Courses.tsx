import { BookOpen, X, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { useTimetable } from "@/store/timetable";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SortIcon from "@/components/SortIcon";
import { cn } from "@/lib/utils";
import type { Course } from "@/types";

type SortKey = "code" | "title" | "type" | "program" | "level" | "sections" | "enrollment";

const PROGRAMS = ["UG", "MBA"];
const COURSE_TYPES = ["core", "elective", "required"];
const ROOM_TYPES = ["", "lecture", "lab", "computer_lab", "seminar"];

const EMPTY: Course = {
  code: "", title: "", type: "core", program: "UG", level: 100,
  majors: [], prerequisites: [], credits: 3, expected_enrollment: 30,
  sections: 1, sessions: { lecture: 2 }, requires_room_type: "", intake: "",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-1.5">
        {label}{hint && <span className="normal-case tracking-normal ml-1 opacity-60">— {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function CourseModal({
  initial,
  onSave,
  onClose,
  isNew,
}: {
  initial: Course;
  onSave: (c: Course) => void;
  onClose: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Course>({ ...initial, sessions: { ...initial.sessions } });
  const [error, setError] = useState("");

  const patch = (p: Partial<Course>) => setForm(f => ({ ...f, ...p }));

  const setSession = (kind: string, val: string) => {
    const n = Math.max(0, parseInt(val) || 0);
    setForm(f => {
      const s = { ...f.sessions };
      if (n === 0) delete s[kind]; else s[kind] = n;
      return { ...f, sessions: s };
    });
  };

  const save = () => {
    if (!form.code.trim()) return setError("Course code is required.");
    if (!form.title.trim()) return setError("Title is required.");
    if (!Object.keys(form.sessions).length) return setError("Add at least one session type.");
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
            <Field label="Type">
              <select value={form.type} onChange={e => patch({ type: e.target.value })} className="field-input">
                {COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
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

          <div className="grid grid-cols-3 gap-3">
            <Field label="Program">
              <select value={form.program} onChange={e => patch({ program: e.target.value })} className="field-input">
                {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Level">
              <input
                type="number" min={100} step={100}
                value={form.level}
                onChange={e => patch({ level: parseInt(e.target.value) || 100 })}
                className="field-input"
              />
            </Field>
            <Field label="Credits">
              <input
                type="number" min={1}
                value={form.credits}
                onChange={e => patch({ credits: Math.max(1, parseInt(e.target.value) || 1) })}
                className="field-input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected enrolment">
              <input
                type="number" min={1}
                value={form.expected_enrollment}
                onChange={e => patch({ expected_enrollment: Math.max(1, parseInt(e.target.value) || 1) })}
                className="field-input"
              />
            </Field>
            <Field label="Sections (cohorts)">
              <input
                type="number" min={1}
                value={form.sections}
                onChange={e => patch({ sections: Math.max(1, parseInt(e.target.value) || 1) })}
                className="field-input"
              />
            </Field>
          </div>

          <Field label="Sessions per week" hint="how many meetings each week per section">
            <div className="grid grid-cols-3 gap-2">
              {["lecture", "discussion", "lab"].map(kind => (
                <div key={kind}>
                  <div className="text-[10px] text-muted-foreground capitalize mb-1">{kind}</div>
                  <input
                    type="number" min={0}
                    value={form.sessions[kind] ?? 0}
                    onChange={e => setSession(kind, e.target.value)}
                    className="field-input"
                  />
                </div>
              ))}
            </div>
          </Field>

          <Field label="Requires room type" hint="leave blank for any room">
            <select
              value={form.requires_room_type ?? ""}
              onChange={e => patch({ requires_room_type: e.target.value })}
              className="field-input"
            >
              {ROOM_TYPES.map(t => <option key={t} value={t}>{t || "Any room"}</option>)}
            </select>
          </Field>
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
  const [modal, setModal] = useState<{ course: Course; isNew: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Course | null>(null);

  const courses = dataset?.courses ?? [];

  const filtered = courses.filter(
    c => c.code.toLowerCase().includes(search.toLowerCase())
      || c.title.toLowerCase().includes(search.toLowerCase())
      || c.program.toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0;
    if (sort === "code")       { av = a.code;               bv = b.code; }
    else if (sort === "title")      { av = a.title;              bv = b.title; }
    else if (sort === "type")       { av = a.type;               bv = b.type; }
    else if (sort === "program")    { av = a.program;            bv = b.program; }
    else if (sort === "level")      { av = a.level;              bv = b.level; }
    else if (sort === "sections")   { av = a.sections;           bv = b.sections; }
    else if (sort === "enrollment") { av = a.expected_enrollment; bv = b.expected_enrollment; }
    if (typeof av === "string") return asc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggle(key: SortKey) {
    if (sort === key) setAsc(v => !v);
    else { setSort(key); setAsc(true); }
  }

  const thCls = (k: SortKey) => cn(
    "text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
    sort === k && "text-foreground",
  );

  const stats = [
    { label: "Total courses",  value: courses.length },
    { label: "UG courses",     value: courses.filter(c => c.program === "UG").length },
    { label: "MBA courses",    value: courses.filter(c => c.program === "MBA").length },
    { label: "With labs",      value: courses.filter(c => (c.sessions.lab ?? 0) > 0).length },
  ];

  const canEdit = !!dataset;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={BookOpen}
          title="Courses"
          subtitle="Course catalogue"
          actions={
            <button
              onClick={() => canEdit && setModal({ course: { ...EMPTY, sessions: { lecture: 2 } }, isNew: true })}
              disabled={!canEdit}
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

        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, title or program..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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
                  <th className={thCls("type")}    onClick={() => toggle("type")}>Type <SortIcon active={sort==="type"} asc={asc} /></th>
                  <th className={thCls("program")} onClick={() => toggle("program")}>Program <SortIcon active={sort==="program"} asc={asc} /></th>
                  <th className={thCls("level")}   onClick={() => toggle("level")}>Level <SortIcon active={sort==="level"} asc={asc} /></th>
                  <th className={thCls("sections")} onClick={() => toggle("sections")}>Sections <SortIcon active={sort==="sections"} asc={asc} /></th>
                  <th className={thCls("enrollment")} onClick={() => toggle("enrollment")}>Enrolment <SortIcon active={sort==="enrollment"} asc={asc} /></th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Sessions</th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Room type</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {!sorted.length && (
                  <tr>
                    <td colSpan={10}>
                      {search
                        ? <EmptyState icon={Search} title="No courses match your search" description="Try a different code, title, or program." compact />
                        : <EmptyState icon={BookOpen} title="No courses in the catalogue yet" description="Add your first course above. Each course can have multiple cohorts, session types, and room requirements." compact />
                      }
                    </td>
                  </tr>
                )}
                {sorted.map((c, i) => (
                  <tr key={c.code} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors group", i % 2 !== 0 && "bg-muted/10")}>
                    <td className="px-4 py-3 font-mono text-primary">{c.code}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-foreground">{c.title}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{c.type}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-[10px] tracking-[0.04em] px-2 py-0.5 rounded-full",
                        c.program === "MBA" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                      )}>
                        {c.program}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.level}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{c.sections}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{c.expected_enrollment}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {Object.entries(c.sessions).map(([k, v]) => `${v}×${k}`).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.requires_room_type || "—"}</td>
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
