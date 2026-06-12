import { useState, useMemo, useCallback, useEffect } from "react";
import {
  DndContext, DragOverlay,
  MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  CalendarDays, Sparkles, ChevronDown, ChevronRight, X, Loader2,
  Wand2, Download, CheckCircle2, AlertTriangle, Bookmark, FilterX, Trash2, CheckCheck,
} from "lucide-react";
import { useTimetable } from "@/store/timetable";
import {
  validate as apiValidate, suggest as apiSuggest,
  place as apiPlace, generate as apiGenerate,
} from "@/lib/api";
import { listSnapshots, saveSnapshot, deleteSnapshot } from "@/lib/supabase";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import type {
  Placement, PlaceOption, Dataset, GenerateOption, TimetableSnapshot,
} from "@/types";
import { mkKey, pmTime, ftTime, cohortLetter } from "@/types";
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
  placement, lane, lanes, flagged, duration, top, cohort, facultyName, onClick,
}: {
  placement: Placement; lane: number; lanes: number; flagged: boolean;
  duration?: number; top: number; cohort?: string; facultyName?: string;
  onClick?: () => void;
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
      <div className="truncate opacity-50 text-[9px] uppercase tracking-[0.06em]">{placement.kind}</div>
      {facultyName && dur >= 60 && (
        <div className="truncate opacity-60 text-[9px]">{facultyName}</div>
      )}
    </div>
  );
}

