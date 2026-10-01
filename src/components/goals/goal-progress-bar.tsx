import { cn } from "@/lib/utils";

/** Barra de progreso fina (sin dependencia de colores de estado). */
export function ProgressBar({
  percent,
  tone = "default",
  className,
  label,
}: {
  percent: number;
  tone?: "default" | "income" | "warning" | "critical" | "over";
  className?: string;
  label?: string;
}) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          tone === "default" && "bg-foreground",
          tone === "income" && "bg-income",
          tone === "warning" && "bg-warning",
          (tone === "critical" || tone === "over") && "bg-expense",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
