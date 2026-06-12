interface StatusBadgeProps {
  valid: boolean | null;
  violations?: number;
  score?: number;
}

const StatusBadge = ({ valid, violations = 0, score }: StatusBadgeProps) => (
  <div className="flex items-center gap-2">
    {valid === null ? (
      <span className="px-2.5 py-1 text-xs rounded-full bg-muted text-muted-foreground">loading</span>
    ) : valid ? (
      <span className="px-2.5 py-1 text-xs rounded-full bg-success/10 text-success font-medium">Ready to publish</span>
    ) : (
      <span className="px-2.5 py-1 text-xs rounded-full bg-destructive/10 text-destructive font-medium">
        {violations} {violations === 1 ? "conflict" : "conflicts"} to fix
      </span>
    )}
    {score !== undefined && (
      <span className="px-2.5 py-1 text-xs rounded-full bg-muted text-muted-foreground">
        quality: {score}
      </span>
    )}
  </div>
);

export default StatusBadge;
