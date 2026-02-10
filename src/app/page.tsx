"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
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
};

type CircleEntry = RecentEntry & {
  user_id: string;
  author_name: string;
};

export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
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
      const response = await fetch("/api/home", { cache: "no-store" });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (isMounted) {
        setDisplayName(data.displayName ?? null);
        setDefaultEntryPrivacy(data.defaultEntryPrivacy ?? "public");
        setPrivacyConfirmedAt(data.privacyConfirmedAt ?? null);
        setTotalEntryCount(data.totalEntryCount ?? 0);
        setFriendCount(data.friendCount ?? 0);
        setRecentEntries(data.recentEntries ?? []);
        setCircleEntries(data.circleEntries ?? []);
        setLoading(false);
      }
    };

    load();

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
              ? displayName
                ? `Welcome to CellarSnap, ${displayName}.`
                : "Welcome to CellarSnap."
              : displayName
                ? `Welcome back, ${displayName}.`
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
                    className="group cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
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
                    <div className="mt-4 flex gap-4">
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
                          {entry.producer || entry.vintage ? (
                            <p className="text-sm text-zinc-400">
                              {entry.producer ?? ""}
                              {entry.producer && entry.vintage
                                ? ` \u00b7 ${entry.vintage}`
                                : entry.vintage
                                  ? entry.vintage
                                  : ""}
                            </p>
                          ) : null}
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
                  </article>
                ))}
              </div>

              <Link
                href="/entries"
                className="inline-block text-sm font-medium text-zinc-400 transition hover:text-amber-200"
              >
                View all my entries &rarr;
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
                    className="group cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
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
                    <div className="mt-4 flex gap-4">
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
                          {entry.producer ? (
                            <p className="text-sm text-zinc-400">{entry.producer}</p>
                          ) : null}
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
