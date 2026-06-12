import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

const PageHeader = ({ icon: Icon, title, subtitle, actions, className }: PageHeaderProps) => (
  <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-4", className)}>
    <div className="flex items-center gap-2 text-foreground">
      <Icon className="h-5 w-5 text-primary" />
      <div>
        <h1 className="text-lg font-normal leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && (
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {actions}
      </div>
    )}
  </div>
);

export default PageHeader;
