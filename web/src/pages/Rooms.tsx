import { School, X, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { useTimetable } from "@/store/timetable";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SortIcon from "@/components/SortIcon";
import { cn } from "@/lib/utils";
import type { Room } from "@/types";

type SortKey = "id" | "name" | "type" | "capacity" | "building";

const ROOM_TYPES = ["lecture", "lab", "computer_lab", "seminar"];

const TYPE_BADGE: Record<string, string> = {
  lecture:      "bg-primary/10 text-primary",
  lab:          "bg-muted text-muted-foreground",
  computer_lab: "bg-muted text-muted-foreground",
  seminar:      "bg-muted text-muted-foreground",
};

const EMPTY: Room = { id: "", name: "", type: "lecture", capacity: 30, equipment: [], building: "" };

function RoomModal({
  initial,
  onSave,
  onClose,
  isNew,
}: {
  initial: Room;
  onSave: (r: Room) => void;
  onClose: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Room>({ ...initial });
  const [equipInput, setEquipInput] = useState(initial.equipment.join(", "));
  const [error, setError] = useState("");

  const set = (patch: Partial<Room>) => setForm(f => ({ ...f, ...patch }));

  const save = () => {
    if (!form.id.trim()) return setError("Room ID is required.");
    if (!form.name.trim()) return setError("Name is required.");
    if (!form.building.trim()) return setError("Building is required.");
    if (form.capacity < 1) return setError("Capacity must be at least 1.");
    onSave({ ...form, equipment: equipInput.split(",").map(s => s.trim()).filter(Boolean) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="text-sm text-foreground">{isNew ? "Add classroom" : "Edit classroom"}</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3.5">
          {error && <p className="text-xs text-destructive">{error}</p>}

          <Field label="Room ID">
            <input
              value={form.id}
              onChange={e => set({ id: e.target.value })}
              disabled={!isNew}
              placeholder="e.g. MH-201"
              className="field-input disabled:opacity-50"
            />
          </Field>

          <Field label="Name">
            <input
              value={form.name}
              onChange={e => set({ name: e.target.value })}
              placeholder="e.g. Main Hall 201"
              className="field-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={form.type} onChange={e => set({ type: e.target.value })} className="field-input">
                {ROOM_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Capacity">
              <input
                type="number" min={1}
                value={form.capacity}
                onChange={e => set({ capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                className="field-input"
              />
            </Field>
          </div>

          <Field label="Building">
            <input
              value={form.building}
              onChange={e => set({ building: e.target.value })}
              placeholder="e.g. Main Building"
              className="field-input"
            />
          </Field>

          <Field label="Equipment" hint="comma-separated">
            <input
              value={equipInput}
              onChange={e => setEquipInput(e.target.value)}
              placeholder="e.g. projector, whiteboard"
              className="field-input"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {isNew ? "Add classroom" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function Rooms() {
  const { dataset, upsertRoom, removeRoom } = useTimetable();
  const [sort, setSort] = useState<SortKey>("id");
  const [asc, setAsc] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ room: Room; isNew: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

  const rooms = dataset?.rooms ?? [];

  const filtered = rooms.filter(
    r => r.id.toLowerCase().includes(search.toLowerCase())
      || r.name.toLowerCase().includes(search.toLowerCase())
      || r.building.toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0;
    if (sort === "id")       { av = a.id;       bv = b.id; }
    else if (sort === "name")     { av = a.name;     bv = b.name; }
    else if (sort === "type")     { av = a.type;     bv = b.type; }
    else if (sort === "capacity") { av = a.capacity; bv = b.capacity; }
    else if (sort === "building") { av = a.building; bv = b.building; }
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
    { label: "Total classrooms", value: rooms.length },
    { label: "Lecture halls",    value: rooms.filter(r => r.type === "lecture").length },
    { label: "Labs",             value: rooms.filter(r => r.type === "lab" || r.type === "computer_lab").length },
    { label: "Avg capacity",     value: rooms.length ? Math.round(rooms.reduce((s, r) => s + r.capacity, 0) / rooms.length) : 0 },
  ];

  const canEdit = !!dataset;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-5">

        <PageHeader
          icon={School}
          title="Classrooms"
          subtitle="All classrooms and labs"
          actions={
            <button
              onClick={() => canEdit && setModal({ room: { ...EMPTY }, isNew: true })}
              disabled={!canEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add classroom
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
              placeholder="Search by ID, name or building..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {sorted.length} / {rooms.length}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls("id")}       onClick={() => toggle("id")}>ID <SortIcon active={sort==="id"} asc={asc} /></th>
                  <th className={thCls("name")}     onClick={() => toggle("name")}>Name <SortIcon active={sort==="name"} asc={asc} /></th>
                  <th className={thCls("type")}     onClick={() => toggle("type")}>Type <SortIcon active={sort==="type"} asc={asc} /></th>
                  <th className={thCls("capacity")} onClick={() => toggle("capacity")}>Capacity <SortIcon active={sort==="capacity"} asc={asc} /></th>
                  <th className={thCls("building")} onClick={() => toggle("building")}>Building <SortIcon active={sort==="building"} asc={asc} /></th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.08em] uppercase text-muted-foreground/70 whitespace-nowrap">Equipment</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {!sorted.length && (
                  <tr>
                    <td colSpan={7}>
                      {search
                        ? <EmptyState icon={Search} title="No classrooms match your search" description="Try a different name, ID, or building." compact />
                        : <EmptyState icon={School} title="No classrooms added yet" description="Add lecture halls, labs, and seminar rooms. Capacity and equipment are used to match rooms to courses automatically." compact />
                      }
                    </td>
                  </tr>
                )}
                {sorted.map((r, i) => (
                  <tr key={r.id} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors group", i % 2 !== 0 && "bg-muted/10")}>
                    <td className="px-4 py-3 font-mono text-primary">{r.id}</td>
                    <td className="px-4 py-3 text-foreground">{r.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] tracking-[0.04em] px-2 py-0.5 rounded-full", TYPE_BADGE[r.type] ?? "bg-muted text-muted-foreground")}>
                        {r.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{r.capacity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.building}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.equipment.length
                          ? r.equipment.map(e => <span key={e} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">{e}</span>)
                          : <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal({ room: { ...r }, isNew: false })}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(r)}
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
        <RoomModal
          initial={modal.room}
          isNew={modal.isNew}
          onClose={() => setModal(null)}
          onSave={r => { upsertRoom(r); setModal(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="text-sm text-foreground">Remove {confirmDelete.name}?</div>
            <p className="text-xs text-muted-foreground">This will remove the classroom from the catalogue. Any timetable entries using it will become unassigned.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => { removeRoom(confirmDelete.id); setConfirmDelete(null); }}
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
