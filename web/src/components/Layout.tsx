import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />

      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={cn(
        "flex-1 min-w-0 transition-all duration-200 p-3",
        isMobile ? "p-0" : collapsed ? "md:ml-14" : "md:ml-56"
      )}>
        <div className="bg-[hsl(0,0%,100%)] rounded-2xl shadow-[0_2px_12px_hsl(0_0%_72%_/_0.35)] h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">
          {isMobile && (
            <div className="sticky top-0 z-20 bg-[hsl(0,0%,100%)] border-b border-border/60 px-4 py-3 flex items-center gap-3 shrink-0">
              <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-muted rounded-md transition-colors" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="text-sm font-normal">Course Scheduling System</h1>
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;
