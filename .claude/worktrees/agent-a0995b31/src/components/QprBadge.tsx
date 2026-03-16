import {
  QPR_LEVEL_LABELS,
  type QprLevel,
} from "@/lib/entryMeta";

type QprBadgeProps = {
  level: QprLevel;
  className?: string;
};

const QPR_STYLES: Record<QprLevel, string> = {
  extortion: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  pricey: "border-red-400/40 bg-red-400/10 text-red-200",
  mid: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  good_value: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  absolute_steal: "border-green-400/40 bg-green-400/10 text-green-200",
};

export default function QprBadge({ level, className = "" }: QprBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${QPR_STYLES[level]} ${className}`.trim()}
    >
      {QPR_LEVEL_LABELS[level]}
    </span>
  );
}
