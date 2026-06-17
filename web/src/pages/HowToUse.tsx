import { useNavigate } from "react-router-dom";
import {
  HelpCircle, BookOpen, Users, School, GraduationCap,
  CalendarDays, Wand2, UserCheck, CheckCircle2, Printer,
  LayoutDashboard, ArrowRight, Lightbulb, Circle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useTimetable } from "@/store/timetable";
import { cn } from "@/lib/utils";

interface Step {
  number: number;
  title: string;
  description: string;
  detail: string;
  icon: React.ElementType;
  to?: string;
  linkLabel?: string;
}

const STEPS: Step[] = [
  {
    number: 1,
    title: "Load your data",
    description: "Add courses, faculty, classrooms, and student counts before scheduling.",
    detail:
      "Go to Courses and add every course offered — including the number of weekly sessions (lectures, discussions, labs) and how many cohort sections run. Then add your lecturers under Faculty (with availability and load limits), your rooms under Classrooms (capacity and type), and student headcounts under Students.",
    icon: BookOpen,
    to: "/courses",
    linkLabel: "Go to Courses",
  },
  {
    number: 2,
    title: "Create a timetable session",
    description: "A session represents one semester's timetable. You can keep multiple sessions side by side.",
    detail:
      'Open the Timetable page and use the session switcher at the top to create a new session — give it a name like "Semester 1 · 2025/26". Sessions are independent, so you can draft a second semester without touching the current one.',
    icon: CalendarDays,
    to: "/timetable",
    linkLabel: "Go to Timetable",
  },
  {
    number: 3,
    title: "Pick courses for this semester",
    description: "Choose which courses run this semester and how many sections each needs.",
    detail:
      "In the Timetable panel, expand the course list on the left. Tick each course that runs this semester and set its section count. Only selected courses appear in the scheduling grid and in the Dashboard stats.",
    icon: BookOpen,
    to: "/timetable",
    linkLabel: "Go to Timetable",
  },
  {
    number: 4,
    title: "Build the timetable",
    description: "Generate a full schedule automatically, or place classes by hand — or both.",
    detail:
      'Click "Generate" to let the engine schedule everything at once. It respects room capacities, lecturer availability, and your scheduling rules. You can then drag any class to a different slot to fine-tune it. To place a single class manually, drag it from the unscheduled list on the left onto the grid.',
    icon: Wand2,
    to: "/timetable",
    linkLabel: "Go to Timetable",
  },
  {
    number: 5,
    title: "Assign faculty",
    description: "Every class needs a lecturer before the timetable is complete.",
    detail:
      'Classes without a lecturer show an "Unassigned" badge. Click a class on the grid to open its detail panel, then pick a lecturer from the dropdown. The system flags any double-bookings or qualification mismatches immediately.',
    icon: UserCheck,
    to: "/timetable",
    linkLabel: "Go to Timetable",
  },
  {
    number: 6,
    title: "Check for conflicts",
    description: "Validate the timetable and fix any issues before publishing.",
    detail:
      'Click "Validate" to run a full conflict check. Errors appear inline on the grid and in the conflict list — student cohort clashes, room double-bookings, lecturer overloads, and more. Fix each one by moving or reassigning the flagged class. The Dashboard "Needs attention" card also gives you a quick summary.',
    icon: CheckCircle2,
    to: "/dashboard",
    linkLabel: "Go to Dashboard",
  },
  {
    number: 7,
    title: "Publish and share",
    description: "Lock the final timetable and print or export it for distribution.",
    detail:
      'When there are no remaining conflicts, click "Publish" to lock the session as the official version. From the Timetable view, use the Print button to get a clean week-view PDF you can share with students and staff.',
    icon: Printer,
    to: "/timetable",
    linkLabel: "Go to Timetable",
  },
];

const TIPS = [
  {
    icon: Lightbulb,
    text: "Run the full-year check on the Dashboard (under Advanced settings) to confirm both semesters fit your rooms and lecturers before committing.",
  },
  {
    icon: Lightbulb,
    text: "Duplicate a published session to start drafting the next semester without losing the current official one.",
  },
  {
    icon: Lightbulb,
    text: "Adjust minimum break and lunch window in Dashboard → Advanced settings before generating — the engine applies them automatically.",
  },
  {
    icon: Lightbulb,
    text: 'Use "Suggest" on an unscheduled class to see the best available slots ranked by conflict score instead of placing it blind.',
  },
];

