import clsx from "clsx";

interface StatusBadgeProps {
  status: "online" | "offline" | "degraded";
  label?: string;
}

const STATUS_CONFIG = {
  online:   { color: "text-emerald-400", bg: "bg-emerald-400", label: "Online" },
  offline:  { color: "text-red-400",     bg: "bg-red-400",     label: "Offline" },
  degraded: { color: "text-yellow-400",  bg: "bg-yellow-400",  label: "Degraded" },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div className={clsx("flex items-center gap-1.5", cfg.color)}>
      <span className="relative flex h-2 w-2">
        {status === "online" && (
          <span className={clsx("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", cfg.bg)} />
        )}
        <span className={clsx("relative inline-flex rounded-full h-2 w-2", cfg.bg)} />
      </span>
      <span className="text-xs font-mono font-semibold">{label ?? cfg.label}</span>
    </div>
  );
}
