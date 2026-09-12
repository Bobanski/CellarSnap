"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BadgeIcon from "./BadgeIcon";
import { useBadges } from "./useBadges";
import { getBadgeById } from "@shared";
import type { BadgeColor, BadgeAccentColor, BadgeShape, BadgeTier } from "@shared";

const MAX_FEATURED = 5;
const LONG_PRESS_MS = 500;

/**
 * FeaturedBadgesRow — up to 5 featured badges shown below the name on a
 * user's own profile (Dani feedback: profiles capped out at one). Long-press
 * (or the pencil affordance, for discoverability/testability) opens an
 * in-place edit mode: tap earned badges to toggle them in/out of the
 * selection, capped at 5, then Save or Cancel.
 *
 * Self-contained — fetches its own data via useBadges() (own profile only,
 * no userId is ever passed).
 */
export default function FeaturedBadgesRow() {
  const { badges, featuredBadgeIds, isLoading, setFeaturedBadges } = useBadges();
  const [editing, setEditing] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const earnedIds = useMemo(() => new Set(badges.map((b) => b.id)), [badges]);
  const featuredDefinitions = useMemo(
    () =>
      featuredBadgeIds
        .map((id) => getBadgeById(id))
        .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge)),
    [featuredBadgeIds]
  );

  const openEditMode = useCallback(() => {
    setError(null);
    setDraftIds(featuredBadgeIds.slice(0, MAX_FEATURED));
    setEditing(true);
  }, [featuredBadgeIds]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      openEditMode();
    }, LONG_PRESS_MS);
  };

  const toggleDraft = (badgeId: string) => {
    setDraftIds((prev) => {
      if (prev.includes(badgeId)) {
        return prev.filter((id) => id !== badgeId);
      }
      if (prev.length >= MAX_FEATURED) {
        return prev;
      }
      return [...prev, badgeId];
    });
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await setFeaturedBadges(draftIds);
      if (result.migrationPending && draftIds.length > 1) {
        // The 097_featured_badges.sql migration hasn't been applied to this
        // database yet, so only the first pick actually persisted — say so
        // instead of silently dropping the rest.
        setError(
          "Only your first pick was saved — multi-badge profiles need a database update that hasn't shipped yet."
        );
        return;
      }
      setEditing(false);
    } catch {
      setError("Unable to save your featured badges. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;
  // Nothing to feature yet, and not editing — stay quiet rather than showing
  // an empty band.
  if (!editing && badges.length === 0) return null;

  if (editing) {
    return (
      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-secondary)]">
            {`Feature badges · ${draftIds.length}/${MAX_FEATURED}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-full bg-[var(--color-accent-primary)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-on-accent)] transition disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>
        ) : null}
        <div className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-6">
          {badges.map((badge) => {
            const selected = draftIds.includes(badge.id);
            const order = draftIds.indexOf(badge.id);
            const atCap = !selected && draftIds.length >= MAX_FEATURED;
            return (
              <button
                key={badge.id}
                type="button"
                onClick={() => toggleDraft(badge.id)}
                disabled={atCap}
                className={`relative flex flex-col items-center gap-1 rounded-xl p-2 transition ${
                  selected
                    ? "bg-[var(--color-accent-gold)]/15 ring-2 ring-[var(--color-accent-gold)]"
                    : "bg-[var(--color-surface-raised)]"
                } ${atCap ? "opacity-40" : ""}`}
                aria-pressed={selected}
                aria-label={`${selected ? "Remove" : "Feature"} ${badge.name}`}
              >
                {selected ? (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent-gold)] text-[9px] font-bold text-[var(--color-surface-primary)]">
                    {order + 1}
                  </span>
                ) : null}
                <BadgeIcon
                  shape={badge.shape as BadgeShape}
                  color={badge.color as BadgeColor}
                  accent={badge.accent as BadgeAccentColor}
                  tier={badge.tier as BadgeTier}
                  size={44}
                />
                <span className="w-full truncate text-center text-[10px] font-medium text-[var(--color-text-secondary)]">
                  {badge.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          Featured badges
        </p>
        <button
          type="button"
          onClick={openEditMode}
          aria-label="Edit featured badges"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
      </div>
      <div
        className="flex items-center gap-3 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 px-3 py-3 select-none"
        style={{ scrollbarWidth: "none" }}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPressTimer}
        onMouseLeave={clearLongPressTimer}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPressTimer}
        onTouchCancel={clearLongPressTimer}
        title="Press and hold to edit"
      >
        {featuredDefinitions.length > 0 ? (
          featuredDefinitions.map((badge) => (
            <Link
              key={badge.id}
              href={`/badges/${badge.id}`}
              onClick={(event) => event.stopPropagation()}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <BadgeIcon
                shape={badge.shape as BadgeShape}
                color={badge.color as BadgeColor}
                accent={badge.accent as BadgeAccentColor}
                tier={badge.tier as BadgeTier}
                size={48}
                locked={!earnedIds.has(badge.id)}
              />
              <span className="max-w-[64px] truncate text-[10px] text-[var(--color-text-tertiary)]">
                {badge.name}
              </span>
            </Link>
          ))
        ) : (
          <button
            type="button"
            onClick={openEditMode}
            className="text-xs text-[var(--color-text-tertiary)]"
          >
            {`Feature up to ${MAX_FEATURED} of your badges →`}
          </button>
        )}
      </div>
    </div>
  );
}