export default function HowToUse() {
  const navigate = useNavigate();
  const { dataset, sessions, placements, activeCourses } = useTimetable();

  const checks = [
    {
      label: "Courses added",
      done: (dataset?.courses.length ?? 0) > 0,
      to: "/courses",
    },
    {
      label: "Faculty added",
      done: (dataset?.faculty.length ?? 0) > 0,
      to: "/faculty",
    },
    {
      label: "Classrooms added",
      done: (dataset?.rooms.length ?? 0) > 0,
      to: "/classrooms",
    },
    {
      label: "Session created",
      done: sessions.length > 0,
      to: "/timetable",
    },
    {
      label: "Courses selected for semester",
      done: activeCourses !== null && Object.keys(activeCourses).length > 0,
      to: "/timetable",
    },
    {
      label: "Classes scheduled",
      done: placements.length > 0,
      to: "/timetable",
    },
  ];

  const doneCount = checks.filter(c => c.done).length;
  const allDone = doneCount === checks.length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 md:py-7 space-y-6">

        <PageHeader
          icon={HelpCircle}
          title="How to use"
          subtitle="A step-by-step guide to building your semester timetable"
        />

        {/* Readiness checklist */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">
              Setup checklist
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {doneCount} / {checks.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {checks.map(({ label, done, to }) => (
              <button
                key={label}
                onClick={() => !done && navigate(to)}
                className={cn(
                  "flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-xs transition-colors",
                  done
                    ? "text-foreground cursor-default"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                  : <Circle className="h-3.5 w-3.5 text-border shrink-0" />}
                <span className={done ? "line-through text-muted-foreground/60" : ""}>{label}</span>
                {!done && <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground/40 shrink-0" />}
              </button>
            ))}
          </div>
          {allDone && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
              Setup complete — publish your timetable once there are no remaining conflicts.
            </p>
          )}
        </div>

        {/* Quick-nav bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Dashboard",  icon: LayoutDashboard, to: "/dashboard"  },
            { label: "Timetable",  icon: CalendarDays,    to: "/timetable"  },
            { label: "Courses",    icon: BookOpen,        to: "/courses"    },
            { label: "Faculty",    icon: Users,           to: "/faculty"    },
          ].map(({ label, icon: Icon, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            >
              <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs text-foreground">{label}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50 ml-auto shrink-0" />
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">
            Workflow · 7 steps
          </div>

          {STEPS.map((step, i) => (
            <StepCard key={i} step={step} onNavigate={navigate} />
          ))}
        </div>

        {/* Tips */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50 mb-3">
            Tips
          </div>
          <ul className="space-y-3">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex gap-3">
                <tip.icon className="h-3.5 w-3.5 text-primary/70 shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground leading-relaxed">{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Data pages reference */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50 mb-3">
            Data pages
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { icon: BookOpen,        label: "Courses",    desc: "Add and edit courses, sessions per week, and section counts", to: "/courses"    },
              { icon: Users,           label: "Faculty",    desc: "Manage lecturers, availability windows, and teaching loads",  to: "/faculty"    },
              { icon: School,          label: "Classrooms", desc: "Set room capacity, type (lecture hall / lab), and restrictions", to: "/classrooms" },
              { icon: GraduationCap,   label: "Students",   desc: "Enter headcounts per year group used for room sizing and simulation", to: "/students"  },
            ].map(({ icon: Icon, label, desc, to }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="flex gap-3 items-start text-left px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <Icon className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-foreground">{label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function StepCard({ step, onNavigate }: { step: Step; onNavigate: (to: string) => void }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
          <div className={cn(
            "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium",
            "bg-primary/10 text-primary",
          )}>
            {step.number}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <step.icon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <span className="text-sm text-foreground">{step.title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-2 leading-relaxed">{step.detail}</p>
          {step.to && (
            <button
              onClick={() => onNavigate(step.to!)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2"
            >
              {step.linkLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
