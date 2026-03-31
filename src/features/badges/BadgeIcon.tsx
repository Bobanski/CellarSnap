"use client";

import React from "react";

type BadgeShape =
  | "cluster"
  | "drop"
  | "volcano"
  | "star"
  | "compass"
  | "book"
  | "leaf"
  | "flame"
  | "crown"
  | "lightning"
  | "hourglass";

type BadgeTier = "nouveau" | "vieilles_vignes" | "reserve" | "mise_en_cave";

type BadgeColor =
  | "barolo"
  | "grenache"
  | "rose"
  | "nebbiolo"
  | "champagne"
  | "viognier"
  | "green"
  | "fog";

interface BadgeIconProps {
  shape: BadgeShape;
  color: BadgeColor;
  accent: BadgeColor;
  tier: BadgeTier;
  size?: number;
  locked?: boolean;
}

const COLOR_HEX: Record<BadgeColor, string> = {
  barolo: "#4A0E1F",
  grenache: "#7B1D3A",
  rose: "#C4607A",
  nebbiolo: "#4A3060",
  champagne: "#F5EDD6",
  viognier: "#C9A84C",
  green: "#3D6B4F",
  fog: "#8A8078",
};

const TIER_RING: Record<BadgeTier, string> = {
  nouveau: "#C4607A",
  vieilles_vignes: "#7B1D3A",
  reserve: "#C9A84C",
  mise_en_cave: "#2C1A0E",
};

function renderShape(shape: BadgeShape, acc: string, bg: string, ring: string) {
  switch (shape) {
    case "cluster":
      return (
        <>
          <circle cx="40" cy="28" r="7" fill={acc} opacity="0.9" />
          <circle cx="30" cy="40" r="7" fill={acc} opacity="0.75" />
          <circle cx="50" cy="40" r="7" fill={acc} opacity="0.85" />
          <circle cx="40" cy="52" r="7" fill={acc} opacity="0.7" />
          <line x1="40" y1="21" x2="40" y2="17" stroke={acc} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
          <path d="M40 17 Q47 14 50 17" stroke={acc} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        </>
      );
    case "drop":
      return (
        <>
          <path d="M40 18 Q50 30 50 40 Q50 52 40 56 Q30 52 30 40 Q30 30 40 18 Z" fill={acc} opacity="0.9" />
          <ellipse cx="40" cy="47" rx="6" ry="4" fill={bg} opacity="0.5" />
        </>
      );
    case "volcano":
      return (
        <>
          <path d="M20 58 L33 32 L40 38 L47 32 L60 58 Z" fill={acc} opacity="0.85" />
          <path d="M33 32 Q36 24 40 20 Q44 24 47 32" fill={acc} opacity="0.5" />
          <circle cx="40" cy="20" r="4" fill={ring} opacity="0.9" />
          <path d="M38 20 Q36 14 34 12" stroke={ring} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M40 20 Q40 13 40 11" stroke={ring} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M42 20 Q44 14 46 12" stroke={ring} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
        </>
      );
    case "star": {
      const points: React.ReactNode[] = [];
      for (let i = 0; i < 5; i++) {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        const b = ((i * 72 - 90 + 36) * Math.PI) / 180;
        const ox = 40 + 18 * Math.cos(a);
        const oy = 40 + 18 * Math.sin(a);
        const ix = 40 + 8 * Math.cos(b);
        const iy = 40 + 8 * Math.sin(b);
        points.push(
          <polygon
            key={i}
            points={`40,40 ${ox},${oy} ${ix},${iy}`}
            fill={acc}
            opacity={0.7 + i * 0.04}
          />
        );
      }
      return (
        <>
          {points}
          <circle cx="40" cy="40" r="6" fill={acc} opacity="0.95" />
        </>
      );
    }
    case "compass":
      return (
        <>
          <circle cx="40" cy="40" r="18" fill="none" stroke={acc} strokeWidth="2" opacity="0.5" />
          <path d="M40 24 L44 40 L40 36 L36 40 Z" fill={acc} opacity="0.9" />
          <path d="M40 56 L36 40 L40 44 L44 40 Z" fill={acc} opacity="0.5" />
          <path d="M24 40 L40 36 L36 40 L40 44 Z" fill={acc} opacity="0.6" />
          <path d="M56 40 L40 44 L44 40 L40 36 Z" fill={acc} opacity="0.4" />
          <circle cx="40" cy="40" r="3" fill={acc} />
        </>
      );
    case "book":
      return (
        <>
          <rect x="26" y="20" width="28" height="36" rx="3" fill={acc} opacity="0.85" />
          <rect x="26" y="20" width="5" height="36" rx="2" fill={bg} opacity="0.5" />
          <line x1="34" y1="29" x2="48" y2="29" stroke={bg} strokeWidth="2" opacity="0.6" strokeLinecap="round" />
          <line x1="34" y1="35" x2="48" y2="35" stroke={bg} strokeWidth="2" opacity="0.6" strokeLinecap="round" />
          <line x1="34" y1="41" x2="42" y2="41" stroke={bg} strokeWidth="2" opacity="0.6" strokeLinecap="round" />
        </>
      );
    case "leaf":
      return (
        <>
          <path d="M40 20 Q58 28 56 46 Q48 58 40 60 Q32 58 24 46 Q22 28 40 20 Z" fill={acc} opacity="0.85" />
          <path d="M40 20 Q40 40 40 60" stroke={bg} strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
          <path d="M40 35 Q50 33 54 38" stroke={bg} strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
          <path d="M40 45 Q30 43 26 48" stroke={bg} strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
        </>
      );
    case "flame":
      return (
        <>
          <path d="M40 60 Q26 52 26 40 Q26 30 33 24 Q31 34 38 36 Q34 26 40 18 Q44 26 42 34 Q48 28 48 20 Q56 30 54 42 Q54 54 40 60 Z" fill={acc} opacity="0.9" />
          <ellipse cx="40" cy="50" rx="7" ry="5" fill={bg} opacity="0.3" />
        </>
      );
    case "crown":
      return (
        <>
          <path d="M20 54 L20 40 L28 48 L40 28 L52 48 L60 40 L60 54 Z" fill={acc} opacity="0.9" />
          <rect x="20" y="54" width="40" height="6" rx="2" fill={acc} opacity="0.7" />
          <circle cx="40" cy="28" r="3" fill={ring} opacity="0.9" />
          <circle cx="20" cy="40" r="3" fill={ring} opacity="0.9" />
          <circle cx="60" cy="40" r="3" fill={ring} opacity="0.9" />
        </>
      );
    case "lightning":
      return (
        <path d="M46 18 L32 42 L42 42 L34 62 L52 36 L40 36 Z" fill={acc} opacity="0.9" />
      );
    case "hourglass":
      return (
        <>
          <path d="M26 18 L54 18 L40 40 L54 62 L26 62 L40 40 Z" fill={acc} opacity="0.85" />
          <line x1="26" y1="18" x2="54" y2="18" stroke={ring} strokeWidth="2.5" opacity="0.7" />
          <line x1="26" y1="62" x2="54" y2="62" stroke={ring} strokeWidth="2.5" opacity="0.7" />
          <ellipse cx="40" cy="40" rx="6" ry="3" fill={bg} opacity="0.4" />
        </>
      );
  }
}

