import React from "react";
import Svg, { Polygon, Line, Text as SvgText } from "react-native-svg";
import { View, StyleSheet } from "react-native";

type FlavorData = {
  Tannin: number;
  Acidity: number;
  Body: number;
  Oak: number;
  Fruit: number;
};

type FlavorRadarProps = {
  data: FlavorData;
  accentColor: string;
  personalData?: FlavorData;
  size?: number;
};

const AXES: (keyof FlavorData)[] = ["Tannin", "Acidity", "Body", "Oak", "Fruit"];
const N = 5;
const GUIDE_LEVELS = [0.33, 0.66, 1.0];
const LABEL_COLOR = "rgba(245,237,214,0.5)";
const GUIDE_COLOR = "rgba(245,237,214,0.1)";
const ROSE = "#C4607A";
const LABEL_OFFSET = 16;

function getAngle(i: number): number {
  return (i * 2 * Math.PI) / N - Math.PI / 2;
}

function getPoint(cx: number, cy: number, r: number, i: number): [number, number] {
  const angle = getAngle(i);
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function polygonPoints(cx: number, cy: number, radius: number, values?: FlavorData): string {
  return AXES.map((axis, i) => {
    const scale = values ? values[axis] / 100 : 1;
    const [x, y] = getPoint(cx, cy, radius * scale, i);
    return `${x},${y}`;
  }).join(" ");
}

export default function FlavorRadar({
  data,
  accentColor,
  personalData,
  size = 200,
}: FlavorRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - LABEL_OFFSET - 8;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Concentric guide pentagons */}
        {GUIDE_LEVELS.map((level) => (
          <Polygon
            key={level}
            points={polygonPoints(cx, cy, maxRadius * level)}
            fill="none"
            stroke={GUIDE_COLOR}
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const [x, y] = getPoint(cx, cy, maxRadius, i);
          return (
            <Line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
            />
          );
        })}

        {/* Data polygon */}
        <Polygon
          points={polygonPoints(cx, cy, maxRadius, data)}
          fill={accentColor}
          fillOpacity={0.3}
          stroke={accentColor}
          strokeWidth={1.5}
        />

        {/* Personal overlay polygon */}
        {personalData && (
          <Polygon
            points={polygonPoints(cx, cy, maxRadius, personalData)}
            fill={ROSE}
            fillOpacity={0.2}
            stroke={ROSE}
            strokeWidth={1.5}
          />
        )}

        {/* Axis labels */}
        {AXES.map((label, i) => {
          const [x, y] = getPoint(cx, cy, maxRadius + LABEL_OFFSET, i);
          const angle = getAngle(i);
          let textAnchor: "start" | "middle" | "end" = "middle";
          if (Math.cos(angle) > 0.1) textAnchor = "start";
          else if (Math.cos(angle) < -0.1) textAnchor = "end";

          return (
            <SvgText
              key={label}
              x={x}
              y={y}
              fill={LABEL_COLOR}
              fontSize={11}
              fontWeight="500"
              textAnchor={textAnchor}
              alignmentBaseline="central"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
