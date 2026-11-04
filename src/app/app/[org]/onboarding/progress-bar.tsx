/** Barra de progreso accesible con el texto "x/y" al lado. */
export function ProgressBar({
  percent,
  label,
  ariaLabel,
}: {
  percent: number;
  label: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={ariaLabel ?? label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
    </div>
  );
}
