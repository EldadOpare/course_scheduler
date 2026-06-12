import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export default function EmptyState({ icon: Icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "py-8 gap-2" : "py-16 gap-4")}>
      <div className={cn(
        "rounded-xl bg-muted flex items-center justify-center",
        compact ? "h-8 w-8" : "h-11 w-11",
      )}>
        <Icon className={cn("text-muted-foreground/40", compact ? "h-4 w-4" : "h-5 w-5")} />
      </div>
      <div>
        <div className={cn("text-foreground", compact ? "text-xs" : "text-sm")}>{title}</div>
        {description && (
          <div className={cn("text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed", compact ? "text-[11px]" : "text-xs")}>
            {description}
          </div>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
