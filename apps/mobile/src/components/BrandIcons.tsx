import type { ReactElement } from "react";
import Svg, { Circle, Rect, Path, Line, Ellipse } from "react-native-svg";

type BrandIconProps = { size?: number; color?: string };

export function AlertsIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*0.5} cy={s*0.28} r={s*0.15} fill={c} opacity={0.35} />
      <Circle cx={s*0.34} cy={s*0.44} r={s*0.15} fill={c} opacity={0.3} />
      <Circle cx={s*0.66} cy={s*0.44} r={s*0.15} fill={c} opacity={0.35} />
      <Circle cx={s*0.42} cy={s*0.6} r={s*0.15} fill={c} opacity={0.3} />
      <Circle cx={s*0.58} cy={s*0.6} r={s*0.15} fill={c} opacity={0.35} />
      <Circle cx={s*0.5} cy={s*0.74} r={s*0.15} fill={c} opacity={0.25} />
      <Line x1={s*0.5} y1={s*0.13} x2={s*0.5} y2={s*0.08} stroke={c} strokeWidth={s*0.04} opacity={0.6} />
      <Path d={`M${s*0.5} ${s*0.08} Q${s*0.6} ${s*0.05} ${s*0.64} ${s*0.08}`} stroke={c} strokeWidth={s*0.03} fill="none" opacity={0.5} />
    </Svg>
  );
}

export function ShareIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Path d={`M${s*0.38} ${s*0.14} L${s*0.46} ${s*0.14} L${s*0.48} ${s*0.32} L${s*0.36} ${s*0.32} Z`} fill={c} opacity={0.9} />
      <Path d={`M${s*0.34} ${s*0.32} Q${s*0.28} ${s*0.38} ${s*0.28} ${s*0.48} L${s*0.28} ${s*0.76} Q${s*0.28} ${s*0.84} ${s*0.5} ${s*0.84} Q${s*0.72} ${s*0.84} ${s*0.72} ${s*0.76} L${s*0.72} ${s*0.48} Q${s*0.72} ${s*0.38} ${s*0.66} ${s*0.32} Z`} fill={c} opacity={0.85} />
      <Path d={`M${s*0.3} ${s*0.6} L${s*0.3} ${s*0.76} Q${s*0.3} ${s*0.82} ${s*0.5} ${s*0.82} Q${s*0.7} ${s*0.82} ${s*0.7} ${s*0.76} L${s*0.7} ${s*0.6} Z`} fill={c} opacity={0.4} />
      <Path d={`M${s*0.42} ${s*0.18} Q${s*0.3} ${s*0.08} ${s*0.18} ${s*0.22} Q${s*0.1} ${s*0.32} ${s*0.18} ${s*0.42}`} fill="none" stroke={c} strokeWidth={s*0.04} opacity={0.7} />
      <Circle cx={s*0.18} cy={s*0.44} r={s*0.07} fill={c} opacity={0.8} />
    </Svg>
  );
}

export function SaveIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Path d={`M${s*0.22} ${s*0.14} Q${s*0.18} ${s*0.46} ${s*0.5} ${s*0.56} Q${s*0.82} ${s*0.46} ${s*0.78} ${s*0.14} Z`} fill={c} opacity={0.18} />
      <Path d={`M${s*0.22} ${s*0.14} Q${s*0.18} ${s*0.46} ${s*0.5} ${s*0.56} Q${s*0.82} ${s*0.46} ${s*0.78} ${s*0.14}`} fill="none" stroke={c} strokeWidth={s*0.055} opacity={0.9} />
      <Line x1={s*0.5} y1={s*0.56} x2={s*0.5} y2={s*0.78} stroke={c} strokeWidth={s*0.05} opacity={0.85} />
      <Path d={`M${s*0.3} ${s*0.78} Q${s*0.3} ${s*0.84} ${s*0.5} ${s*0.84} Q${s*0.7} ${s*0.84} ${s*0.7} ${s*0.78}`} fill={c} opacity={0.7} />
      <Circle cx={s*0.5} cy={s*0.34} r={s*0.08} fill={c} opacity={0.9} />
      <Circle cx={s*0.41} cy={s*0.44} r={s*0.08} fill={c} opacity={0.7} />
      <Circle cx={s*0.59} cy={s*0.44} r={s*0.08} fill={c} opacity={0.8} />
    </Svg>
  );
}

export function SettingsIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  const nodes: ReactElement[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * Math.PI / 180;
    nodes.push(<Circle key={i} cx={s/2 + s*0.3*Math.cos(a)} cy={s/2 + s*0.3*Math.sin(a)} r={s*0.1} fill={c} />);
  }
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s/2} cy={s/2} r={s*0.16} fill={c} />
      {nodes}
      <Circle cx={s/2} cy={s/2} r={s*0.26} fill="none" stroke={c} strokeWidth={s*0.055} />
    </Svg>
  );
}

