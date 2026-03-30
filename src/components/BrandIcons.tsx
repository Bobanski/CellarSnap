import React from "react";

type BrandIconProps = { size?: number; color?: string; className?: string };

export function AlertsIcon({ size: s = 20, color: c = "#F0ECE4", className }: BrandIconProps) {
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" className={className}>
      <circle cx={s*0.5} cy={s*0.28} r={s*0.15} fill={c} opacity={0.35} />
      <circle cx={s*0.34} cy={s*0.44} r={s*0.15} fill={c} opacity={0.3} />
      <circle cx={s*0.66} cy={s*0.44} r={s*0.15} fill={c} opacity={0.35} />
      <circle cx={s*0.42} cy={s*0.6} r={s*0.15} fill={c} opacity={0.3} />
      <circle cx={s*0.58} cy={s*0.6} r={s*0.15} fill={c} opacity={0.35} />
      <circle cx={s*0.5} cy={s*0.74} r={s*0.15} fill={c} opacity={0.25} />
      <line x1={s*0.5} y1={s*0.13} x2={s*0.5} y2={s*0.08} stroke={c} strokeWidth={s*0.04} opacity={0.6} />
      <path d={`M${s*0.5} ${s*0.08} Q${s*0.6} ${s*0.05} ${s*0.64} ${s*0.08}`} stroke={c} strokeWidth={s*0.03} fill="none" opacity={0.5} />
    </svg>
  );
}

export function SettingsIcon({ size: s = 20, color: c = "#F0ECE4", className }: BrandIconProps) {
  const nodes: React.ReactElement[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * Math.PI / 180;
    nodes.push(<circle key={i} cx={s/2 + s*0.3*Math.cos(a)} cy={s/2 + s*0.3*Math.sin(a)} r={s*0.1} fill={c} />);
  }
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" className={className}>
      <circle cx={s/2} cy={s/2} r={s*0.16} fill={c} />
      {nodes}
      <circle cx={s/2} cy={s/2} r={s*0.26} fill="none" stroke={c} strokeWidth={s*0.055} />
    </svg>
  );
}

export function SearchIcon({ size: s = 20, color: c = "#F0ECE4", className }: BrandIconProps) {
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" className={className}>
      <circle cx={s*0.41} cy={s*0.41} r={s*0.27} fill={c} opacity={0.15} />
      <circle cx={s*0.41} cy={s*0.41} r={s*0.27} fill="none" stroke={c} strokeWidth={s*0.07} />
      <line x1={s*0.41+s*0.27*0.72} y1={s*0.41+s*0.27*0.72} x2={s*0.83} y2={s*0.83} stroke={c} strokeWidth={s*0.08} />
    </svg>
  );
}
