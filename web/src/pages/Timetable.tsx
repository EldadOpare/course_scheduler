import { useState, useMemo, useCallback, useEffect } from "react";
import {
  DndContext, DragOverlay,
  MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  CalendarDays, ChevronDown, ChevronRight, X, Loader2, Search, Check,
  Wand2, Download, CheckCircle2, AlertTriangle, Bookmark, FilterX, Trash2, CheckCheck,
  ListChecks, LayoutGrid, Columns3, Minus, Plus as PlusIcon, UserCheck, Wrench,
  Pencil, Printer, Lock, Undo2,
} from "lucide-react";
import { useTimetable } from "@/store/timetable";
import {
  validate as apiValidate, suggest as apiSuggest,
  place as apiPlace, generate as apiGenerate,
} from "@/lib/api";
import { listSnapshots, saveSnapshot, deleteSnapshot } from "@/lib/supabase";
import StatusBadge from "@/components/StatusBadge";
import type {
  Placement, PlaceOption, Dataset, GenerateOption, TimetableSnapshot,
} from "@/types";
import { mkKey, pmTime, ftTime, cohortLetter, UNASSIGNED_FACULTY } from "@/types";
import { cn } from "@/lib/utils";

const DAY_LABEL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday",
};
const DEFAULT_START = 420;  // 07:00 — wide fallback so any time has a drop target
const DEFAULT_END   = 1260; // 21:00
const COL_W = 160;
const ROW_H = 36;     // height of one 30-minute slot
const SLOT_MIN = 30;  // dropping a class snaps to half-hour steps

const DURATIONS: Record<string, number> = { lecture: 90, discussion: 60, lab: 180 };

const KIND_COLOR: Record<string, string> = {
  lecture:    "bg-primary/10 border-primary/20 text-primary",
  discussion: "bg-sky-500/10 border-sky-500/20 text-sky-700",
  lab:        "bg-muted border-border text-muted-foreground",
};

function toMin(hhmm: string) { return pmTime(hhmm); }
function toHHMM(min: number) { return ftTime(min); }

// Plain-English heading for each rule code, so a registrar reads
// "Room double-booked" instead of "H-ROOM-1".
const CONFLICT_LABEL: Record<string, string> = {
  "H-DUP": "Class placed twice",
  "H-STU-1": "Two classes a cohort needs clash",
  "H-STU-2": "Outside teaching hours",
  "H-STU-3": "Elective pool does not fit",
  "H-FAC-1": "Lecturer double-booked",
  "H-FAC-2": "Lecturer not available then",
  "H-FAC-3": "Lecturer not approved for this course",
  "H-FAC-4": "Lecturer has too many classes",
  "H-FAC-5": "Lecturer's day is too long",
  "H-ROOM-0": "Room does not exist",
  "H-ROOM-1": "Room double-booked",
  "H-ROOM-2": "Room is too small",
  "H-ROOM-3": "Wrong type of room",
  "H-ROOM-4": "Room is restricted",
  "H-TIME-1": "Not an approved time slot",
  "H-PREREQ": "A course and its prerequisite clash",
};

// Engine messages are already sentences; just tidy any stray dashes so the
// text stays clean and readable (no em dashes anywhere).
function tidy(msg: string): string {
  return msg.replace(/\s*[—–]\s*/g, ", ").replace(/\s+vs\s+/g, " and ");
}

interface GridSlot { lane: number; lanes: number; placement: Placement }

function layoutGrid(
  placements: Placement[],
  durations: Record<string, number>,
): GridSlot[] {
  return placements.map(p => {
    const startMin = toMin(p.start);
    const dur = durations[p.kind] ?? 90;
    const endMin = startMin + dur;
    const overlapping = placements.filter(q => {
      if (q.day !== p.day) return false;
      const qs = toMin(q.start);
      return qs < endMin && qs + (durations[q.kind] ?? 90) > startMin;
    });
    const sorted = [...overlapping].sort((a, b) => mkKey(a) < mkKey(b) ? -1 : 1);
    return {
      lane: sorted.findIndex(q => mkKey(q) === mkKey(p)),
      lanes: sorted.length,
      placement: p,
    };
  });
}

function PlacementChip({
  placement, lane, lanes, flagged, duration, top, cohort, facultyName, roomName, onClick,
}: {
  placement: Placement; lane: number; lanes: number; flagged: boolean;
  duration?: number; top: number; cohort?: string; facultyName?: string;
  roomName?: string; onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: mkKey(placement),
    data: { placement },
  });
  const dur = duration ?? DURATIONS[placement.kind] ?? 90;
  const height = (dur / SLOT_MIN) * ROW_H - 4;
  const width = `${100 / Math.max(lanes, 1)}%`;
  const left = `${(lane / Math.max(lanes, 1)) * 100}%`;

  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={onClick}
      style={{ width, left, height, top: top + 2 }}
      className={cn(
        "absolute rounded-lg border text-[10px] px-2 py-1 cursor-grab select-none overflow-hidden transition-opacity",
        isDragging ? "opacity-30" : "opacity-100",
        flagged ? "ring-2 ring-destructive/50" : "",
        KIND_COLOR[placement.kind] ?? "bg-muted border-border text-muted-foreground",
      )}
    >
      <div className="truncate">{placement.course}{cohort ? ` · ${cohort}` : ""}</div>
      <div className="truncate opacity-70 text-[9px] tabular-nums">
        {placement.start} to {toHHMM(toMin(placement.start) + dur)}
      </div>
      {roomName && dur >= 60 && (
        <div className="truncate opacity-70 text-[9px]">{roomName}</div>
      )}
      {facultyName && dur >= 90 && (
        <div className="truncate opacity-60 text-[9px]">{facultyName}</div>
      )}
    </div>
  );
}

function DropCell({ day, timeMin, top, hour, room }: {
  day: string; timeMin: number; top: number; hour: boolean; room?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: room ? `${day}|${timeMin}|${room}` : `${day}|${timeMin}`,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ top, height: ROW_H }}
      className={cn(
        "absolute inset-x-0 border-t transition-colors",
        hour ? "border-border/30" : "border-border/10",
        isOver ? "bg-primary/10" : "",
      )}
    />
  );
}

