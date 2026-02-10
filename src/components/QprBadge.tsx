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
  pricey: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  mid: "border-zinc-400/40 bg-zinc-400/10 text-zinc-200",
  good_value: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  absolute_steal: "border-teal-400/40 bg-teal-400/10 text-teal-200",
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
