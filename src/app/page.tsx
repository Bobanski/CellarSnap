"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { shouldHideProducerInEntryTile } from "@/lib/entryDisplay";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";
import PrivacyBadge from "@/components/PrivacyBadge";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";
import type { QprLevel } from "@/lib/entryMeta";
import type { PrivacyLevel } from "@/types/wine";

type RecentEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  qpr_level: QprLevel | null;
  consumed_at: string;
  label_image_url: string | null;
  can_react: boolean;
  my_reactions: string[];
  reaction_counts: Record<string, number>;
  reaction_users: Record<string, string[]>;
};

type CircleEntry = RecentEntry & {
  user_id: string;
  author_name: string;
};

const REACTION_EMOJIS = ["\u{1F377}", "\u{1F525}", "\u2764\uFE0F", "\u{1F440}", "\u{1F91D}"] as const;

function HomeReactionControls({
  entry,
  onToggleReaction,
}: {
  entry: Pick<
    RecentEntry,
    "id" | "can_react" | "my_reactions" | "reaction_counts" | "reaction_users"
  >;
  onToggleReaction: (entryId: string, emoji: string) => Promise<void> | void;
}) {
  const [openEmoji, setOpenEmoji] = useState<string | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const reactionSummary = Object.entries(entry.reaction_counts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);

  useEffect(() => {
    if (!openEmoji) {
      return;
    }
    if ((entry.reaction_counts[openEmoji] ?? 0) > 0) {
      return;
    }
    setOpenEmoji(null);
  }, [entry.reaction_counts, openEmoji]);

  const visibleReactions = reactionSummary.slice(0, 3);
  const hiddenReactionCount = Math.max(0, reactionSummary.length - visibleReactions.length);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {visibleReactions.map(([emoji, count]) => {
          const names = entry.reaction_users[emoji] ?? [];
          const popupKey = `${entry.id}-${emoji}`;
          const showNames = openEmoji === popupKey;
          return (
            <span key={popupKey} className="group/reaction relative">
              <button
                type="button"
                disabled={names.length === 0}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenEmoji((current) => (current === popupKey ? null : popupKey));
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  names.length > 0
                    ? "border-white/15 bg-black/30 text-zinc-200 transition hover:border-amber-300/40"
                    : "border-white/10 bg-black/20 text-zinc-400"
                }`}
              >
                <span>{emoji}</span>
                <span className="tabular-nums text-zinc-400">{count}</span>
              </button>
              {names.length > 0 ? (
                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-[#1a1412] px-2.5 py-1.5 text-[11px] text-zinc-200 shadow-lg transition-opacity ${
                    showNames
                      ? "pointer-events-auto opacity-100"
                      : "opacity-0 group-hover/reaction:pointer-events-auto group-hover/reaction:opacity-100"
                  }`}
                >
                  {names.join(", ")}
                </span>
              ) : null}
            </span>
          );
        })}
        {hiddenReactionCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-zinc-400">
            +{hiddenReactionCount}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setReactionPickerOpen((current) => !current);
          }}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border bg-black/20 text-sm font-semibold leading-none transition ${
            entry.can_react
              ? "border-white/20 text-zinc-100 hover:border-amber-300/60 hover:text-amber-200"
              : "border-white/15 text-zinc-300 hover:border-white/40 hover:text-zinc-100"
          }`}
          aria-label={entry.can_react ? "Add reaction" : "View reaction options"}
        >
          +
        </button>
      </div>
      {reactionPickerOpen ? (
        <div
          className="rounded-xl border border-white/10 bg-black/20 p-1.5"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {REACTION_EMOJIS.map((emoji) => {
              const count = entry.reaction_counts[emoji] ?? 0;
              if (entry.can_react) {
                return (
                  <button
                    key={`${entry.id}-picker-${emoji}`}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setReactionPickerOpen(false);
                      void onToggleReaction(entry.id, emoji);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-white/10 ${
                      entry.my_reactions.includes(emoji) ? "bg-amber-400/20" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                );
              }
              return (
                <span
                  key={`${entry.id}-picker-${emoji}`}
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 px-1 text-lg text-zinc-400"
                >
                  {emoji}
                  {count > 0 ? (
                    <span className="ml-0.5 text-[10px] font-medium text-zinc-500">
                      {count}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
          {!entry.can_react ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              Reactions are not available for this post.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [viewerReactionName, setViewerReactionName] = useState<string | null>(null);
  const [defaultEntryPrivacy, setDefaultEntryPrivacy] = useState<PrivacyLevel>("public");
  const [privacyConfirmedAt, setPrivacyConfirmedAt] = useState<string | null>(null);
  const [privacyOnboardingError, setPrivacyOnboardingError] = useState<string | null>(null);
  const [savingPrivacyOnboarding, setSavingPrivacyOnboarding] = useState(false);
  const [totalEntryCount, setTotalEntryCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [circleEntries, setCircleEntries] = useState<CircleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const isFirstTime = totalEntryCount === 0;

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/home", { cache: "no-store" });

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/login");
            return;
          }
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          const firstName =
            typeof data.firstName === "string" ? data.firstName.trim() : "";
          const username =
            typeof data.displayName === "string" ? data.displayName.trim() : "";
          setViewerReactionName(username || firstName || null);
          setWelcomeName(firstName || username || null);
          setDefaultEntryPrivacy(data.defaultEntryPrivacy ?? "public");
          setPrivacyConfirmedAt(data.privacyConfirmedAt ?? null);
          setTotalEntryCount(data.totalEntryCount ?? 0);
          setFriendCount(data.friendCount ?? 0);
          setRecentEntries(data.recentEntries ?? []);
          setCircleEntries(data.circleEntries ?? []);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load().catch(() => null);

    return () => {
      isMounted = false;
    };
  }, [router]);

  const confirmDefaultPrivacy = async () => {
    setSavingPrivacyOnboarding(true);
    setPrivacyOnboardingError(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_entry_privacy: defaultEntryPrivacy,
        confirm_privacy_onboarding: true,
      }),
    });

    setSavingPrivacyOnboarding(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setPrivacyOnboardingError(
        payload.error ?? "Unable to confirm privacy preference."
      );
      return;
    }

    const payload = await response.json().catch(() => ({}));
    setPrivacyConfirmedAt(payload.profile?.privacy_confirmed_at ?? new Date().toISOString());
  };

  const toggleHomeReaction = async (entryId: string, emoji: string) => {
    const target =
      recentEntries.find((entry) => entry.id === entryId) ??
      circleEntries.find((entry) => entry.id === entryId);
    if (!target || !target.can_react) {
      return;
    }

    const hasMine = target.my_reactions.includes(emoji);
    const response = hasMine
      ? await fetch(`/api/entries/${entryId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
          method: "DELETE",
        })
      : await fetch(`/api/entries/${entryId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        });

    if (!response.ok) {
      return;
    }

    const applyToEntry = <T extends RecentEntry | CircleEntry>(entry: T): T => {
      if (entry.id !== entryId) {
        return entry;
      }

      if (hasMine) {
        const nextCount = Math.max(0, (entry.reaction_counts[emoji] ?? 1) - 1);
        const nextCounts = { ...entry.reaction_counts };
        if (nextCount === 0) {
          delete nextCounts[emoji];
        } else {
          nextCounts[emoji] = nextCount;
        }

        const nextUsers = { ...entry.reaction_users };
        const existingNames = nextUsers[emoji] ?? [];
        const filteredNames = viewerReactionName
          ? existingNames.filter((name) => name !== viewerReactionName)
          : existingNames;
        if (filteredNames.length === 0) {
          delete nextUsers[emoji];
        } else {
          nextUsers[emoji] = filteredNames;
        }

        return {
          ...entry,
          reaction_counts: nextCounts,
          reaction_users: nextUsers,
          my_reactions: entry.my_reactions.filter((value) => value !== emoji),
        };
      }

      const nextUsers = { ...entry.reaction_users };
      const existingNames = nextUsers[emoji] ?? [];
      if (viewerReactionName && !existingNames.includes(viewerReactionName)) {
        nextUsers[emoji] = [...existingNames, viewerReactionName];
      } else {
        nextUsers[emoji] = existingNames;
      }

      return {
        ...entry,
        reaction_counts: {
          ...entry.reaction_counts,
          [emoji]: (entry.reaction_counts[emoji] ?? 0) + 1,
        },
        reaction_users: nextUsers,
        my_reactions: [...entry.my_reactions, emoji],
      };
    };

    setRecentEntries((current) => current.map((entry) => applyToEntry(entry)));
    setCircleEntries((current) => current.map((entry) => applyToEntry(entry)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <NavBar />

        {/* ── Header ── */}
        <header className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            {isFirstTime ? "Getting started" : "Home"}
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            {isFirstTime
              ? welcomeName
                ? `Welcome to CellarSnap, ${welcomeName}.`
                : "Welcome to CellarSnap."
              : welcomeName
                ? `Welcome back, ${welcomeName}.`
                : "Welcome back."}
          </h1>
          <p className="text-sm text-zinc-300">
            {isFirstTime
              ? "Your personal wine journal. Snap a label, log the moment, share with friends."
              : "What\u2019s happening in your wine world right now?"}
          </p>
        </header>

        {!privacyConfirmedAt ? (
          <section className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
              Onboarding privacy check
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-50">
              Confirm who should see new entries by default
            </h2>
            <p className="mt-1 text-sm text-zinc-300">
              You can still override visibility per entry at any time.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {([
                { value: "public" as const, description: "Visible to everyone" },
                {
                  value: "friends_of_friends" as const,
                  description: "Visible to friends and their friends",
                },
                {
                  value: "friends" as const,
                  description: "Visible only to accepted friends",
                },
                { value: "private" as const, description: "Visible only to you" },
              ]).map((option) => {
                const selected = defaultEntryPrivacy === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDefaultEntryPrivacy(option.value)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      selected
                        ? "border-amber-300/60 bg-amber-400/10"
                        : "border-white/10 bg-black/20 hover:border-white/30"
                    }`}
                  >
                    <PrivacyBadge level={option.value} />
                    <p className="mt-1 text-xs text-zinc-300">{option.description}</p>
                  </button>
                );
              })}
            </div>
            {privacyOnboardingError ? (
              <p className="mt-3 text-sm text-rose-200">{privacyOnboardingError}</p>
            ) : null}
            <button
              type="button"
              onClick={confirmDefaultPrivacy}
              disabled={savingPrivacyOnboarding}
              className="mt-4 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingPrivacyOnboarding
                ? "Saving..."
                : "Confirm default privacy"}
            </button>
          </section>
        ) : null}

        {/* ── First-time hero CTA ── */}
        {isFirstTime ? (
          <div className="rounded-3xl border border-amber-300/30 bg-amber-400/5 p-8 text-center backdrop-blur">
            <h2 className="text-xl font-semibold text-zinc-50">
              Record your first pour
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
              Snap a photo of the label and we&rsquo;ll autofill the details.
              Or just jot down what you&rsquo;re drinking &mdash; it only takes a moment.
            </p>
            <Link
              href="/entries/new"
              className="mt-5 inline-block rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              + Record a new pour
            </Link>
          </div>
        ) : (
          <Link
            href="/entries/new"
            className="inline-block rounded-full bg-amber-400/90 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
          >
            + Record a new pour
          </Link>
        )}

        {/* ── Section 1: Recent from you ── */}
        {!isFirstTime ? (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Recent from you
            </h2>

            <div className="space-y-4">
              <div className="grid gap-5 md:grid-cols-2">
                {recentEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/entries/${entry.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/entries/${entry.id}`);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="font-medium text-zinc-200">You</span>
                      <span>{formatConsumedDate(entry.consumed_at)}</span>
                    </div>
                    <div className="mt-4 flex flex-1 gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
                        {entry.label_image_url ? (
                          <Photo
                            src={entry.label_image_url}
                            alt={entry.wine_name ?? entry.producer ?? "Wine label"}
                            containerClassName="h-full w-full"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          "No photo"
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          {entry.wine_name ? (
                            <h3 className="text-base font-semibold text-zinc-50">
                              {entry.wine_name}
                            </h3>
                          ) : null}
                          {(() => {
                            const hideProducer = shouldHideProducerInEntryTile(
                              entry.wine_name,
                              entry.producer
                            );
                            const producer = hideProducer ? null : entry.producer;
                            if (!producer && !entry.vintage) {
                              return null;
                            }
                            return (
                              <p className="text-sm text-zinc-400">
                                {producer ?? ""}
                                {producer && entry.vintage
                                  ? ` \u00b7 ${entry.vintage}`
                                  : entry.vintage
                                    ? entry.vintage
                                    : ""}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                          {typeof entry.rating === "number" &&
                          !Number.isNaN(entry.rating) ? (
                            <RatingBadge rating={entry.rating} variant="text" />
                          ) : null}
                          {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                        </div>
                      </div>
                    </div>
                    <div
                      className="mt-4 border-t border-white/10 pt-3"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <HomeReactionControls
                        entry={entry}
                        onToggleReaction={toggleHomeReaction}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <Link
                href="/entries"
                className="inline-block text-sm font-medium text-zinc-400 transition hover:text-amber-200"
              >
                View my library &rarr;
              </Link>
            </div>
          </section>
        ) : null}

        {/* ── Section 2: From your circle ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
            From your circle
          </h2>

          {circleEntries.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              {friendCount === 0 ? (
                <>
                  <p className="text-sm text-zinc-300">
                    {isFirstTime
                      ? "CellarSnap is better with friends. Add the people you drink with and see what they\u2019re enjoying."
                      : "You haven\u2019t added any friends yet."}
                  </p>
                  <Link
                    href="/friends"
                    className="mt-3 inline-block rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                  >
                    Find friends
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-zinc-300">
                    Your friends haven&rsquo;t posted anything yet. Check back soon!
                  </p>
                  <Link
                    href="/feed"
                    className="mt-3 inline-block text-sm font-medium text-amber-200 transition hover:text-amber-100"
                  >
                    Browse the public feed &rarr;
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-5 md:grid-cols-2">
                {circleEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/entries/${entry.id}?from=feed`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/entries/${entry.id}?from=feed`);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/profile/${entry.user_id}`);
                        }}
                        className="font-medium text-zinc-200 hover:text-amber-200"
                      >
                        {entry.author_name}
                      </button>
                      <span>{formatConsumedDate(entry.consumed_at)}</span>
                    </div>
                    <div className="mt-4 flex flex-1 gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
                        {entry.label_image_url ? (
                          <Photo
                            src={entry.label_image_url}
                            alt={entry.wine_name ?? entry.producer ?? "Wine label"}
                            containerClassName="h-full w-full"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          "No photo"
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          {entry.wine_name ? (
                            <h3 className="text-base font-semibold text-zinc-50">
                              {entry.wine_name}
                            </h3>
                          ) : null}
                          {(() => {
                            const hideProducer = shouldHideProducerInEntryTile(
                              entry.wine_name,
                              entry.producer
                            );
                            if (!entry.producer || hideProducer) {
                              return null;
                            }
                            return (
                              <p className="text-sm text-zinc-400">{entry.producer}</p>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                          {typeof entry.rating === "number" &&
                          !Number.isNaN(entry.rating) ? (
                            <RatingBadge rating={entry.rating} variant="text" />
                          ) : null}
                          {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                        </div>
                      </div>
                    </div>
                    <div
                      className="mt-4 border-t border-white/10 pt-3"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <HomeReactionControls
                        entry={entry}
                        onToggleReaction={toggleHomeReaction}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <Link
                href="/feed"
                className="inline-block text-sm font-medium text-zinc-400 transition hover:text-amber-200"
              >
                View full feed &rarr;
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
