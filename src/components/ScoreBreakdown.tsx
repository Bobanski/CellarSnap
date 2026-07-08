"use client";

import {
  buildScoreInsights,
  buildWineRadarSeries,
  formatSensoryLevel,
  SENSORY_AXIS_LABELS,
} from "@/lib/algorithm/matchUi";
import type { AlgorithmScoreResponse } from "@/lib/algorithm/api";
import SensoryRadarChart from "@/components/SensoryRadarChart";

export default function ScoreBreakdown({
  result,
  defaultOpen = false,
}: {
  result: AlgorithmScoreResponse;
  defaultOpen?: boolean;
}) {
  const insights = buildScoreInsights(result.axis_contributions);
  const radarSeries = buildWineRadarSeries(
    result.effective_profile,
    result.axis_contributions
  );

  return (
    <details
      className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--color-text-primary)]">
        Why this score?
      </summary>

      <div className="mt-5 space-y-5">
        <SensoryRadarChart points={radarSeries} />

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700/80">
              Strongest matches
            </p>
            <div className="mt-3 space-y-3">
              {insights.positive.map((item) => (
                <div key={`positive-${item.axis}`}>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-rose-300/15 bg-rose-400/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-700/80">
              Biggest gaps
            </p>
            <div className="mt-3 space-y-3">
              {insights.caution.map((item) => (
                <div key={`caution-${item.axis}`}>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(result.axis_contributions)
            .filter(([, contribution]) => typeof contribution.user_value === "number")
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([axis, contribution]) => (
              <div
                key={axis}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  {SENSORY_AXIS_LABELS[axis as keyof typeof SENSORY_AXIS_LABELS]}
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                  Wine: {formatSensoryLevel(contribution.wine_value)}
                </p>
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  You: {formatSensoryLevel(contribution.user_value)}
                </p>
              </div>
            ))}
        </div>

        {result.modifiers_applied.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
              Profile modifiers
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.modifiers_applied.map((modifier) => (
                <span
                  key={modifier}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
                >
                  {modifier}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
