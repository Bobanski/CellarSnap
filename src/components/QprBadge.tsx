import {
  QPR_LEVEL_LABELS,
  type QprLevel,
} from "@/lib/entryMeta";

type QprBadgeProps = {
  level: QprLevel;
  className?: string;
};

const QPR_STYLES: Record<QprLevel, string> = {
  extortion: "border-[rgba(196,96,122,0.4)] bg-[rgba(196,96,122,0.1)] text-[#C4607A]",
  pricey: "border-[rgba(138,128,120,0.4)] bg-[rgba(138,128,120,0.1)] text-[#C4A882]",
  mid: "border-[rgba(201,168,76,0.4)] bg-[rgba(201,168,76,0.1)] text-[#C9A84C]",
  good_value: "border-[rgba(61,107,79,0.4)] bg-[rgba(61,107,79,0.1)] text-[#3D6B4F]",
  absolute_steal: "border-[rgba(61,107,79,0.4)] bg-[rgba(61,107,79,0.1)] text-[#3D6B4F]",
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
