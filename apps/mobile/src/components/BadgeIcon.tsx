import React from "react";
import Svg, { Circle, Path, Line, Ellipse, Rect, Polygon, G } from "react-native-svg";

// ── Color maps (from brand guide) ───────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  barolo: "#4A0E1F",
  grenache: "#7B1D3A",
  rose: "#C4607A",
  nebbiolo: "#4A3060",
  champagne: "#F5EDD6",
  viognier: "#C9A84C",
  green: "#3D6B4F",
  fog: "#8A8078",
};

const TIER_RING: Record<string, string> = {
  nouveau: "#C4607A",
  vieilles_vignes: "#7B1D3A",
  reserve: "#C9A84C",
  mise_en_cave: "#2C1A0E",
};

interface BadgeIconProps {
  shape: string;
  color: string;
  accent: string;
  tier: string;
  size?: number;
  locked?: boolean;
}

export default function BadgeIcon({
  shape,
  color,
  accent,
  tier,
  size = 64,
  locked = false,
}: BadgeIconProps) {
  const bg = COLOR_HEX[color] ?? COLOR_HEX.grenache;
  const acc = COLOR_HEX[accent] ?? COLOR_HEX.champagne;
  const ring = TIER_RING[tier] ?? TIER_RING.vieilles_vignes;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      opacity={locked ? 0.3 : 1}
    >
      {/* outer ring */}
      <Circle cx={40} cy={40} r={37} fill={bg} opacity={0.15} />
      <Circle cx={40} cy={40} r={37} fill="none" stroke={ring} strokeWidth={2.5} opacity={0.9} />
      {/* inner fill */}
      <Circle cx={40} cy={40} r={30} fill={bg} opacity={0.95} />

      {/* ── Shape icons ── */}
      {shape === "cluster" && (
        <G>
          <Circle cx={40} cy={28} r={7} fill={acc} opacity={0.9} />
          <Circle cx={30} cy={40} r={7} fill={acc} opacity={0.75} />
          <Circle cx={50} cy={40} r={7} fill={acc} opacity={0.85} />
          <Circle cx={40} cy={52} r={7} fill={acc} opacity={0.7} />
          <Line x1={40} y1={21} x2={40} y2={17} stroke={acc} strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
          <Path d="M40 17 Q47 14 50 17" stroke={acc} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6} />
        </G>
      )}

      {shape === "drop" && (
        <G>
          <Path d="M40 18 Q50 30 50 40 Q50 52 40 56 Q30 52 30 40 Q30 30 40 18 Z" fill={acc} opacity={0.9} />
          <Ellipse cx={40} cy={47} rx={6} ry={4} fill={bg} opacity={0.5} />
        </G>
      )}

      {shape === "volcano" && (
        <G>
          <Path d="M20 58 L33 32 L40 38 L47 32 L60 58 Z" fill={acc} opacity={0.85} />
          <Path d="M33 32 Q36 24 40 20 Q44 24 47 32" fill={acc} opacity={0.5} />
          <Circle cx={40} cy={20} r={4} fill={ring} opacity={0.9} />
          <Path d="M38 20 Q36 14 34 12" stroke={ring} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.7} />
          <Path d="M40 20 Q40 13 40 11" stroke={ring} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.7} />
          <Path d="M42 20 Q44 14 46 12" stroke={ring} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.7} />
        </G>
      )}

      {shape === "star" && (
        <G>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = ((i * 72 - 90) * Math.PI) / 180;
            const b = ((i * 72 - 90 + 36) * Math.PI) / 180;
            const ox = 40 + 18 * Math.cos(a);
            const oy = 40 + 18 * Math.sin(a);
            const ix = 40 + 8 * Math.cos(b);
            const iy = 40 + 8 * Math.sin(b);
            return (
              <Polygon
                key={i}
                points={`40,40 ${ox},${oy} ${ix},${iy}`}
                fill={acc}
                opacity={0.7 + i * 0.04}
              />
            );
          })}
          <Circle cx={40} cy={40} r={6} fill={acc} opacity={0.95} />
        </G>
      )}

      {shape === "compass" && (
        <G>
          <Circle cx={40} cy={40} r={18} fill="none" stroke={acc} strokeWidth={2} opacity={0.5} />
          <Path d="M40 24 L44 40 L40 36 L36 40 Z" fill={acc} opacity={0.9} />
          <Path d="M40 56 L36 40 L40 44 L44 40 Z" fill={acc} opacity={0.5} />
          <Path d="M24 40 L40 36 L36 40 L40 44 Z" fill={acc} opacity={0.6} />
          <Path d="M56 40 L40 44 L44 40 L40 36 Z" fill={acc} opacity={0.4} />
          <Circle cx={40} cy={40} r={3} fill={acc} />
        </G>
      )}

      {shape === "book" && (
        <G>
          <Rect x={26} y={20} width={28} height={36} rx={3} fill={acc} opacity={0.85} />
          <Rect x={26} y={20} width={5} height={36} rx={2} fill={bg} opacity={0.5} />
          <Line x1={34} y1={29} x2={48} y2={29} stroke={bg} strokeWidth={2} opacity={0.6} strokeLinecap="round" />
          <Line x1={34} y1={35} x2={48} y2={35} stroke={bg} strokeWidth={2} opacity={0.6} strokeLinecap="round" />
          <Line x1={34} y1={41} x2={42} y2={41} stroke={bg} strokeWidth={2} opacity={0.6} strokeLinecap="round" />
        </G>
      )}

      {shape === "leaf" && (
        <G>
          <Path d="M40 20 Q58 28 56 46 Q48 58 40 60 Q32 58 24 46 Q22 28 40 20 Z" fill={acc} opacity={0.85} />
          <Path d="M40 20 Q40 40 40 60" stroke={bg} strokeWidth={2} fill="none" opacity={0.5} strokeLinecap="round" />
          <Path d="M40 35 Q50 33 54 38" stroke={bg} strokeWidth={1.5} fill="none" opacity={0.4} strokeLinecap="round" />
          <Path d="M40 45 Q30 43 26 48" stroke={bg} strokeWidth={1.5} fill="none" opacity={0.4} strokeLinecap="round" />
        </G>
      )}

      {shape === "flame" && (
        <G>
          <Path d="M40 60 Q26 52 26 40 Q26 30 33 24 Q31 34 38 36 Q34 26 40 18 Q44 26 42 34 Q48 28 48 20 Q56 30 54 42 Q54 54 40 60 Z" fill={acc} opacity={0.9} />
          <Ellipse cx={40} cy={50} rx={7} ry={5} fill={bg} opacity={0.3} />
        </G>
      )}

      {shape === "crown" && (
        <G>
          <Path d="M20 54 L20 40 L28 48 L40 28 L52 48 L60 40 L60 54 Z" fill={acc} opacity={0.9} />
          <Rect x={20} y={54} width={40} height={6} rx={2} fill={acc} opacity={0.7} />
          <Circle cx={40} cy={28} r={3} fill={ring} opacity={0.9} />
          <Circle cx={20} cy={40} r={3} fill={ring} opacity={0.9} />
          <Circle cx={60} cy={40} r={3} fill={ring} opacity={0.9} />
        </G>
      )}

      {shape === "lightning" && (
        <G>
          <Path d="M46 18 L32 42 L42 42 L34 62 L52 36 L40 36 Z" fill={acc} opacity={0.9} />
        </G>
      )}

      {shape === "hourglass" && (
        <G>
          <Path d="M26 18 L54 18 L40 40 L54 62 L26 62 L40 40 Z" fill={acc} opacity={0.85} />
          <Line x1={26} y1={18} x2={54} y2={18} stroke={ring} strokeWidth={2.5} opacity={0.7} />
          <Line x1={26} y1={62} x2={54} y2={62} stroke={ring} strokeWidth={2.5} opacity={0.7} />
          <Ellipse cx={40} cy={40} rx={6} ry={3} fill={bg} opacity={0.4} />
        </G>
      )}

      {/* tier pip row */}
      <G>
        {tier === "vieilles_vignes" && (
          <Circle cx={40} cy={72} r={2.5} fill={ring} opacity={0.8} />
        )}
        {tier === "reserve" &&
          [36, 40, 44].map((x) => (
            <Circle key={x} cx={x} cy={72} r={2.5} fill={ring} opacity={0.9} />
          ))}
        {tier === "mise_en_cave" &&
          [33, 37, 41, 45, 49].map((x) => (
            <Circle key={x} cx={x} cy={72} r={2} fill={ring} opacity={0.85} />
          ))}
      </G>
    </Svg>
  );
}