function UnscheduledItem({
  courseCode, section, kind, index, cohort, meetingNo, onClick,
}: {
  courseCode: string; section: number; kind: string; index: number;
  cohort?: string; meetingNo?: number; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unsched|${courseCode}|${section}|${kind}|${index}`,
    data: { unscheduled: { courseCode, section, kind, index } },
  });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5 text-xs cursor-grab",
        "hover:border-primary/40 transition-colors",
        isDragging ? "opacity-40" : "",
      )}
    >
      <span className="truncate text-muted-foreground">
        {cohort ? `Cohort ${cohort}` : "Class"}{meetingNo ? ` · ${meetingNo}` : ""}
      </span>
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[9px] tracking-[0.05em] uppercase shrink-0 ml-1",
        KIND_COLOR[kind] ?? "bg-muted border-border text-muted-foreground",
      )}>
        {kind}
      </span>
    </div>
  );
}

interface InspectorTarget {
  courseCode: string; section: number; kind: string; index: number;
  day?: string; startStr?: string;
}

function Inspector({
  target, dataset, placements, days, onClose, onPlace, onManualPlace,
}: {
  target: InspectorTarget | null;
  dataset: Dataset | null;
  placements: Placement[];
  days: string[];
  onClose: () => void;
  onPlace: (opt: PlaceOption) => void;
  onManualPlace: (m: { day: string; start: string; room: string; faculty: string; assistant: string }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [lastKey, setLastKey] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [mDay, setMDay] = useState("");
  const [mStart, setMStart] = useState("");
  const [mRoom, setMRoom] = useState("");
  const [mFaculty, setMFaculty] = useState(UNASSIGNED);
  const [mAssistant, setMAssistant] = useState("");

  const tKey = target
    ? `${target.courseCode}|${target.section}|${target.kind}|${target.index}|${target.day}|${target.startStr}`
    : "";

  const loadSuggestions = useCallback(async () => {
    if (!target || !dataset || loading) return;
    setLoading(true);
    try {
      let data: { options: PlaceOption[] };
      if (target.day && target.startStr) {
        const res = await apiPlace(
          placements, dataset,
          target.courseCode, target.section,
          target.kind, target.index,
          target.day, target.startStr,
        );
        data = res;
      } else {
        data = await apiSuggest(
          placements, dataset,
          target.courseCode, target.section,
          target.kind, target.index,
          5,
        );
      }
      setOptions(data.options ?? []);
      setLastKey(tKey);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [target, dataset, placements, loading, tKey]);

  if (!target) return null;

  const course = dataset?.courses.find(c => c.code === target.courseCode);
  const cohort = (course?.sections ?? 1) > 1 ? cohortLetter(target.section) : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-72 shadow-xl md:static md:z-auto md:w-60 md:shadow-none shrink-0 border-l border-border bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Inspector</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-3 border-b border-border space-y-0.5">
        <div className="text-sm text-foreground">{target.courseCode}{cohort ? ` · Cohort ${cohort}` : ""}</div>
        <div className="text-xs text-muted-foreground capitalize">{target.kind}{target.index > 0 ? ` (meeting ${target.index + 1})` : ""}</div>
        {target.day && target.startStr && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {target.day} · {target.startStr} to {toHHMM(toMin(target.startStr) + (dataset?.durations?.[target.kind] ?? DURATIONS[target.kind] ?? 90))}
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
        <button
          onClick={loadSuggestions}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {loading ? "Loading..." : "Suggest slots"}
        </button>
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onPlace(opt)}
            className="w-full text-left rounded-lg border border-border bg-background px-3 py-2.5 text-xs hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-foreground">{opt.day} {opt.start}</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px]",
                opt.percent >= 80 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
              )}>
                {opt.percent}%
              </span>
            </div>
            <div className="text-muted-foreground truncate">{opt.room_name}</div>
            <div className="text-muted-foreground truncate">{opt.faculty_name}</div>
          </button>
        ))}
        {!loading && options.length === 0 && lastKey === tKey && (
          <p className="text-xs text-muted-foreground italic text-center pt-2">No valid options found.</p>
        )}

        {/* manual entry — type the day/time/room directly, no drag needed */}
        <div className="pt-2 mt-1 border-t border-border">
          <button
            onClick={() => {
              setManualOpen(v => {
                const next = !v;
                if (next) {
                  setMDay(target.day || days[0] || "Mon");
                  setMStart(target.startStr || "08:00");
                  setMRoom(prev => prev || dataset?.rooms[0]?.id || "");
                }
                return next;
              });
            }}
            className="flex items-center justify-between w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Set time manually</span>
            {manualOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {manualOpen && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">Day</span>
                  <select
                    value={mDay}
                    onChange={e => setMDay(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                  >
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">Start time</span>
                  <input
                    type="time"
                    value={mStart}
                    onChange={e => setMStart(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] text-muted-foreground">Room</span>
                <select
                  value={mRoom}
                  onChange={e => setMRoom(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                >
                  {(dataset?.rooms ?? []).map(r => (
                    <option key={r.id} value={r.id}>{r.name} · {r.capacity} seats</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] text-muted-foreground">Lecturer</span>
                <select
                  value={mFaculty}
                  onChange={e => setMFaculty(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                >
                  <option value={UNASSIGNED}>Unassigned</option>
                  {(dataset?.faculty ?? [])
                    .filter(f => f.id !== UNASSIGNED)
                    .sort((a, b) => {
                      const aa = a.approved_courses.includes(target.courseCode) ? 0 : 1;
                      const bb = b.approved_courses.includes(target.courseCode) ? 0 : 1;
                      return aa - bb || a.name.localeCompare(b.name);
                    })
                    .map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}{f.approved_courses.includes(target.courseCode) ? " ✓" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {(dataset?.faculty ?? []).some(f => f.type === "faculty_intern") && (
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">Faculty intern (optional)</span>
                  <select
                    value={mAssistant}
                    onChange={e => setMAssistant(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                  >
                    <option value="">No intern</option>
                    {(dataset?.faculty ?? [])
                      .filter(f => f.type === "faculty_intern")
                      .map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
              )}
              <button
                onClick={() => {
                  if (!mDay || !mStart || !mRoom) return;
                  onManualPlace({ day: mDay, start: mStart, room: mRoom, faculty: mFaculty, assistant: mAssistant });
                }}
                disabled={!mDay || !mStart || !mRoom}
                className="w-full py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Place at this time
              </button>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Manual placement skips the slot checks. Run Validate afterwards to catch any clashes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FULL_DAY: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

function exportCsv(placements: Placement[], dataset: Dataset) {
  const courseOf  = new Map(dataset.courses.map(c => [c.code, c]));
  const roomOf    = new Map(dataset.rooms.map(r => [r.id, r]));
  const facultyOf = new Map(dataset.faculty.map(f => [f.id, f]));
  const q = (v: string | number) => {
    // Strip CR/LF to prevent row-injection, then prefix formula-trigger
    // chars so Excel/Sheets never interpret them as formulae.
    let s = String(v).replace(/[\r\n]/g, " ");
    if (/^[=+\-@\t|]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = [...placements]
    .sort((a, b) =>
      a.course.localeCompare(b.course) || a.section - b.section ||
      a.kind.localeCompare(b.kind) || a.index - b.index)
    .map(p => {
      const dur = dataset.durations[p.kind] ?? 90;
      return [
        p.course,
        courseOf.get(p.course)?.title ?? "",
        p.section,
        courseOf.get(p.course)?.credits ?? "",
        p.kind,
        FULL_DAY[p.day] ?? p.day,
        p.start,
        ftTime(pmTime(p.start) + dur),
        roomOf.get(p.room)?.name ?? p.room,
        facultyOf.get(p.faculty)?.name ?? p.faculty,
      ].map(q).join(",");
    });

  const csv = [
    ["Course Code", "Course Title", "Section", "Credits", "Session Type",
     "Day", "Start Time", "End Time", "Room", "Instructor"]
      .map(q).join(","),
    ...rows,
  ].join("\n");

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "timetable-camu.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// Open a clean, printable week view in a new window. The browser's print
// dialog handles "Save as PDF", so this covers both print and PDF.
function printTimetable(placements: Placement[], dataset: Dataset, title: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const roomOf = new Map(dataset.rooms.map(r => [r.id, r.name]));
  const facOf = new Map(dataset.faculty.map(f => [f.id, f.name]));
  const courseOf = new Map(dataset.courses.map(c => [c.code, c]));
  const days = dataset.timegrid?.weekdays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const DAY: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };

  const cols = days.map(d => {
    const list = placements
      .filter(p => p.day === d)
      .sort((a, b) => pmTime(a.start) - pmTime(b.start));
    const cells = list.map(p => {
      const dur = dataset.durations[p.kind] ?? 90;
      const cohorts = courseOf.get(p.course)?.sections ?? 1;
      const cohort = cohorts > 1 ? ` (Cohort ${cohortLetter(p.section)})` : "";
      const fac = p.faculty && !p.faculty.startsWith("__") ? facOf.get(p.faculty) ?? "" : "Unassigned";
      const fi = p.assistant ? ` + ${facOf.get(p.assistant) ?? "FI"}` : "";
      return `<div class="cls">
        <div class="t">${esc(p.start)} to ${esc(ftTime(pmTime(p.start) + dur))}</div>
        <div class="c">${esc(p.course)}${esc(cohort)}</div>
        <div class="m">${esc(roomOf.get(p.room) ?? p.room)}</div>
        <div class="m">${esc(fac + fi)}</div>
      </div>`;
    }).join("") || `<div class="empty">No classes</div>`;
    return `<div class="col"><h2>${esc(DAY[d] ?? d)}</h2>${cells}</div>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(${days.length}, 1fr); gap: 10px; }
    .col h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555;
              border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 0 0 8px; }
    .cls { border: 1px solid #ddd; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; page-break-inside: avoid; }
    .cls .t { font-size: 10px; color: #777; }
    .cls .c { font-weight: 600; font-size: 12px; }
    .cls .m { font-size: 10px; color: #555; }
    .empty { color: #bbb; font-size: 11px; }
    @media print { body { margin: 0; } }
  </style></head>
  <body>
    <h1>${esc(title)}</h1>
    <div class="sub">${placements.length} classes · generated ${new Date().toLocaleDateString()}</div>
    <div class="grid">${cols}</div>
    <script>window.onload = () => window.print();</script>
  </body></html>`;

  // Blob URL avoids document.write and bypasses popup-blocker restrictions.
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  // Revoke after the new window has had a moment to load from the blob URL.
  if (w) w.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  else URL.revokeObjectURL(url);
}

function SnapshotsModal({
  current, score, valid, onRestore, onClose,
}: {
  current: Placement[];
  score: number | null;
  valid: boolean | null;
  onRestore: (placements: Placement[]) => void;
  onClose: () => void;
}) {
  const [snaps, setSnaps] = useState<TimetableSnapshot[] | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSnapshots().then(setSnaps).catch(() => setSnaps([]));
  }, []);

  const handleSave = async () => {
    if (!label.trim() || !current.length || saving) return;
    setSaving(true);
    try {
      const snap = await saveSnapshot(label.trim(), current, { note: note.trim(), score, valid });
      if (snap) setSnaps(s => [snap, ...(s ?? [])]);
      setLabel("");
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSnapshot(id);
    setSnaps(s => (s ?? []).filter(x => x.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[560px] max-h-[90vh] flex flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm text-foreground">Saved versions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Save versions that worked. Load one back onto the board anytime, or load it, tweak it, and save again as a copy for another semester.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* save current */}
        <div className="px-5 py-4 border-b border-border space-y-2">
          <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">
            Save current timetable ({current.length} meetings)
          </div>
          <div className="flex gap-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Semester 1 2026 final"
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground"
            />
            <button
              onClick={handleSave}
              disabled={!label.trim() || !current.length || saving}
              className="px-3 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note: what made this version stand out"
            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground"
          />
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {snaps === null ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
          ) : !snaps.length ? (
            <div className="py-4 flex flex-col items-center gap-2 text-center">
              <Bookmark className="h-5 w-5 text-muted-foreground/30" />
              <div className="text-xs text-foreground">No saved versions yet</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed max-w-[180px]">
                Save the current timetable to keep a version you can come back to.
              </div>
            </div>
          ) : snaps.map(s => (
            <div key={s.id} className="rounded-xl border border-border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(s.created_at).toLocaleDateString()} · {s.placements.length} meetings
                    {s.score != null && <> · quality: {s.score}</>}
                    {s.valid != null && (
                      <span className={s.valid ? " text-success" : " text-destructive"}>
                        {s.valid ? " · no conflicts" : " · had conflicts"}
                      </span>
                    )}
                  </div>
                  {s.note && <div className="text-[11px] text-muted-foreground mt-1 italic truncate">{s.note}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => { onRestore(s.placements); onClose(); }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    Load onto board
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PickList<T>({
  title, items, idOf, labelOf, subOf, selected, onChange,
}: {
  title: string;
  items: T[];
  idOf: (x: T) => string;
  labelOf: (x: T) => string;
  subOf?: (x: T) => string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [q, setQ] = useState("");
  const visible = items.filter(x =>
    !q || labelOf(x).toLowerCase().includes(q.toLowerCase())
      || idOf(x).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="flex-1 min-w-0 flex flex-col border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2 bg-muted/30">
        <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">
          {title} · {selected.size}/{items.length}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onChange(new Set(items.map(idOf)))}
            className="px-2 py-1 text-[10px] rounded-md border border-border hover:bg-muted transition-colors"
          >All</button>
          <button
            onClick={() => onChange(new Set())}
            className="px-2 py-1 text-[10px] rounded-md border border-border hover:bg-muted transition-colors"
          >None</button>
        </div>
      </div>
      <div className="px-3 py-2 border-b border-border">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search..."
          className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visible.map(x => {
          const id = idOf(x);
          const on = selected.has(id);
          return (
            <button
              key={id}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(id); else next.add(id);
                onChange(next);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors",
                on ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <span className={cn(
                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                on ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background",
              )}>
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate flex-1">{labelOf(x)}</span>
              {subOf && <span className="text-[10px] text-muted-foreground/60 shrink-0">{subOf(x)}</span>}
            </button>
          );
        })}
        {!visible.length && (
          <p className="text-xs text-muted-foreground italic text-center py-4">No matches.</p>
        )}
      </div>
    </div>
  );
}

function AvailabilityModal({
  dataset, activeCourses, activeRooms, onSave, onClose,
}: {
  dataset: Dataset;
  activeCourses: Record<string, number> | null;
  activeRooms: string[] | null;
  onSave: (courses: Record<string, number>, rooms: string[]) => void;
  onClose: () => void;
}) {
  // Start from whatever is already picked. Nothing picked → empty, so the
  // registrar deliberately chooses which courses run this semester.
  const [courseSel, setCourseSel] = useState<Set<string>>(
    () => new Set(Object.keys(activeCourses ?? {})),
  );
  const [roomSel, setRoomSel] = useState<Set<string>>(
    () => new Set(activeRooms ?? dataset.rooms.map(r => r.id)),
  );

  // Quick-select from a course plan
  const planMajors = dataset.majors ?? [];
  const planCourseList = dataset.course_plans ?? [];
  const [planMajorId, setPlanMajorId] = useState(
    () => planMajors.find(m => m.name.toLowerCase().includes("computer science"))?.id
      || planMajors[0]?.id || ""
  );
  const [planYear, setPlanYear] = useState(1);

  const planCourseCount = useMemo(() => {
    const codes = new Set<string>();
    for (const plan of (dataset.course_plans ?? []).filter(p => p.major_id === planMajorId && p.year === planYear)) {
      plan.mandatory.forEach(c => codes.add(c));
      plan.elective_pools.forEach(pool => pool.courses.forEach(c => codes.add(c)));
    }
    return codes.size;
  }, [dataset.course_plans, planMajorId, planYear]);

  const addFromPlan = () => {
    const codes = new Set<string>();
    for (const plan of (dataset.course_plans ?? []).filter(p => p.major_id === planMajorId && p.year === planYear)) {
      plan.mandatory.forEach(c => codes.add(c));
      plan.elective_pools.forEach(pool => pool.courses.forEach(c => codes.add(c)));
    }
    setCourseSel(prev => new Set([...prev, ...codes]));
  };

  // New picks default to 1 cohort; existing picks keep their count.
  const save = () => {
    const out: Record<string, number> = {};
    for (const code of courseSel) {
      out[code] = activeCourses?.[code] ?? 1;
    }
    onSave(out, [...roomSel]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[820px] h-[80vh] flex flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm text-foreground">This semester</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick the courses running this semester and the classrooms available for scheduling.
              The unscheduled tray and Generate only use what's ticked here. Set cohorts per course in the tray afterwards. Unticking a course also removes any classes already placed for it.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick-select from a course plan */}
        {planMajors.length > 0 && planCourseList.length > 0 && (
          <div className="px-4 py-3 border-b border-border shrink-0 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 shrink-0">From plan</span>
            <select
              value={planMajorId}
              onChange={e => setPlanMajorId(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              {planMajors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs bg-card">
              {[1, 2, 3, 4].map(y => (
                <button
                  key={y}
                  onClick={() => setPlanYear(y)}
                  className={cn("px-2.5 py-1.5 transition-colors",
                    planYear === y ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
                >
                  Y{y}
                </button>
              ))}
            </div>
            <button
              onClick={addFromPlan}
              disabled={planCourseCount === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-primary/5 text-foreground transition-colors disabled:opacity-50"
            >
              <PlusIcon className="h-3 w-3" />
              {planCourseCount > 0 ? `Add ${planCourseCount} from Y${planYear} plan` : "No courses in plan"}
            </button>
            <span className="text-[10px] text-muted-foreground/60">· or use All / None in the list below</span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex gap-4 p-4">
          <PickList
            title="Courses"
            items={dataset.courses}
            idOf={c => c.code}
            labelOf={c => `${c.code} · ${c.title}`}
            subOf={c => `Y${c.level}`}
            selected={courseSel}
            onChange={setCourseSel}
          />
          <PickList
            title="Classrooms"
            items={dataset.rooms}
            idOf={r => r.id}
            labelOf={r => r.name}
            subOf={r => `${r.capacity} seats`}
            selected={roomSel}
            onChange={setRoomSel}
          />
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {courseSel.size} course{courseSel.size !== 1 ? "s" : ""} · {roomSel.size} classroom{roomSel.size !== 1 ? "s" : ""} in play
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const UNASSIGNED = UNASSIGNED_FACULTY;

// After a draft is generated we know the timetable is feasible; this is
// where the registrar assigns the real lecturer (and optional faculty
// intern) for each course/cohort already on the grid.
function LecturersModal({
  dataset, placements, onAssign, onAssignAssistant, onClose,
}: {
  dataset: Dataset;
  placements: Placement[];
  onAssign: (course: string, section: number, facultyId: string) => void;
  onAssignAssistant: (course: string, section: number, facultyId: string) => void;
  onClose: () => void;
}) {
  // One row per (course, cohort) that's actually on the grid, so cohorts
  // can take the same or different lecturers (and interns).
  const rows = useMemo(() => {
    const seen = new Map<string, { course: string; section: number; current: string; assistant: string }>();
    for (const p of placements) {
      const key = `${p.course}|${p.section}`;
      if (!seen.has(key)) seen.set(key, {
        course: p.course, section: p.section,
        current: p.faculty, assistant: p.assistant ?? "",
      });
    }
    return [...seen.values()].sort((a, b) =>
      a.course.localeCompare(b.course) || a.section - b.section);
  }, [placements]);

  const courseTitle = (code: string) => dataset.courses.find(c => c.code === code)?.title ?? "";
  const multi = (code: string) => (dataset.courses.find(c => c.code === code)?.sections ?? 1) > 1;

  // Lecturers approved for a course come first; the placeholder is never
  // an option. Interns (FIs) are the pool for the assistant column.
  const realFaculty = dataset.faculty.filter(f => f.id !== UNASSIGNED && f.type !== "faculty_intern");
  const interns = dataset.faculty.filter(f => f.type === "faculty_intern");
  const optionsFor = (code: string) => {
    const approved = realFaculty.filter(f => f.approved_courses.includes(code));
    const rest = realFaculty.filter(f => !f.approved_courses.includes(code));
    return { approved, rest };
  };

  const unassignedCount = rows.filter(r => r.current === UNASSIGNED).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[720px] h-[80vh] flex flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm text-foreground">Assign lecturers</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The timetable is feasible. Now choose who teaches each class, and optionally add a faculty intern to assist.
              {unassignedCount > 0 && ` ${unassignedCount} still need a lecturer.`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {!rows.length && (
            <p className="text-xs text-muted-foreground italic text-center py-8">
              Nothing on the grid yet. Generate or place classes first.
            </p>
          )}
          {rows.length > 0 && (
            <div className="flex items-center gap-3 px-3 pb-1 text-[10px] tracking-[0.06em] uppercase text-muted-foreground/60">
              <span className="flex-1">Class</span>
              <span className="w-[200px]">Lecturer</span>
              <span className="w-[160px]">Faculty intern</span>
            </div>
          )}
          {rows.map(r => {
            const { approved, rest } = optionsFor(r.course);
            return (
              <div key={`${r.course}|${r.section}`} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-foreground">
                    {r.course}{multi(r.course) ? ` · Cohort ${cohortLetter(r.section)}` : ""}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{courseTitle(r.course)}</div>
                </div>
                <select
                  value={r.current}
                  onChange={e => onAssign(r.course, r.section, e.target.value)}
                  className={cn(
                    "shrink-0 w-[200px] px-2 py-1.5 text-xs rounded-lg border bg-background text-foreground transition-colors",
                    r.current === UNASSIGNED ? "border-amber-500/50 text-amber-600 dark:text-amber-400" : "border-border",
                  )}
                >
                  <option value={UNASSIGNED}>Unassigned</option>
                  {approved.length > 0 && (
                    <optgroup label="Approved to teach this">
                      {approved.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Other faculty">
                    {rest.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </optgroup>
                </select>
                <select
                  value={r.assistant}
                  onChange={e => onAssignAssistant(r.course, r.section, e.target.value)}
                  disabled={!interns.length}
                  title={!interns.length ? "Add faculty interns on the Faculty page first" : undefined}
                  className="shrink-0 w-[160px] px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground disabled:opacity-50"
                >
                  <option value="">No intern</option>
                  {interns.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Clearing wipes the board and the semester's course/room picks. We offer
// to save a copy first so nothing is lost by accident.
function ClearBoardModal({
  count, onSaveAndClear, onClearOnly, onClose,
}: {
  count: number;
  onSaveAndClear: (label: string) => Promise<void>;
  onClearOnly: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm text-foreground">Clear the timetable</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This removes {count} placed class{count !== 1 ? "es" : ""} and resets the courses and rooms picked for this semester.
            Save a copy first if you want to keep it.
          </p>
          <div>
            <label className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">Name this version (optional)</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Semester 1 2026 draft"
              className="w-full mt-1 px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={onClearOnly}
            className="text-xs text-destructive hover:underline"
          >
            Clear without saving
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!label.trim() || saving) return;
                setSaving(true);
                try { await onSaveAndClear(label.trim()); } finally { setSaving(false); }
              }}
              disabled={!label.trim() || saving || !count}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save and clear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Timetable() {
  const {
    placements, placementHistory, dataset, validation,
    upsertPlacement, removePlacement, applyDraft, undoPlacement, setValidation,
    activeCourses, activeRooms, setActiveCourses, setActiveRooms,
    sessions, currentSession, switchSession, newSession, renameCurrentSession,
    deleteCurrentSession, setPublished,
  } = useTimetable();
  const published = !!currentSession?.published_at;
  const [activeDrag, setActiveDrag] = useState<Placement | null>(null);
  const [inspector, setInspector] = useState<InspectorTarget | null>(null);
  const [trayOpen, setTrayOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches,
  );
  const [validating, setValidating] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genOptions, setGenOptions] = useState<GenerateOption[] | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [snapsOpen, setSnapsOpen] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [lecturersOpen, setLecturersOpen] = useState(false);
  const [view, setView] = useState<"week" | "day">("day");
  const [dayFocus, setDayFocus] = useState("Mon");
  const [weekDayFocus, setWeekDayFocus] = useState("");
  const [filterMajor, setFilterMajor] = useState("");
  const [filterYear, setFilterYear] = useState(0);
  const [filterFaculty, setFilterFaculty] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [filterCredits, setFilterCredits] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // Cmd/Ctrl+Z to undo the last placement change.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && !published) {
        e.preventDefault();
        undoPlacement();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoPlacement, published]);

  const durations = dataset?.durations ?? DURATIONS;

  // What's in play this semester. The engine only sees the courses the
  // registrar picked (with their per-semester cohort count) and the rooms
  // they allowed — but anything already placed stays included so existing
  // chips never break validation with "unknown id" errors.
  const engineDataset = useMemo(() => {
    if (!dataset) return null;
    const placedCourses = new Set(placements.map(p => p.course));
    const placedRooms = new Set(placements.map(p => p.room));
    const roomSet = activeRooms ? new Set(activeRooms) : null;
    // Override each picked course's section count with the chosen cohorts, and
    // scale expected_enrollment so the validator's H-ROOM-2 check fires at the
    // correct per-cohort size (total enrollment is conserved across splits).
    const courses = dataset.courses
      .filter(c => (activeCourses && c.code in activeCourses) || placedCourses.has(c.code))
      .map(c => {
        if (activeCourses && c.code in activeCourses) {
          const numCohorts = activeCourses[c.code];
          const totalEnrollment = c.sections * c.expected_enrollment;
          return { ...c, sections: numCohorts, expected_enrollment: Math.ceil(totalEnrollment / numCohorts) };
        }
        return c;
      });
    return {
      ...dataset,
      courses,
      rooms: roomSet
        ? dataset.rooms.filter(r => roomSet.has(r.id) || placedRooms.has(r.id))
        : dataset.rooms,
    };
  }, [dataset, activeCourses, activeRooms, placements]);

  // The picked courses (with cohort overrides) drive the unscheduled tray.
  // Nothing picked yet → empty tray.
  // Courses active for this session — drives the unscheduled tray and generate.
  const semesterCourses = useMemo(() => {
    if (!dataset || !activeCourses) return [];
    return dataset.courses
      .filter(c => c.code in activeCourses)
      .map(c => ({ ...c, sections: activeCourses[c.code] }));
  }, [dataset, activeCourses]);

  // Wider course list for the filter dropdown: active courses + anything
  // currently placed (covers drafts applied before picking activeCourses,
  // and courses that were removed from activeCourses but still have placements).
  const filterableCourses = useMemo(() => {
    if (!dataset) return [];
    const activeCodes = new Set(Object.keys(activeCourses ?? {}));
    const placedCodes = new Set(placements.map(p => p.course));
    const allCodes = new Set([...activeCodes, ...placedCodes]);
    return dataset.courses.filter(c => allCodes.has(c.code));
  }, [dataset, activeCourses, placements]);

  // Rooms shown as columns in the day view and in the room filter dropdown.
  const semesterRooms = useMemo(() => {
    if (!dataset) return [];
    if (!activeRooms) return dataset.rooms;
    const sel = new Set(activeRooms);
    const placedRooms = new Set(placements.map(p => p.room));
    return dataset.rooms.filter(r => sel.has(r.id) || placedRooms.has(r.id));
  }, [dataset, activeRooms, placements]);

  // Faculty eligible to filter by: approved for an active course OR already assigned.
  const semesterFaculty = useMemo(() => {
    if (!dataset) return [];
    const activeCodes = new Set(Object.keys(activeCourses ?? {}));
    const assignedIds = new Set(placements.map(p => p.faculty));
    return dataset.faculty.filter(f =>
      f.id !== UNASSIGNED &&
      f.type !== "faculty_intern" &&
      (f.approved_courses.some(c => activeCodes.has(c)) || assignedIds.has(f.id))
    );
  }, [dataset, activeCourses, placements]);

  // Clear filter values that reference entities no longer visible in the
  // scoped lists. Guard on `dataset` (not list length) so we only act once
  // data is loaded — an empty list after load means the value is genuinely stale.
  useEffect(() => {
    if (dataset && filterFaculty && !semesterFaculty.some(f => f.id === filterFaculty)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilterFaculty("");
    }
  }, [dataset, semesterFaculty, filterFaculty]);
  useEffect(() => {
    if (dataset && filterRoom && !semesterRooms.some(r => r.id === filterRoom)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilterRoom("");
    }
  }, [dataset, semesterRooms, filterRoom]);
  useEffect(() => {
    if (dataset && filterCourse && !filterableCourses.some(c => c.code === filterCourse)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilterCourse("");
    }
  }, [dataset, filterableCourses, filterCourse]);

  // Auto-validate whenever placements or dataset change (debounced 400 ms).
  // Skips when there's nothing to validate or while auto-fix is running.
  useEffect(() => {
    if (!engineDataset || !placements.length) return;
    const id = setTimeout(async () => {
      setValidating(true);
      try {
        const res = await apiValidate(placements, engineDataset);
        setValidation(res);
      } finally {
        setValidating(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [placements, engineDataset, setValidation]);

  // I derived the grid's columns and rows from the timegrid settings (and
  // I keyed days by the short names the engine uses, because keying them
  // by display names once made every applied draft render an empty grid).
  const days = useMemo(() => {
    const weekdays = dataset?.timegrid?.weekdays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const weekend = dataset?.timegrid?.weekend ?? ["Sat", "Sun"];
    const hasWeekend = placements.some(p => weekend.includes(p.day));
    return hasWeekend ? [...weekdays, ...weekend] : weekdays;
  }, [dataset, placements]);

  // The time axis is continuous (one row per half hour), so a class can
  // start at any time and still render in the right spot. The day stretches
  // to cover both the configured slots and whatever is actually placed.
  const times = useMemo(() => {
    const g = dataset?.timegrid;
    const useWeekend = days.some(d => (g?.weekend ?? ["Sat", "Sun"]).includes(d));
    const dur = (k: string) => durations[k] ?? 90;
    const cfgStarts = g
      ? [...g.lecture_starts, ...g.discussion_starts, ...g.lab_starts,
         ...(useWeekend ? g.weekend_starts : [])]
      : [DEFAULT_START];
    const cfgEnds = g
      ? [...g.lecture_starts.map(t => t + dur("lecture")),
         ...g.discussion_starts.map(t => t + dur("discussion")),
         ...g.lab_starts.map(t => t + dur("lab")),
         ...(useWeekend ? g.weekend_starts.map(t => t + dur("lecture")) : [])]
      : [DEFAULT_END];
    const pStarts = placements.map(p => toMin(p.start));
    const pEnds = placements.map(p => toMin(p.start) + dur(p.kind));
    const first = Math.floor(Math.min(...cfgStarts, ...pStarts) / 60) * 60;
    const last = Math.ceil(Math.max(...cfgEnds, ...pEnds) / 60) * 60;
    const out: number[] = [];
    for (let t = first; t < last; t += SLOT_MIN) out.push(t);
    return out;
  }, [dataset, days, placements, durations]);

  /* filtering: major/year resolves through course plans (mandatory + pools) */
  const filterActive = !!(filterMajor || filterYear || filterFaculty || filterRoom || filterCourse || filterCredits);
  const visiblePlacements = useMemo(() => {
    if (!filterActive || !dataset) return placements;
    const courseOf = new Map(dataset.courses.map(c => [c.code, c]));

    let planCodes: Set<string> | null = null;
    if (filterMajor || filterYear) {
      const plans = (dataset.course_plans ?? []).filter(pl =>
        (!filterMajor || pl.major_id === filterMajor) &&
        (!filterYear || pl.year === filterYear));
      if (plans.length) {
        planCodes = new Set<string>();
        for (const pl of plans) {
          pl.mandatory.forEach(c => planCodes!.add(c));
          pl.elective_pools.forEach(po => po.courses.forEach(c => planCodes!.add(c)));
        }
      }
    }

    return placements.filter(p => {
      if (filterFaculty && p.faculty !== filterFaculty) return false;
      if (filterRoom && p.room !== filterRoom) return false;
      if (filterCourse && p.course !== filterCourse) return false;
      const c = courseOf.get(p.course);
      if (filterCredits && String(c?.credits ?? "") !== filterCredits) return false;
      if (filterMajor || filterYear) {
        if (planCodes) return planCodes.has(p.course);
        // no plans defined: fall back to course level/majors
        if (filterYear && c?.level !== filterYear) return false;
        if (filterMajor && (!c || !c.majors.includes(filterMajor))) return false;
      }
      return true;
    });
  }, [placements, dataset, filterActive, filterMajor, filterYear, filterFaculty, filterRoom, filterCourse, filterCredits]);

  // In preview mode the board shows the draft being previewed (no filters),
  // otherwise the live, filtered timetable.
  const previewing = !!genOptions;
  const boardPlacements = useMemo(
    () => previewing ? (genOptions[previewIdx]?.placements ?? []) : visiblePlacements,
    [previewing, genOptions, previewIdx, visiblePlacements],
  );

  const slots = useMemo(
    () => layoutGrid(boardPlacements, durations),
    [boardPlacements, durations],
  );
  const flagged = new Set(previewing ? [] : validation?.flagged ?? []);

  const creditValues = useMemo(
    () => [...new Set(filterableCourses.map(c => c.credits))].sort((a, b) => a - b),
    [filterableCourses],
  );

  // Cohort letters only matter for courses that actually run more than one
  // this semester, so honour the per-course cohort overrides.
  const multiSection = useMemo(() => {
    const counts = new Map<string, number>(
      (dataset?.courses ?? []).map(c => [c.code, c.sections]),
    );
    if (activeCourses) {
      for (const [code, n] of Object.entries(activeCourses)) counts.set(code, n);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([code]) => code));
  }, [dataset, activeCourses]);
  const facultyOf = useMemo(
    () => new Map((dataset?.faculty ?? []).map(f => [f.id, f.name])),
    [dataset],
  );
  const roomOf = useMemo(
    () => new Map((dataset?.rooms ?? []).map(r => [r.id, r.name])),
    [dataset],
  );

  // Peak per-cohort enrollment for each room on the focused day (for the gauge).
  const roomPeakEnrollment = useMemo(() => {
    if (!engineDataset) return new Map<string, number>();
    const enrollOf = new Map(engineDataset.courses.map(c => [c.code, c.expected_enrollment]));
    const peak = new Map<string, number>();
    for (const p of boardPlacements.filter(pl => pl.day === dayFocus)) {
      const enroll = enrollOf.get(p.course) ?? 0;
      peak.set(p.room, Math.max(peak.get(p.room) ?? 0, enroll));
    }
    return peak;
  }, [engineDataset, boardPlacements, dayFocus]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const d = e.active.data.current;
    setActiveDrag(d?.placement ?? null);
  }, []);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveDrag(null);
    if (previewing || published) return;  // read-only while previewing or published
    if (!e.over) return;
    // Week-view cells are "day|minutes"; day-view cells add "|roomId".
    const [day, timeStr, roomId] = String(e.over.id).split("|");
    const timeMin = parseInt(timeStr, 10);
    const src = e.active.data.current;
    if (src?.placement) {
      const p: Placement = src.placement;
      const newStart = toHHMM(timeMin);
      const newRoom = roomId ?? p.room;
      if (p.day === day && p.start === newStart && p.room === newRoom) return;
      await upsertPlacement({ ...p, day, start: newStart, room: newRoom });
    } else if (src?.unscheduled) {
      const { courseCode, section, kind, index } = src.unscheduled;
      setInspector({ courseCode, section, kind, index, day, startStr: toHHMM(timeMin) });
    }
  }, [upsertPlacement, previewing, published]);

  // Auto-fix: pin every class that isn't part of a conflict, then let the
  // engine re-place only the flagged ones into legal slots around them.
  const handleAutoFix = useCallback(async () => {
    if (!engineDataset || autoFixing || !validation || validation.valid) return;
    setAutoFixing(true);
    setGenError(null);
    try {
      const flaggedSet = new Set(validation.flagged);
      const locked = flaggedSet.size
        ? placements.filter(p => !flaggedSet.has(mkKey(p)))
        : [];  // can't pinpoint — let the engine rework the whole draft
      const res = await apiGenerate(engineDataset, locked);
      if (res.error) { setGenError(res.error); return; }
      const best = res.options?.[0];
      if (best) {
        applyDraft(best.placements);
        const v = await apiValidate(best.placements, engineDataset);
        setValidation(v);
        if (!v.valid) {
          setGenError("Auto-fix reduced the clashes it could; some conflicts need a manual move or more rooms.");
        }
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Auto-fix failed");
    } finally {
      setAutoFixing(false);
    }
  }, [engineDataset, autoFixing, validation, placements, applyDraft, setValidation]);

  const handleGenerate = useCallback(async () => {
    if (!engineDataset || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await apiGenerate(engineDataset);
      if (res.error) setGenError(res.error);
      else {
        // Preview the drafts on the board so the registrar can toggle
        // between them and see them in place before committing.
        setGenOptions(res.options);
        setPreviewIdx(0);
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [engineDataset, generating]);

  const handleApplyOption = useCallback((opt: GenerateOption) => {
    applyDraft(opt.placements);
    setGenOptions(null);
    // Feasibility is proven; nudge straight into assigning lecturers when
    // the draft used the placeholder for any class.
    if (opt.placements.some(p => p.faculty === UNASSIGNED)) {
      setLecturersOpen(true);
    }
  }, [applyDraft]);

  // Wipe the board and the semester's picks. validation is cleared too so
  // stale conflicts don't hang around.
  const clearBoard = useCallback(() => {
    applyDraft([]);
    setActiveCourses(null);
    setActiveRooms(null);
    setValidation(null);
    setClearOpen(false);
  }, [applyDraft, setActiveCourses, setActiveRooms, setValidation]);

  const saveThenClear = useCallback(async (label: string) => {
    await saveSnapshot(label, placements, {
      score: validation?.score ?? null,
      valid: validation?.valid ?? null,
    });
    clearBoard();
  }, [placements, validation, clearBoard]);

  const handlePlaceOption = useCallback(async (opt: PlaceOption) => {
    if (!inspector) return;
    const { courseCode, section, kind, index } = inspector;
    await upsertPlacement({
      course: courseCode, section, kind, index,
      day: opt.day, start: opt.start,
      room: opt.room, faculty: opt.faculty,
    });
    setInspector(null);
  }, [inspector, upsertPlacement]);

  // Direct placement from the manual form — no slot checks, the registrar
  // decides; Validate flags any clash afterwards.
  const handleManualPlace = useCallback((m: { day: string; start: string; room: string; faculty: string; assistant: string }) => {
    if (!inspector) return;
    const { courseCode, section, kind, index } = inspector;
    upsertPlacement({
      course: courseCode, section, kind, index,
      day: m.day, start: m.start, room: m.room, faculty: m.faculty,
      assistant: m.assistant || undefined,
    });
    setInspector(null);
  }, [inspector, upsertPlacement]);

  // Set the lecturer for every meeting of one course/cohort at once.
  const assignLecturer = useCallback((course: string, section: number, facultyId: string) => {
    for (const p of placements) {
      if (p.course === course && p.section === section && p.faculty !== facultyId) {
        upsertPlacement({ ...p, faculty: facultyId });
      }
    }
  }, [placements, upsertPlacement]);

  // Set (or clear, with "") the assisting faculty intern for a course/cohort.
  const assignAssistant = useCallback((course: string, section: number, facultyId: string) => {
    const next = facultyId || undefined;
    for (const p of placements) {
      if (p.course === course && p.section === section && (p.assistant ?? undefined) !== next) {
        upsertPlacement({ ...p, assistant: next });
      }
    }
  }, [placements, upsertPlacement]);

  const scheduled = useMemo(() => new Set(placements.map(mkKey)), [placements]);

  // One group per picked course so the tray reads as a course list
  // ("CS415 — Software Engineering") with a cohort stepper, not a wall of
  // identical chips. Every picked course shows even when fully scheduled,
  // so cohorts stay adjustable after placement.
  const unscheduledGroups = useMemo(() => {
    const groups: {
      code: string; title: string; sections: number; enrollment: number;
      sessionCount: Record<string, number>; items: InspectorTarget[];
    }[] = [];
    for (const c of semesterCourses) {
      const items: InspectorTarget[] = [];
      for (const [kind, count] of Object.entries(c.sessions)) {
        for (let idx = 0; idx < (count as number); idx++) {
          for (let sec = 1; sec <= c.sections; sec++) {
            if (!scheduled.has(`${c.code}|${sec}|${kind}|${idx}`)) {
              items.push({ courseCode: c.code, section: sec, kind, index: idx });
            }
          }
        }
      }
      groups.push({ code: c.code, title: c.title, sections: c.sections, enrollment: c.expected_enrollment, sessionCount: c.sessions, items });
    }
    return groups;
  }, [semesterCourses, scheduled]);
  const unscheduledCount = useMemo(
    () => unscheduledGroups.reduce((s, g) => s + g.items.length, 0),
    [unscheduledGroups],
  );

  // Change how many cohorts a course runs this semester. Removing cohorts
  // also clears any placements that belonged to the dropped cohort.
  const setCourseCohorts = useCallback((code: string, n: number) => {
    const next = Math.max(1, Math.min(26, n));
    const base = activeCourses ?? {};
    setActiveCourses({ ...base, [code]: next });
    const stale = placements.filter(p => p.course === code && p.section > next);
    for (const p of stale) removePlacement(mkKey(p));
  }, [activeCourses, setActiveCourses, placements, removePlacement]);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* header */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap bg-background">
        {/* session switcher */}
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarDays className="h-5 w-5 text-primary shrink-0" />
          <div className="relative inline-flex items-center">
            <select
              value={currentSession?.id ?? ""}
              onChange={e => switchSession(e.target.value)}
              disabled={!sessions.length}
              className="appearance-none text-sm font-medium text-foreground bg-transparent pr-6 pl-1 py-1 outline-none cursor-pointer max-w-[220px] truncate"
            >
              {!sessions.length && <option value="">Timetable</option>}
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.label}{s.published_at ? " (Final)" : ""}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-1 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={async () => {
              const label = window.prompt("Name the new semester plan", "New semester plan");
              if (label && label.trim()) await newSession(label.trim());
            }}
            title="New semester plan"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (!currentSession) return;
              const label = window.prompt("Rename semester plan", currentSession.label);
              if (label && label.trim()) renameCurrentSession(label.trim());
            }}
            disabled={!currentSession}
            title="Rename"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (!currentSession) return;
              if (window.confirm(`Delete "${currentSession.label}" and all its placements? This cannot be undone.`)) {
                deleteCurrentSession();
              }
            }}
            disabled={!currentSession || sessions.length <= 1}
            title={sessions.length <= 1 ? "Keep at least one timetable" : "Delete this timetable"}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {published && (
            <span className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] tracking-[0.04em] uppercase">
              <CheckCircle2 className="h-3 w-3" /> Final
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            valid={validation?.valid ?? null}
            violations={validation?.violations.length}
            score={validation?.score}
          />
          <button
            onClick={() => setAvailOpen(true)}
            disabled={!dataset || published}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <ListChecks className="h-3.5 w-3.5" />
            This semester
            {semesterCourses.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] tabular-nums">
                {semesterCourses.length}
              </span>
            )}
          </button>
          {validating && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          )}
          {validation && !validation.valid && (
            <>
              <button
                onClick={() => setShowConflicts(v => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
                  showConflicts ? "border-destructive/50 bg-destructive/5 text-destructive" : "border-border hover:bg-muted",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {validation.violations.length} conflict{validation.violations.length !== 1 ? "s" : ""}
              </button>
              <button
                onClick={handleAutoFix}
                disabled={autoFixing || published}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              >
                {autoFixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                {autoFixing ? "Fixing…" : "Auto-fix conflicts"}
              </button>
            </>
          )}
          {!published && (
            <button
              onClick={undoPlacement}
              disabled={!placementHistory.length}
              title={placementHistory.length ? "Undo last change (⌘Z)" : "Nothing to undo"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
          <button
            onClick={() => dataset && exportCsv(filterActive ? visiblePlacements : placements, dataset)}
            disabled={!dataset || !placements.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => dataset && printTimetable(placements, dataset, currentSession?.label ?? "Timetable")}
            disabled={!dataset || !placements.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          {!published && (
            <button
              onClick={() => setLecturersOpen(true)}
              disabled={!dataset || !placements.length}
              title={!placements.length ? "Place or generate classes first" : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Lecturers
            </button>
          )}
          <button
            onClick={() => setSnapsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Saved versions
          </button>
          {!published && (
            <button
              onClick={() => setClearOpen(true)}
              disabled={!dataset || (!placements.length && !activeCourses && !activeRooms)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
          {!published && (
            <button
              onClick={handleGenerate}
              disabled={generating || !semesterCourses.length}
              title={!semesterCourses.length ? "Pick courses in 'This semester' first" : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              {generating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Wand2 className="h-3.5 w-3.5" />}
              {generating ? "Scheduling…" : "Auto-schedule"}
            </button>
          )}
          {/* Publish locks the timetable as the official version; unpublish to edit again. */}
          {published ? (
            <button
              onClick={() => setPublished(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <Lock className="h-3.5 w-3.5" />
              Edit again
            </button>
          ) : (
            <button
              onClick={() => {
                if (validation && !validation.valid) {
                  if (!window.confirm("This timetable still has conflicts. Mark as final anyway?")) return;
                }
                setPublished(true);
              }}
              disabled={!placements.length}
              title={!placements.length ? "Nothing to mark as final yet" : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark as final
            </button>
          )}
        </div>
      </div>

      {genError && (
        <div className="shrink-0 px-4 sm:px-6 py-2 text-xs text-destructive bg-destructive/5 border-b border-border">
          {genError}
        </div>
      )}

      {/* preview banner — toggle between generated drafts on the board */}
      {previewing && genOptions && (
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-primary/30 bg-primary/[0.04]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] tracking-[0.08em] uppercase text-primary">Preview</span>
            <div className="flex rounded-lg border border-border overflow-hidden bg-card text-xs">
              {genOptions.map((o, i) => (
                <button
                  key={o.label}
                  onClick={() => setPreviewIdx(i)}
                  className={cn(
                    "px-3 py-1.5 transition-colors whitespace-nowrap",
                    i === previewIdx ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {(() => {
              const o = genOptions[previewIdx];
              if (!o) return null;
              return (
                <span className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  {o.complete
                    ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> All classes placed, no conflicts</span>
                    : <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />
                        {o.unplaced.length > 0 ? `${o.unplaced.length} could not be placed` : `${o.violations.length} conflict${o.violations.length !== 1 ? "s" : ""}`}
                      </span>}
                  <span className="text-muted-foreground/60">·</span>
                  <span>{o.placements.length} classes placed</span>
                </span>
              );
            })()}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { setGenOptions(null); }}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => { const o = genOptions?.[previewIdx]; if (o) handleApplyOption(o); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Use this timetable
              </button>
            </div>
          </div>
          {genOptions[previewIdx]?.unplaced.length > 0 && (() => {
            const o = genOptions[previewIdx];
            if (!o) return null;
            return (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                Could not place: {o.unplaced.slice(0, 4).map(u =>
                  `${u.course}${u.section > 1 ? ` (Cohort ${cohortLetter(u.section)})` : ""}`).join(", ")}
                {o.unplaced.length > 4 ? ` and ${o.unplaced.length - 4} more` : ""}.
              </p>
            );
          })()}
          {(() => {
            const topPenalties = [...(genOptions?.[previewIdx]?.penalties ?? [])]
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 3);
            if (!topPenalties.length) return null;
            return (
              <div className="flex items-start gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60 mt-0.5 shrink-0">Penalties</span>
                {topPenalties.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-1.5 py-0.5">
                    <span className="font-medium tabular-nums">+{p.weight}</span>
                    <span className="text-amber-600/80 dark:text-amber-400/70">{p.message}</span>
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* conflicts panel — plain-language list, toggled from the header */}
      {showConflicts && validation && !validation.valid && (
        <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-border bg-destructive/[0.03] max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground">
              {validation.violations.length} conflict{validation.violations.length !== 1 ? "s" : ""} to resolve
            </span>
            <button onClick={() => setShowConflicts(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {validation.violations.map((v, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                <span className="leading-snug">
                  <span className="text-foreground">{CONFLICT_LABEL[v.code] ?? "Conflict"}:</span>
                  <span className="text-muted-foreground"> {tidy(v.message)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground mt-2">
            Tip: try Auto-fix, or click a flagged class (outlined in red) to move it.
          </p>
        </div>
      )}

      {/* filter bar */}
      <div className="shrink-0 px-4 sm:px-6 py-2 border-b border-border bg-background flex items-center gap-2 flex-wrap">
        {/* view mode */}
        <div className="flex rounded-lg border border-border overflow-hidden bg-card text-xs">
          <button
            onClick={() => setView("week")}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 transition-colors",
              view === "week" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Week
          </button>
          <button
            onClick={() => setView("day")}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 transition-colors",
              view === "day" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            <Columns3 className="h-3.5 w-3.5" /> By room
          </button>
        </div>

        {/* Day picker — for by-room view (required) and week view (optional "All") */}
        <div className="flex rounded-lg border border-border overflow-hidden bg-card text-xs">
          {view === "week" && (
            <button
              onClick={() => setWeekDayFocus("")}
              className={cn("px-2.5 py-1.5 transition-colors",
                !weekDayFocus ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              All
            </button>
          )}
          {days.map(d => (
            <button
              key={d}
              onClick={() => view === "day" ? setDayFocus(d) : setWeekDayFocus(d)}
              className={cn("px-2.5 py-1.5 transition-colors",
                (view === "day" ? dayFocus === d : weekDayFocus === d)
                  ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border/60 mx-1" />
        <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">View by</span>

        {/* primary focus filters */}
        <select
          value={filterFaculty}
          onChange={e => setFilterFaculty(e.target.value)}
          className={cn(
            "px-2 py-1.5 text-xs rounded-lg border bg-background text-foreground transition-colors",
            filterFaculty ? "border-primary/50 text-primary" : "border-border",
          )}
        >
          <option value="">All lecturers</option>
          {semesterFaculty.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={filterRoom}
          onChange={e => setFilterRoom(e.target.value)}
          className={cn(
            "px-2 py-1.5 text-xs rounded-lg border bg-background text-foreground transition-colors",
            filterRoom ? "border-primary/50 text-primary" : "border-border",
          )}
        >
          <option value="">All rooms</option>
          {semesterRooms.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        <select
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value)}
          className={cn(
            "px-2 py-1.5 text-xs rounded-lg border bg-background text-foreground transition-colors max-w-48",
            filterCourse ? "border-primary/50 text-primary" : "border-border",
          )}
        >
          <option value="">All courses</option>
          {filterableCourses.map(c => (
            <option key={c.code} value={c.code}>{c.code} · {c.title}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* secondary refinement filters */}
        <select
          value={filterMajor}
          onChange={e => setFilterMajor(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
        >
          <option value="">All majors</option>
          {(dataset?.majors ?? []).map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
          className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
        >
          <option value={0}>All years</option>
          {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <select
          value={filterCredits}
          onChange={e => setFilterCredits(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
        >
          <option value="">All credits</option>
          {creditValues.map(c => (
            <option key={c} value={String(c)}>{c} credit{c !== 1 ? "s" : ""}</option>
          ))}
        </select>

        {filterActive && (
          <>
            <button
              onClick={() => { setFilterMajor(""); setFilterYear(0); setFilterFaculty(""); setFilterRoom(""); setFilterCourse(""); setFilterCredits(""); }}
              className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FilterX className="h-3.5 w-3.5" /> Clear
            </button>
            <span className="text-xs text-muted-foreground ml-auto">
              {visiblePlacements.length} of {placements.length} classes shown
            </span>
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* unscheduled tray */}
          <div className={cn(
            "shrink-0 border-r border-border bg-background flex flex-col transition-all duration-200 overflow-hidden",
            trayOpen ? "w-60" : "w-9",
          )}>
            <button
              onClick={() => setTrayOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-2.5 text-[10px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground border-b border-border w-full shrink-0 transition-colors"
            >
              {trayOpen
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              {trayOpen && <span className="truncate">This semester ({unscheduledCount} to place)</span>}
            </button>
            {trayOpen && (
              <div className="flex-1 overflow-y-auto p-2 space-y-3">
                {!unscheduledGroups.length
                  ? <div className="pt-6 flex flex-col items-center gap-2 text-center px-3">
                      <ListChecks className="h-5 w-5 text-muted-foreground/40" />
                      <p className="text-[11px] text-foreground leading-snug">No courses chosen yet</p>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        Use <span className="text-foreground">This semester</span> to pick the courses running this term, then set their cohorts here.
                      </p>
                      <button
                        onClick={() => setAvailOpen(true)}
                        className="mt-1 px-2.5 py-1.5 text-[11px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Pick courses
                      </button>
                    </div>
                  : unscheduledGroups.map(g => (
                      <div key={g.code} className="space-y-1">
                        <div className="px-1 flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono text-primary leading-tight">{g.code}</div>
                            <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{g.title}</div>
                          </div>
                          {/* per-course cohort stepper */}
                          <div className="flex items-center gap-0.5 shrink-0 mt-0.5" title="Cohorts this semester">
                            <button
                              onClick={() => setCourseCohorts(g.code, g.sections - 1)}
                              disabled={g.sections <= 1}
                              className="w-4 h-4 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                            >
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            <span
                              title={g.enrollment > 0 ? `~${Math.ceil(g.enrollment / g.sections)} students per cohort` : "Cohorts this semester"}
                              className="min-w-[58px] text-center text-[10px] tabular-nums text-foreground whitespace-nowrap leading-tight"
                            >
                              {g.sections} cohort{g.sections !== 1 ? "s" : ""}
                              {g.enrollment > 0 && (
                                <span className="block text-[9px] text-muted-foreground/60 tabular-nums">
                                  ~{Math.ceil(g.enrollment / g.sections)} ea
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => setCourseCohorts(g.code, g.sections + 1)}
                              disabled={g.sections >= 26}
                              className="w-4 h-4 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                            >
                              <PlusIcon className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                        {g.items.length ? (
                          <div className="space-y-1">
                            {g.items.map(u => (
                              <UnscheduledItem
                                key={`${u.courseCode}|${u.section}|${u.kind}|${u.index}`}
                                courseCode={u.courseCode}
                                section={u.section}
                                kind={u.kind}
                                index={u.index}
                                cohort={multiSection.has(u.courseCode) ? cohortLetter(u.section) : undefined}
                                meetingNo={(g.sessionCount[u.kind] ?? 1) > 1 ? u.index + 1 : undefined}
                                onClick={published ? () => {} : () => setInspector(u)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-1 text-[10px] text-success/70">
                            <CheckCheck className="h-3 w-3" /> all scheduled
                          </div>
                        )}
                      </div>
                    ))}
              </div>
            )}
          </div>

          {/* grid */}
          <div className="flex-1 overflow-auto">
            {view === "week" ? (
              (() => {
                // When a specific day is focused, show it alone at a wider width
                // so cards are fully readable instead of crushed into 160 px columns.
                const wDays = weekDayFocus ? [weekDayFocus] : days;
                const wColW = weekDayFocus ? 520 : COL_W;
                return (
                  <div className="min-w-max">
                    <div className="flex border-b border-border sticky top-0 bg-background z-10">
                      <div className="w-14 shrink-0" />
                      {wDays.map(d => (
                        <div key={d} style={{ width: wColW }}
                          className="shrink-0 px-3 py-2.5 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 border-r border-border last:border-r-0">
                          {DAY_LABEL[d] ?? d}
                        </div>
                      ))}
                    </div>
                    <div className="flex">
                      {/* time gutter */}
                      <div className="w-14 shrink-0 sticky left-0 bg-background z-10 border-r border-border/30">
                        {times.map(t => (
                          <div
                            key={t}
                            style={{ height: ROW_H }}
                            className={cn(
                              "px-2 flex items-start justify-end pt-0.5 text-[10px] font-mono text-muted-foreground/70 border-t",
                              t % 60 === 0 ? "border-border/30" : "border-border/10",
                            )}
                          >
                            {t % 60 === 0 ? toHHMM(t) : ""}
                          </div>
                        ))}
                      </div>
                      {/* one column per visible day */}
                      {wDays.map(day => (
                        <div
                          key={day}
                          style={{ width: wColW, height: times.length * ROW_H }}
                          className="relative shrink-0 border-r border-border/30 last:border-r-0"
                        >
                          {times.map((t, i) => (
                            <DropCell key={t} day={day} timeMin={t} top={i * ROW_H} hour={t % 60 === 0} />
                          ))}
                          {slots.filter(s => s.placement.day === day).map(s => (
                            <PlacementChip
                              key={mkKey(s.placement)}
                              placement={s.placement}
                              lane={s.lane}
                              lanes={s.lanes}
                              top={((toMin(s.placement.start) - times[0]) / SLOT_MIN) * ROW_H}
                              duration={durations[s.placement.kind]}
                              cohort={multiSection.has(s.placement.course) ? cohortLetter(s.placement.section) : undefined}
                              facultyName={facultyOf.get(s.placement.faculty)}
                              roomName={roomOf.get(s.placement.room)}
                              flagged={flagged.has(mkKey(s.placement))}
                              onClick={previewing || published ? undefined : () => setInspector({
                                courseCode: s.placement.course,
                                section: s.placement.section,
                                kind: s.placement.kind,
                                index: s.placement.index,
                                day: s.placement.day,
                                startStr: s.placement.start,
                              })}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : (
              /* by-room view: one column per classroom for the focused day,
                 so ten rooms all teaching at 08:00 read as ten side-by-side
                 chips instead of one unreadable pile */
              <div className="min-w-max">
                <div className="flex border-b border-border sticky top-0 bg-background z-10">
                  <div className="w-14 shrink-0" />
                  {semesterRooms.map(r => {
                    const peak = roomPeakEnrollment.get(r.id) ?? 0;
                    const pct = r.capacity > 0 ? Math.min(1, peak / r.capacity) : 0;
                    const over = peak > r.capacity;
                    return (
                      <div key={r.id} style={{ width: COL_W }}
                        className="shrink-0 px-3 py-2 border-r border-border last:border-r-0">
                        <div className="text-[11px] text-foreground truncate">{r.name}</div>
                        <div className="text-[9px] text-muted-foreground/60 mb-1">{r.capacity} seats · {r.type.replace(/_/g, " ")}</div>
                        {peak > 0 && (
                          <div title={`Peak: ${peak} / ${r.capacity} seats`}>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : pct > 0.85 ? "bg-amber-500" : "bg-primary/60")}
                                style={{ width: `${Math.min(100, pct * 100)}%` }}
                              />
                            </div>
                            <div className={cn("text-[9px] tabular-nums mt-0.5", over ? "text-destructive" : "text-muted-foreground/60")}>
                              {peak}/{r.capacity}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex">
                  <div className="w-14 shrink-0 sticky left-0 bg-background z-10 border-r border-border/30">
                    {times.map(t => (
                      <div
                        key={t}
                        style={{ height: ROW_H }}
                        className={cn(
                          "px-2 flex items-start justify-end pt-0.5 text-[10px] font-mono text-muted-foreground/70 border-t",
                          t % 60 === 0 ? "border-border/30" : "border-border/10",
                        )}
                      >
                        {t % 60 === 0 ? toHHMM(t) : ""}
                      </div>
                    ))}
                  </div>
                  {semesterRooms.map(room => {
                    const roomSlots = layoutGrid(
                      boardPlacements.filter(p => p.day === dayFocus && p.room === room.id),
                      durations,
                    );
                    return (
                      <div
                        key={room.id}
                        style={{ width: COL_W, height: times.length * ROW_H }}
                        className="relative shrink-0 border-r border-border/30 last:border-r-0"
                      >
                        {times.map((t, i) => (
                          <DropCell key={t} day={dayFocus} timeMin={t} top={i * ROW_H} hour={t % 60 === 0} room={room.id} />
                        ))}
                        {roomSlots.map(s => (
                          <PlacementChip
                            key={mkKey(s.placement)}
                            placement={s.placement}
                            lane={s.lane}
                            lanes={s.lanes}
                            top={((toMin(s.placement.start) - times[0]) / SLOT_MIN) * ROW_H}
                            duration={durations[s.placement.kind]}
                            cohort={multiSection.has(s.placement.course) ? cohortLetter(s.placement.section) : undefined}
                            facultyName={facultyOf.get(s.placement.faculty)}
                            flagged={flagged.has(mkKey(s.placement))}
                            onClick={previewing || published ? undefined : () => setInspector({
                              courseCode: s.placement.course,
                              section: s.placement.section,
                              kind: s.placement.kind,
                              index: s.placement.index,
                              day: s.placement.day,
                              startStr: s.placement.start,
                            })}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* inspector */}
          <Inspector
            target={inspector}
            dataset={engineDataset}
            placements={placements}
            days={days}
            onClose={() => setInspector(null)}
            onPlace={handlePlaceOption}
            onManualPlace={handleManualPlace}
          />
        </div>

        {availOpen && dataset && (
          <AvailabilityModal
            dataset={dataset}
            activeCourses={activeCourses}
            activeRooms={activeRooms}
            onSave={(courses, rooms) => {
              // Dropping a course from the semester also clears its placed
              // classes, so the board never keeps orphans the registrar
              // can no longer see in the tray.
              for (const p of placements) {
                if (!(p.course in courses)) removePlacement(mkKey(p));
              }
              setActiveCourses(courses);
              setActiveRooms(rooms);
              setAvailOpen(false);
            }}
            onClose={() => setAvailOpen(false)}
          />
        )}

        {lecturersOpen && dataset && (
          <LecturersModal
            dataset={dataset}
            placements={placements}
            onAssign={assignLecturer}
            onAssignAssistant={assignAssistant}
            onClose={() => setLecturersOpen(false)}
          />
        )}

        {snapsOpen && (
          <SnapshotsModal
            current={placements}
            score={validation?.score ?? null}
            valid={validation?.valid ?? null}
            onRestore={applyDraft}
            onClose={() => setSnapsOpen(false)}
          />
        )}

        {clearOpen && (
          <ClearBoardModal
            count={placements.length}
            onSaveAndClear={saveThenClear}
            onClearOnly={clearBoard}
            onClose={() => setClearOpen(false)}
          />
        )}

        <DragOverlay>
          {activeDrag && (
            <div className={cn(
              "rounded-lg border text-[10px] px-2 py-1 w-28 shadow-lg opacity-90",
              KIND_COLOR[activeDrag.kind] ?? "bg-card border-border",
            )}>
              <div>{activeDrag.course}</div>
              <div className="opacity-50">{activeDrag.kind}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
