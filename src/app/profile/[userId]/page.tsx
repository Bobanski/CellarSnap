"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { shouldHideProducerInEntryTile } from "@/lib/entryDisplay";
import type { WineEntryWithUrls } from "@/types/wine";
import AppImage from "@/components/AppImage";
import Photo from "@/components/Photo";
import AppShell from "@/components/AppShell";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";

type EntryWithAuthor = WineEntryWithUrls & { author_name?: string };

type FriendStatus = "none" | "request_sent" | "request_received" | "friends";
type RelationshipPayload = {
  friend_status?: FriendStatus;
  incoming_request_id?: string | null;
  outgoing_request_id?: string | null;
  friend_request_id?: string | null;
  error?: string;
};

export default function FriendProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [profile, setProfile] = useState<{
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>("none");
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [outgoingRequestId, setOutgoingRequestId] = useState<string | null>(null);
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [confirmingUnfriend, setConfirmingUnfriend] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  const [theirEntries, setTheirEntries] = useState<EntryWithAuthor[]>([]);
  const [taggedEntries, setTaggedEntries] = useState<EntryWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllTaggedEntries, setShowAllTaggedEntries] = useState(false);

  const applyRelationshipPayload = (payload: RelationshipPayload) => {
    const nextStatus = payload.friend_status;
    if (!nextStatus) {
      return false;
    }

    setFriendStatus(nextStatus);
    setIncomingRequestId(payload.incoming_request_id ?? null);
    setOutgoingRequestId(payload.outgoing_request_id ?? null);
    setFriendRequestId(payload.friend_request_id ?? null);
    setConfirmingUnfriend(false);
    return true;
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!userId) {
        setErrorMessage("Invalid profile.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setFriendActionError(null);
      setBlockActionError(null);
      setConfirmingUnfriend(false);
      setShowAllEntries(false);
      setShowAllTaggedEntries(false);

      const [profileRes, entriesRes, taggedRes, myProfileRes, blockRes] =
        await Promise.all([
          fetch(`/api/users/${userId}`, { cache: "no-store" }),
          fetch(`/api/users/${userId}/entries`, { cache: "no-store" }),
          fetch(`/api/users/${userId}/tagged`, { cache: "no-store" }),
          fetch("/api/profile", { cache: "no-store" }),
          fetch(`/api/users/${userId}/block`, { cache: "no-store" }),
        ]);

      if (!profileRes.ok) {
        if (isMounted) {
          setErrorMessage("Profile not found.");
          setLoading(false);
        }
        return;
      }

      const profileData = await profileRes.json();
      const entriesData = entriesRes.ok
        ? await entriesRes.json()
        : { entries: [] };
      const taggedData = taggedRes.ok
        ? await taggedRes.json()
        : { entries: [] };
      const myProfileData = myProfileRes.ok
        ? await myProfileRes.json()
        : { profile: null };
      const blockData = blockRes.ok
        ? await blockRes.json()
        : { blocked: false };

      if (isMounted) {
        setProfile(profileData.profile);
        setCurrentUserId(myProfileData.profile?.id ?? null);
        setTheirEntries(entriesData.entries ?? []);
        setTaggedEntries(taggedData.entries ?? []);
        setFriendStatus(profileData.profile?.friend_status ?? "none");
        setIncomingRequestId(profileData.profile?.incoming_request_id ?? null);
        setOutgoingRequestId(profileData.profile?.outgoing_request_id ?? null);
        setFriendRequestId(profileData.profile?.friend_request_id ?? null);
        setIsBlocked(Boolean(blockData.blocked));

        setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const sendFriendRequest = async () => {
    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as RelationshipPayload;

      if (!response.ok) {
        setFriendActionError(payload.error ?? "Unable to send friend request.");
        return;
      }

      const applied = applyRelationshipPayload(payload);
      if (
        !applied ||
        (payload.friend_status !== "request_sent" &&
          payload.friend_status !== "friends")
      ) {
        setFriendActionError("Unexpected response while sending request.");
      }
    } catch {
      setFriendActionError("Unable to send friend request.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const acceptRequest = async () => {
    if (!incomingRequestId) return;
    setFriendActionLoading(true);
    setFriendActionError(null);
    const response = await fetch(
      `/api/friends/requests/${incomingRequestId}/accept`,
      { method: "POST" }
    );
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (
        data.success === true &&
        data.status === "accepted" &&
        data.request_id === incomingRequestId
      ) {
        setFriendStatus("friends");
        setIncomingRequestId(null);
        setConfirmingUnfriend(false);
      } else {
        setFriendActionError("Request was not accepted.");
      }
    } else {
      const payload = await response.json().catch(() => ({}));
      setFriendActionError(payload.error ?? "Unable to accept friend request.");
    }
    setFriendActionLoading(false);
  };

  const removeFriend = async () => {
    if (friendActionLoading) {
      return;
    }

    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      // Prefer deleting the specific accepted friend request when we have its ID.
      if (friendRequestId) {
        const response = await fetch(`/api/friends/requests/${friendRequestId}`, {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!response.ok) {
          setFriendActionError(payload.error ?? "Unable to remove friend.");
          return;
        }
        setFriendStatus("none");
        setIncomingRequestId(null);
        setOutgoingRequestId(null);
        setFriendRequestId(null);
        setConfirmingUnfriend(false);
        return;
      }

      // Fallback: delete relationship by user id.
      const response = await fetch(`/api/users/${userId}/follow`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as RelationshipPayload;
      if (!response.ok) {
        setFriendActionError(payload.error ?? "Unable to remove friend.");
        return;
      }
      const applied = applyRelationshipPayload(payload);
      if (!applied || payload.friend_status !== "none") {
        setFriendActionError("Friend status did not update as expected.");
      }
    } catch {
      setFriendActionError("Unable to remove friend.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const cancelOutgoingRequest = async () => {
    if (friendActionLoading || !outgoingRequestId) {
      return;
    }

    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      const response = await fetch(`/api/friends/requests/${outgoingRequestId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setFriendActionError(payload.error ?? "Unable to cancel friend request.");
        return;
      }
      setFriendStatus("none");
      setIncomingRequestId(null);
      setOutgoingRequestId(null);
      setFriendRequestId(null);
      setConfirmingUnfriend(false);
    } catch {
      setFriendActionError("Unable to cancel friend request.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const toggleBlock = async () => {
    if (!userId || blockActionLoading) {
      return;
    }

    if (!isBlocked) {
      const confirmed =
        typeof window === "undefined"
          ? true
          : window.confirm(
              `Block ${profile?.display_name ?? "this user"}? You will no longer see each other's posts or comments.`
            );
      if (!confirmed) {
        return;
      }
    }

    setBlockActionLoading(true);
    setBlockActionError(null);
    try {
      const response = await fetch(`/api/users/${userId}/block`, {
        method: isBlocked ? "DELETE" : "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        blocked?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setBlockActionError(payload.error ?? "Unable to update block state.");
        return;
      }

      const nextBlocked = Boolean(payload.blocked);
      setIsBlocked(nextBlocked);
      if (nextBlocked) {
        setFriendStatus("none");
        setIncomingRequestId(null);
        setOutgoingRequestId(null);
        setFriendRequestId(null);
        setConfirmingUnfriend(false);
      }
    } catch {
      setBlockActionError("Unable to update block state.");
    } finally {
      setBlockActionLoading(false);
    }
  };

  const isOwnProfile = currentUserId === userId;
  const fullName =
    profile && (profile.first_name || profile.last_name)
      ? [profile.first_name, profile.last_name]
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0)
          .join(" ")
      : "";
  const displayedTheirEntries = showAllEntries
    ? theirEntries
    : theirEntries.slice(0, 10);
  const displayedTaggedEntries = showAllTaggedEntries
    ? taggedEntries
    : taggedEntries.slice(0, 10);

  if (loading) {
    return (
      <AppShell>
        <div className="px-6 py-6 text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-6xl space-y-8">
            <div className="animate-pulse space-y-2">
              <div className="h-3 w-28 rounded-md bg-surface-raised" />
              <div className="h-2.5 w-20 rounded-md bg-surface-raised" />
              <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-14 w-14 shrink-0 rounded-full bg-surface-raised sm:h-16 sm:w-16" />
                  <div className="min-w-0 space-y-2">
                    <div className="h-6 w-40 rounded-md bg-surface-raised" />
                    <div className="h-3.5 w-32 rounded-md bg-surface-raised" />
                    <div className="h-3.5 w-48 rounded-md bg-surface-raised" />
                  </div>
                </div>
                <div className="h-9 w-24 shrink-0 rounded-full bg-surface-raised" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl border border-[var(--color-border)] bg-surface-primary/10"
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] animate-pulse rounded-2xl bg-surface-raised"
                />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (errorMessage || !profile) {
    return (
      <AppShell>
        <div className="px-6 py-6 text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-6xl space-y-8">
            <Link
              className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              href="/friends"
            >
              ← Back to Friends
            </Link>
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
              {errorMessage ?? "Profile not found."}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-6 py-6 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="space-y-2">
          <Link
            className="accent-link-hover inline-block text-sm font-medium text-[var(--color-text-tertiary)]"
            href="/friends"
          >
            ← Back to Friends
          </Link>
          <span className="block text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            {isOwnProfile ? "Your profile" : "Profile"}
          </span>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] ring-2 ring-white/5 sm:h-16 sm:w-16">
                {profile.avatar_url ? (
                  <AppImage
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-medium text-[var(--color-text-tertiary)] sm:text-xl">
                    {(profile.display_name ?? "?")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
                  {profile.display_name ?? "Unknown"}
                </h1>
                {fullName ? (
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{fullName}</p>
                ) : null}
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {isOwnProfile
                    ? "Wines you've logged and wines you've been tagged in."
                    : "Wines they've logged and wines they've been tagged in."}
                </p>
              </div>
            </div>

            {/* ── Friend action button ── */}
            {!isOwnProfile ? (
              <div className="shrink-0 space-y-2">
                {isBlocked ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full border border-rose-400/35 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100">
                      Blocked
                    </span>
                    <button
                      type="button"
                      disabled={blockActionLoading}
                      onClick={toggleBlock}
                      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-50"
                    >
                      {blockActionLoading ? "Updating..." : "Unblock"}
                    </button>
                  </div>
                ) : (
                  <>
                    {friendStatus === "friends" ? (
                      confirmingUnfriend ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-xs text-[var(--color-text-tertiary)]">Remove friend?</span>
                          <button
                            type="button"
                            disabled={friendActionLoading}
                            onClick={removeFriend}
                            className="rounded-full bg-rose-500/80 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                          >
                            {friendActionLoading ? "Removing..." : "Yes, remove"}
                          </button>
                          <button
                            type="button"
                            disabled={friendActionLoading}
                            onClick={() => setConfirmingUnfriend(false)}
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Friends
                          </span>
                          <button
                            type="button"
                            disabled={friendActionLoading}
                            onClick={() => {
                              setFriendActionError(null);
                              setConfirmingUnfriend(true);
                            }}
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    ) : friendStatus === "request_sent" ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="accent-soft-chip rounded-full border px-4 py-2 text-sm font-semibold">
                          Request sent
                        </span>
                        <button
                          type="button"
                          disabled={friendActionLoading || !outgoingRequestId}
                          onClick={cancelOutgoingRequest}
                          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-50"
                        >
                          {friendActionLoading ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    ) : friendStatus === "request_received" ? (
                      <button
                        type="button"
                        disabled={friendActionLoading}
                        onClick={acceptRequest}
                        className="accent-solid-button rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                      >
                        {friendActionLoading ? "Accepting..." : "Accept friend request"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={friendActionLoading}
                        onClick={sendFriendRequest}
                        className="accent-solid-button rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                      >
                        {friendActionLoading ? "Sending..." : "Add friend"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={blockActionLoading}
                      onClick={toggleBlock}
                      className="w-full text-right text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    >
                      {blockActionLoading ? "Updating..." : "Block user"}
                    </button>
                  </>
                )}
                {friendActionError ? (
                  <p className="text-right text-xs text-rose-200">{friendActionError}</p>
                ) : null}
                {blockActionError ? (
                  <p className="text-right text-xs text-rose-200">{blockActionError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {!isOwnProfile && isBlocked ? (
          <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100">
            This user&apos;s content is hidden while blocked.
          </section>
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {isOwnProfile ? "Wines you've uploaded" : "Wines they've uploaded"}
              </h2>
              {theirEntries.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm text-[var(--color-text-tertiary)]">
                  {isOwnProfile ? "You haven't uploaded any wines yet." : "No wines uploaded yet."}
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">
                  {displayedTheirEntries.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/entries/${entry.id}?from=profile&profile=${encodeURIComponent(userId)}`}
                      className="group flex gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-[var(--color-accent-secondary)]/40"
                    >
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-[var(--color-text-tertiary)]">
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
                          <h3 className="font-semibold text-[var(--color-text-primary)]">
                            {entry.wine_name || "Untitled wine"}
                          </h3>
                          {(() => {
                            const hideProducer = shouldHideProducerInEntryTile(
                              entry.wine_name,
                              entry.producer
                            );
                            const producerLabel = entry.producer
                              ? hideProducer
                                ? null
                                : entry.producer
                              : "Unknown producer";
                            if (!producerLabel && !entry.vintage) {
                              return null;
                            }
                            return (
                              <p className="text-sm text-[var(--color-text-tertiary)]">
                                {producerLabel ?? ""}
                                {entry.vintage ? (
                                  <span className="text-[var(--color-text-tertiary)]">
                                    {producerLabel ? " · " : ""}
                                    {entry.vintage}
                                  </span>
                                ) : null}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-tertiary)]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {typeof entry.rating === "number" &&
                            !Number.isNaN(entry.rating) ? (
                              <RatingBadge rating={entry.rating} variant="text" />
                            ) : null}
                            {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                          </div>
                          <span>{formatConsumedDate(entry.consumed_at)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {theirEntries.length > 10 ? (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllEntries((prev) => !prev)}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                  >
                    {showAllEntries ? "Show fewer entries" : "See all entries"}
                  </button>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {isOwnProfile ? "Tagged entries" : "Tagged in by others"}
              </h2>
              {taggedEntries.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm text-[var(--color-text-tertiary)]">
                  {isOwnProfile
                    ? "You are not tagged in any entries yet."
                    : "Not tagged in any entries yet."}
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">
                  {displayedTaggedEntries.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/entries/${entry.id}?from=profile&profile=${encodeURIComponent(userId)}`}
                      className="group flex gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-[var(--color-accent-secondary)]/40"
                    >
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-[var(--color-text-tertiary)]">
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
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            Logged by {entry.author_name ?? "Unknown"}
                          </p>
                          <h3 className="font-semibold text-[var(--color-text-primary)]">
                            {entry.wine_name || "Untitled wine"}
                          </h3>
                          {(() => {
                            const hideProducer = shouldHideProducerInEntryTile(
                              entry.wine_name,
                              entry.producer
                            );
                            const producerLabel = entry.producer
                              ? hideProducer
                                ? null
                                : entry.producer
                              : "Unknown producer";
                            if (!producerLabel && !entry.vintage) {
                              return null;
                            }
                            return (
                              <p className="text-sm text-[var(--color-text-tertiary)]">
                                {producerLabel ?? ""}
                                {entry.vintage ? (
                                  <span className="text-[var(--color-text-tertiary)]">
                                    {producerLabel ? " · " : ""}
                                    {entry.vintage}
                                  </span>
                                ) : null}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-tertiary)]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {typeof entry.rating === "number" &&
                            !Number.isNaN(entry.rating) ? (
                              <RatingBadge rating={entry.rating} variant="text" />
                            ) : null}
                            {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                          </div>
                          <span>{formatConsumedDate(entry.consumed_at)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {taggedEntries.length > 10 ? (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllTaggedEntries((prev) => !prev)}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                  >
                    {showAllTaggedEntries
                      ? "Show fewer tagged entries"
                      : "See all entries tagged in"}
                  </button>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
      </div>
    </AppShell>
  );
}