function renderTierPips(tier: BadgeTier, ring: string) {
  switch (tier) {
    case "nouveau":
      return null;
    case "vieilles_vignes":
      return <circle cx="40" cy="72" r="2.5" fill={ring} opacity="0.8" />;
    case "reserve":
      return (
        <>
          {[36, 40, 44].map((x) => (
            <circle key={x} cx={x} cy="72" r="2.5" fill={ring} opacity="0.9" />
          ))}
        </>
      );
    case "mise_en_cave":
      return (
        <>
          {[33, 37, 41, 45, 49].map((x) => (
            <circle key={x} cx={x} cy="72" r="2" fill={ring} opacity="0.85" />
          ))}
        </>
      );
  }
}

export default function BadgeIcon({
  shape,
  color,
  accent,
  tier,
  size = 80,
  locked = false,
}: BadgeIconProps) {
  const bg = COLOR_HEX[color] ?? COLOR_HEX.grenache;
  const acc = COLOR_HEX[accent] ?? COLOR_HEX.champagne;
  const ring = TIER_RING[tier] ?? TIER_RING.vieilles_vignes;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      style={locked ? { filter: "grayscale(1)", opacity: 0.3 } : undefined}
      aria-hidden="true"
    >
      {/* outer ring */}
      <circle cx="40" cy="40" r="37" fill={bg} opacity="0.15" />
      <circle cx="40" cy="40" r="37" fill="none" stroke={ring} strokeWidth="2.5" opacity="0.9" />
      {/* inner fill */}
      <circle cx="40" cy="40" r="30" fill={bg} opacity="0.95" />
      {/* icon shape */}
      {renderShape(shape, acc, bg, ring)}
      {/* tier pips */}
      <g>{renderTierPips(tier, ring)}</g>
    </svg>
  );
}
