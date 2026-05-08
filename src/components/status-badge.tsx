import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  pending: {
    dot: "bg-accent-yellow",
    text: "text-accent-yellow",
    bg: "bg-accent-yellow/10",
  },
  processing: {
    dot: "bg-accent-blue animate-pulse",
    text: "text-accent-blue",
    bg: "bg-accent-blue/10",
  },
  completed: {
    dot: "bg-accent-green",
    text: "text-accent-green",
    bg: "bg-accent-green/10",
  },
  failed: {
    dot: "bg-error",
    text: "text-error",
    bg: "bg-error/10",
  },
  cancelled: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted-foreground/10",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5", style.bg)}>
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full", style.dot)} />
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.14em]",
          style.text
        )}
      >
        {status}
      </span>
    </span>
  );
}
