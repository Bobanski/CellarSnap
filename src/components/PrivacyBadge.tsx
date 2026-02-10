"use client";

import type { PrivacyLevel } from "@/types/wine";

type PrivacyBadgeProps = {
  level: PrivacyLevel;
  className?: string;
  compact?: boolean;
};

const PRIVACY_STYLES: Record<PrivacyLevel, string> = {
  public:
    "border-sky-300/40 bg-sky-500/10 text-sky-100",
  friends:
    "accent-soft-chip",
  private:
    "border-rose-300/40 bg-rose-500/10 text-rose-100",
};

const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  public: "Public",
  friends: "Friends only",
  private: "Private",
};

export default function PrivacyBadge({
  level,
  className = "",
  compact = false,
}: PrivacyBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.08em] ${
        compact ? "text-[10px]" : "text-[11px]"
      } ${PRIVACY_STYLES[level]} ${className}`.trim()}
    >
      {PRIVACY_LABELS[level]}
    </span>
  );
}