export function SearchIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*0.41} cy={s*0.41} r={s*0.27} fill={c} opacity={0.15} />
      <Circle cx={s*0.41} cy={s*0.41} r={s*0.27} fill="none" stroke={c} strokeWidth={s*0.07} />
      <Line x1={s*0.41+s*0.27*0.72} y1={s*0.41+s*0.27*0.72} x2={s*0.83} y2={s*0.83} stroke={c} strokeWidth={s*0.08} />
    </Svg>
  );
}

export function ProfileIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*0.44} cy={s*0.22} r={s*0.14} fill={c} />
      <Path d={`M${s*0.2} ${s*0.72} Q${s*0.2} ${s*0.5} ${s*0.44} ${s*0.48} Q${s*0.58} ${s*0.48} ${s*0.64} ${s*0.52}`} fill="none" stroke={c} strokeWidth={s*0.06} />
      <Path d={`M${s*0.64} ${s*0.52} L${s*0.68} ${s*0.38} Q${s*0.68} ${s*0.32} ${s*0.74} ${s*0.32} Q${s*0.82} ${s*0.32} ${s*0.82} ${s*0.42} Q${s*0.82} ${s*0.52} ${s*0.74} ${s*0.52} L${s*0.68} ${s*0.52}`} fill={c} opacity={0.9} />
      <Path d={`M${s*0.62} ${s*0.48} L${s*0.64} ${s*0.72} Q${s*0.44} ${s*0.76} ${s*0.2} ${s*0.72}`} fill={c} opacity={0.5} />
    </Svg>
  );
}

export function ExploreIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*0.44} cy={s*0.5} r={s*0.3} fill={c} opacity={0.9} />
      <Circle cx={s*0.44} cy={s*0.5} r={s*0.17} fill={c} opacity={0.5} />
      <Circle cx={s*0.8} cy={s*0.28} r={s*0.1} fill={c} opacity={0.85} />
      <Circle cx={s*0.82} cy={s*0.54} r={s*0.08} fill={c} opacity={0.65} />
      <Circle cx={s*0.72} cy={s*0.78} r={s*0.07} fill={c} opacity={0.45} />
      <Line x1={s*0.76} y1={s*0.34} x2={s*0.66} y2={s*0.42} stroke={c} strokeWidth={s*0.03} opacity={0.35} />
      <Line x1={s*0.78} y1={s*0.54} x2={s*0.66} y2={s*0.54} stroke={c} strokeWidth={s*0.03} opacity={0.35} />
      <Line x1={s*0.72} y1={s*0.74} x2={s*0.64} y2={s*0.67} stroke={c} strokeWidth={s*0.03} opacity={0.35} />
    </Svg>
  );
}

export function FollowIcon({ size: s = 20, color: c = "#F5EDD6" }: BrandIconProps) {
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*0.32} cy={s*0.3} r={s*0.13} fill={c} opacity={0.95} />
      <Circle cx={s*0.2} cy={s*0.44} r={s*0.13} fill={c} opacity={0.85} />
      <Circle cx={s*0.44} cy={s*0.44} r={s*0.13} fill={c} opacity={0.9} />
      <Circle cx={s*0.32} cy={s*0.57} r={s*0.13} fill={c} opacity={0.8} />
      <Line x1={s*0.32} y1={s*0.17} x2={s*0.32} y2={s*0.12} stroke={c} strokeWidth={s*0.04} opacity={0.7} />
      <Path d={`M${s*0.32} ${s*0.12} Q${s*0.4} ${s*0.09} ${s*0.43} ${s*0.12}`} stroke={c} strokeWidth={s*0.03} fill="none" opacity={0.5} />
      <Circle cx={s*0.68} cy={s*0.36} r={s*0.1} fill={c} opacity={0.45} />
      <Circle cx={s*0.58} cy={s*0.48} r={s*0.1} fill={c} opacity={0.38} />
      <Circle cx={s*0.78} cy={s*0.48} r={s*0.1} fill={c} opacity={0.42} />
      <Circle cx={s*0.68} cy={s*0.59} r={s*0.1} fill={c} opacity={0.32} />
      <Path d={`M${s*0.45} ${s*0.44} Q${s*0.56} ${s*0.38} ${s*0.58} ${s*0.44}`} fill="none" stroke={c} strokeWidth={s*0.035} opacity={0.5} />
    </Svg>
  );
}