function DropCell({ day, timeMin, top, hour }: { day: string; timeMin: number; top: number; hour: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}|${timeMin}` });
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
  courseCode, section, kind, index, cohort, onClick,
}: {
  courseCode: string; section: number; kind: string; index: number;
  cohort?: string; onClick: () => void;
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
      <span className="truncate text-foreground">{courseCode}{cohort ? ` · ${cohort}` : ""}</span>
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
  target, dataset, placements, onClose, onPlace,
}: {
  target: InspectorTarget | null;
  dataset: Dataset | null;
  placements: Placement[];
  onClose: () => void;
  onPlace: (opt: PlaceOption) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [lastKey, setLastKey] = useState("");

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
        {target.day && <div className="text-xs text-muted-foreground">{target.day} {target.startStr ?? ""}</div>}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
        <button
          onClick={loadSuggestions}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
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
    let s = String(v);
    // Guard against spreadsheet formula injection when opened in Excel.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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

function GenerateModal({
  options, onApply, onClose,
}: {
  options: GenerateOption[];
  onApply: (opt: GenerateOption) => void;
  onClose: () => void;
}) {
  const best = options[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[680px] max-h-[90vh] flex flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm text-foreground">Generated drafts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Best option shown first. Drawbacks are listed so you can choose. You can still edit everything after applying.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {options.map((opt, i) => (
            <div key={opt.label} className={cn(
              "rounded-xl border p-4",
              opt === best ? "border-primary/40 bg-primary/[0.03]" : "border-border",
            )}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{opt.label}</span>
                  {i === 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">Recommended</span>
                  )}
                  {opt.complete ? (
                    <span className="flex items-center gap-1 text-[10px] text-success">
                      <CheckCircle2 className="h-3 w-3" /> valid · all meetings placed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {opt.unplaced.length
                        ? `${opt.unplaced.length} unplaced`
                        : `${opt.violations.length} rule violation${opt.violations.length !== 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70">
                    quality: {opt.score}
                  </span>
                  <button
                    onClick={() => onApply(opt)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {opt.penalties.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 mb-1">
                    Minor drawbacks ({opt.penalties.length})
                  </div>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {opt.penalties.map((p, j) => (
                      <li key={j} className="text-xs text-muted-foreground">· {p.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {opt.penalties.length === 0 && opt.complete && (
                <p className="mt-2 text-xs text-muted-foreground italic">No drawbacks found.</p>
              )}

              {opt.violations.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] tracking-[0.08em] uppercase text-destructive/80 mb-1">
                    Conflicts ({opt.violations.length})
                  </div>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {opt.violations.map((v, j) => (
                      <li key={j} className="text-xs text-destructive/90">· {v.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {opt.unplaced.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] tracking-[0.08em] uppercase text-destructive/80 mb-1">
                    Could not place
                  </div>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {opt.unplaced.map((u, j) => (
                      <li key={j} className="text-xs text-muted-foreground">
                        · {u.course}{u.section > 1 ? ` (Cohort ${cohortLetter(u.section)})` : ""} {u.kind}: {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
            <h2 className="text-sm text-foreground">Saved timetables</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Save versions that worked. Restore one later or use it as a starting point for a new draft.
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
                    Restore
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

export default function Timetable() {
  const { placements, dataset, validation, upsertPlacement, applyDraft, setValidation } = useTimetable();
  const [activeDrag, setActiveDrag] = useState<Placement | null>(null);
  const [inspector, setInspector] = useState<InspectorTarget | null>(null);
  const [trayOpen, setTrayOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches,
  );
  const [validating, setValidating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genOptions, setGenOptions] = useState<GenerateOption[] | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [snapsOpen, setSnapsOpen] = useState(false);
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

  const durations = dataset?.durations ?? DURATIONS;

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
        if (filterMajor && c && c.majors.length && !c.majors.includes(filterMajor)) return false;
      }
      return true;
    });
  }, [placements, dataset, filterActive, filterMajor, filterYear, filterFaculty, filterRoom, filterCourse, filterCredits]);

  const slots = useMemo(
    () => layoutGrid(visiblePlacements, durations),
    [visiblePlacements, durations],
  );
  const flagged = new Set(validation?.flagged ?? []);

  const creditValues = useMemo(
    () => [...new Set((dataset?.courses ?? []).map(c => c.credits))].sort((a, b) => a - b),
    [dataset],
  );

  // Cohort letters only matter for courses that actually run more than one.
  const multiSection = useMemo(
    () => new Set((dataset?.courses ?? []).filter(c => c.sections > 1).map(c => c.code)),
    [dataset],
  );
  const facultyOf = useMemo(
    () => new Map((dataset?.faculty ?? []).map(f => [f.id, f.name])),
    [dataset],
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const d = e.active.data.current;
    setActiveDrag(d?.placement ?? null);
  }, []);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveDrag(null);
    if (!e.over) return;
    const [day, timeStr] = String(e.over.id).split("|");
    const timeMin = parseInt(timeStr, 10);
    const src = e.active.data.current;
    if (src?.placement) {
      const p: Placement = src.placement;
      const newStart = toHHMM(timeMin);
      if (p.day === day && p.start === newStart) return;
      await upsertPlacement({ ...p, day, start: newStart });
    } else if (src?.unscheduled) {
      const { courseCode, section, kind, index } = src.unscheduled;
      setInspector({ courseCode, section, kind, index, day, startStr: toHHMM(timeMin) });
    }
  }, [upsertPlacement]);

  const handleValidate = useCallback(async () => {
    if (!dataset) return;
    setValidating(true);
    try {
      const res = await apiValidate(placements, dataset);
      setValidation(res);
    } finally {
      setValidating(false);
    }
  }, [placements, dataset, setValidation]);

  const handleGenerate = useCallback(async () => {
    if (!dataset || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await apiGenerate(dataset);
      if (res.error) setGenError(res.error);
      else setGenOptions(res.options);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [dataset, generating]);

  const handleApplyOption = useCallback((opt: GenerateOption) => {
    applyDraft(opt.placements);
    setGenOptions(null);
  }, [applyDraft]);

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

  const scheduled = useMemo(() => new Set(placements.map(mkKey)), [placements]);
  const unscheduled = useMemo(() => {
    if (!dataset) return [];
    const items: InspectorTarget[] = [];
    for (const c of dataset.courses) {
      for (const [kind, count] of Object.entries(c.sessions)) {
        for (let idx = 0; idx < (count as number); idx++) {
          for (let sec = 1; sec <= c.sections; sec++) {
            if (!scheduled.has(`${c.code}|${sec}|${kind}|${idx}`)) {
              items.push({ courseCode: c.code, section: sec, kind, index: idx });
            }
          }
        }
      }
    }
    return items;
  }, [dataset, scheduled]);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* header */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap bg-background">
        <PageHeader icon={CalendarDays} title="Timetable" subtitle="Drag meetings onto the grid" className="mb-0" />
        <div className="flex items-center gap-2">
          <StatusBadge
            valid={validation?.valid ?? null}
            violations={validation?.violations.length}
            score={validation?.score}
          />
          <button
            onClick={handleValidate}
            disabled={validating || !dataset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {validating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Validate
          </button>
          <button
            onClick={() => dataset && exportCsv(filterActive ? visiblePlacements : placements, dataset)}
            disabled={!dataset || !placements.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => setSnapsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Saved
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !dataset?.courses.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Wand2 className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {genError && (
        <div className="shrink-0 px-4 sm:px-6 py-2 text-xs text-destructive bg-destructive/5 border-b border-border">
          {genError}
        </div>
      )}

      {/* filter bar */}
      <div className="shrink-0 px-4 sm:px-6 py-2 border-b border-border bg-background flex items-center gap-2 flex-wrap">
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
          {(dataset?.faculty ?? []).map(f => (
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
          {(dataset?.rooms ?? []).map(r => (
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
          {(dataset?.courses ?? []).map(c => (
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
            trayOpen ? "w-44" : "w-9",
          )}>
            <button
              onClick={() => setTrayOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-2.5 text-[10px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground border-b border-border w-full shrink-0 transition-colors"
            >
              {trayOpen
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              {trayOpen && <span className="truncate">Unscheduled ({unscheduled.length})</span>}
            </button>
            {trayOpen && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {!unscheduled.length
                  ? <div className="pt-4 flex flex-col items-center gap-1.5 text-center px-2">
                      <CheckCheck className="h-4 w-4 text-success/60" />
                      <p className="text-[10px] text-muted-foreground leading-snug">All classes scheduled</p>
                    </div>
                  : unscheduled.map(u => (
                      <UnscheduledItem
                        key={`${u.courseCode}|${u.section}|${u.kind}|${u.index}`}
                        courseCode={u.courseCode}
                        section={u.section}
                        kind={u.kind}
                        index={u.index}
                        cohort={multiSection.has(u.courseCode) ? cohortLetter(u.section) : undefined}
                        onClick={() => setInspector(u)}
                      />
                    ))}
              </div>
            )}
          </div>

          {/* grid */}
          <div className="flex-1 overflow-auto">
            <div className="min-w-max">
              <div className="flex border-b border-border sticky top-0 bg-background z-10">
                <div className="w-14 shrink-0" />
                {days.map(d => (
                  <div key={d} style={{ width: COL_W }}
                    className="shrink-0 px-3 py-2.5 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 border-r border-border last:border-r-0">
                    {DAY_LABEL[d] ?? d}
                  </div>
                ))}
              </div>
              <div className="flex">
                {/* time gutter: labels on the hour */}
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
                {/* one continuous column per day; chips sit at their exact minute */}
                {days.map(day => (
                  <div
                    key={day}
                    style={{ width: COL_W, height: times.length * ROW_H }}
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
                        flagged={flagged.has(mkKey(s.placement))}
                        onClick={() => setInspector({
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
          </div>

          {/* inspector */}
          <Inspector
            target={inspector}
            dataset={dataset}
            placements={placements}
            onClose={() => setInspector(null)}
            onPlace={handlePlaceOption}
          />
        </div>

        {genOptions && (
          <GenerateModal
            options={genOptions}
            onApply={handleApplyOption}
            onClose={() => setGenOptions(null)}
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
