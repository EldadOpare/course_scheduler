import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, BookOpen, Users, School, GraduationCap,
  X, PanelLeftClose, PanelLeftOpen, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ashLogo from "@/assets/ash_logo.png";
import { useIsMobile } from "@/hooks/use-mobile";

const SCHEDULING = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/timetable", label: "Timetable",  icon: CalendarDays   },
];

const DATA = [
  { to: "/courses",    label: "Courses",    icon: BookOpen      },
  { to: "/faculty",    label: "Faculty",    icon: Users         },
  { to: "/classrooms", label: "Classrooms", icon: School        },
  { to: "/students",   label: "Students",   icon: GraduationCap },
];

const HELP = [
  { to: "/how-to-use", label: "How to use", icon: HelpCircle },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const NavItem = ({
  to, icon: Icon, label, collapsed, onClick,
}: {
  to: string; icon: React.ElementType; label: string;
  collapsed: boolean; onClick?: () => void;
}) => (
  <div className="relative group">
    <NavLink to={to} end onClick={onClick}>
      {({ isActive }) => (
        <div className={cn(
          "flex items-center rounded-lg transition-colors",
          collapsed ? "justify-center px-0 py-2.5 mx-1" : "gap-3 px-3 py-2.5",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}>
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm">{label}</span>}
        </div>
      )}
    </NavLink>
    {collapsed && (
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-card border border-border rounded-md text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-md">
        {label}
      </div>
    )}
  </div>
);

const Sidebar = ({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) => {
  const isMobile = useIsMobile();
  useLocation();

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-background z-40 flex flex-col transition-all duration-200",
      collapsed ? "w-14" : "w-56",
      isMobile && !isOpen && "-translate-x-full",
    )}>
      <div className="relative flex flex-col items-center px-3 pt-5 pb-3 shrink-0">
        {isMobile && !collapsed && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <img
          src={ashLogo}
          alt="Ashesi University"
          className={cn("w-auto object-contain", collapsed ? "h-9" : "h-20")}
        />
        {!collapsed && (
          <>
            <p className="text-sm font-normal text-foreground mt-1">Course</p>
            <p className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground/55">Scheduling System</p>
          </>
        )}
      </div>

      <nav className={cn("flex-1 py-2", collapsed ? "overflow-visible" : "overflow-y-auto")}>
        {collapsed ? (
          <div className="space-y-1 px-1.5">
            {[...SCHEDULING, ...DATA, ...HELP].map(({ to, icon, label }) => (
              <NavItem key={to} to={to} icon={icon} label={label} collapsed onClick={() => isMobile && onClose()} />
            ))}
          </div>
        ) : (
          <div className="px-3 space-y-4">
            <div>
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">
                Schedule
              </div>
              <div className="space-y-0.5">
                {SCHEDULING.map(({ to, icon, label }) => (
                  <NavItem key={to} to={to} icon={icon} label={label} collapsed={false} onClick={() => isMobile && onClose()} />
                ))}
              </div>
            </div>
            <div>
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">
                Data
              </div>
              <div className="space-y-0.5">
                {DATA.map(({ to, icon, label }) => (
                  <NavItem key={to} to={to} icon={icon} label={label} collapsed={false} onClick={() => isMobile && onClose()} />
                ))}
              </div>
            </div>
            <div>
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">
                Help
              </div>
              <div className="space-y-0.5">
                {HELP.map(({ to, icon, label }) => (
                  <NavItem key={to} to={to} icon={icon} label={label} collapsed={false} onClick={() => isMobile && onClose()} />
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      <div className="px-4 pb-4 pt-2 shrink-0 flex flex-col items-center gap-2">
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
        {!collapsed && (
          <>
            <p className="text-[10px] text-center text-muted-foreground/60">© Ashesi University</p>
            <p className="text-[10px] text-center text-muted-foreground/40">All rights reserved</p>
          </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
