"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import type { WineEntryWithUrls } from "@/types/wine";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";

type EntryWithAuthor = WineEntryWithUrls & { author_name?: string };

type FriendStatus = "none" | "request_sent" | "request_received" | "friends";

export default function FriendProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [profile, setProfile] = useState<{
    id: string;
    display_name: string | null;
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>("none");
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [confirmingUnfriend, setConfirmingUnfriend] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [theirEntries, setTheirEntries] = useState<EntryWithAuthor[]>([]);
  const [taggedEntries, setTaggedEntries] = useState<EntryWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setConfirmingUnfriend(false);

      const [profileRes, entriesRes, taggedRes, myProfileRes, requestsRes] =
        await Promise.all([
          fetch(`/api/users/${userId}`, { cache: "no-store" }),
          fetch(`/api/users/${userId}/entries`, { cache: "no-store" }),
          fetch(`/api/users/${userId}/tagged`, { cache: "no-store" }),
          fetch("/api/profile", { cache: "no-store" }),
          fetch("/api/friends/requests", { cache: "no-store" }),
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
      const requestsData = requestsRes.ok
        ? await requestsRes.json()
        : { incoming: [], outgoing: [] };

      if (isMounted) {
        setProfile(profileData.profile);
        setCurrentUserId(myProfileData.profile?.id ?? null);
        setTheirEntries(entriesData.entries ?? []);
        setTaggedEntries(taggedData.entries ?? []);

        // Determine friend status from pending requests
        const outgoing = (requestsData.outgoing ?? []).find(
          (r: { recipient: { id: string } }) => r.recipient.id === userId
        );
        const incoming = (requestsData.incoming ?? []).find(
          (r: { requester: { id: string } }) => r.requester.id === userId
        );

        if (outgoing) {
          setFriendStatus("request_sent");
          setIncomingRequestId(null);
          setFriendRequestId(null);
        } else if (incoming) {
          setFriendStatus("request_received");
          setIncomingRequestId(incoming.id);
          setFriendRequestId(null);
        } else {
          // Check if already friends (accepted requests come from /api/friends)
          const friendsRes = await fetch("/api/friends", { cache: "no-store" });
          if (friendsRes.ok) {
            const friendsData = await friendsRes.json();
            const friend = (friendsData.friends ?? []).find(
              (f: { id: string; request_id: string | null }) => f.id === userId
            );
            setFriendStatus(friend ? "friends" : "none");
            setIncomingRequestId(null);
            setFriendRequestId(friend?.request_id ?? null);
          } else {
            setFriendStatus("none");
            setIncomingRequestId(null);
            setFriendRequestId(null);
          }
        }

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
    const response = await fetch("/api/friends/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === "accepted") {
        setFriendStatus("friends");
        setFriendRequestId(data.request_id ?? null);
        setIncomingRequestId(null);
        setConfirmingUnfriend(false);
      } else {
        setFriendStatus("request_sent");
        setFriendRequestId(null);
        setIncomingRequestId(null);
        setConfirmingUnfriend(false);
      }
    } else {
      const payload = await response.json().catch(() => ({}));
      setFriendActionError(payload.error ?? "Unable to send friend request.");
    }
    setFriendActionLoading(false);
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
      setFriendStatus("friends");
      setFriendRequestId(incomingRequestId);
      setIncomingRequestId(null);
      setConfirmingUnfriend(false);
    } else {
      const payload = await response.json().catch(() => ({}));
      setFriendActionError(payload.error ?? "Unable to accept friend request.");
    }
    setFriendActionLoading(false);
  };

  const resolveFriendRequestId = async () => {
    if (friendRequestId) {
      return friendRequestId;
    }

    const friendsRes = await fetch("/api/friends", { cache: "no-store" });
    if (!friendsRes.ok) {
      return null;
    }

    const friendsData = await friendsRes.json();
    const friend = (friendsData.friends ?? []).find(
      (f: { id: string; request_id: string | null }) => f.id === userId
    );

    return friend?.request_id ?? null;
  };

  const removeFriend = async () => {
    if (friendActionLoading) {
      return;
    }

    setFriendActionLoading(true);
    setFriendActionError(null);

    const requestId = await resolveFriendRequestId();
    if (!requestId) {
      setFriendActionError("Unable to remove friend right now.");
      setFriendActionLoading(false);
      return;
    }

    const response = await fetch(`/api/friends/requests/${requestId}`, {
      method: "DELETE",
    });

    if (response.ok || response.status === 404) {
      setFriendStatus("none");
      setFriendRequestId(null);
      setIncomingRequestId(null);
      setConfirmingUnfriend(false);
      setFriendActionLoading(false);
      return;
    }

    const payload = await response.json().catch(() => ({}));
    setFriendActionError(payload.error ?? "Unable to remove friend.");
    setFriendActionLoading(false);
  };

  const isOwnProfile = currentUserId === userId;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading profile...
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || !profile) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <Link
            className="text-sm font-medium text-zinc-300 hover:text-zinc-50"
            href="/friends"
          >
            ← Back to Friends
          </Link>
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage ?? "Profile not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
        <header className="space-y-2">
          <Link
            className="inline-block text-sm font-medium text-zinc-400 hover:text-amber-200"
            href="/friends"
          >
            ← Back to Friends
          </Link>
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            {isOwnProfile ? "Your profile" : "Profile"}
          </span>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-zinc-50">
                {profile.display_name ?? "Unknown"}
              </h1>
              <p className="text-sm text-zinc-300">
                Wines they&rsquo;ve logged and wines they&rsquo;ve been tagged in.
              </p>
            </div>

            {/* ── Friend action button ── */}
            {!isOwnProfile ? (
              <div className="shrink-0 space-y-2">
                {friendStatus === "friends" ? (
                  confirmingUnfriend ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xs text-zinc-400">Remove friend?</span>
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
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-300 transition hover:border-white/30 disabled:opacity-50"
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
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-300 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )
                ) : friendStatus === "request_sent" ? (
                  <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200">
                    Request sent
                  </span>
                ) : friendStatus === "request_received" ? (
                  <button
                    type="button"
                    disabled={friendActionLoading}
                    onClick={acceptRequest}
                    className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    {friendActionLoading ? "Accepting..." : "Accept friend request"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={friendActionLoading}
                    onClick={sendFriendRequest}
                    className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    {friendActionLoading ? "Sending..." : "Add friend"}
                  </button>
                )}
                {friendActionError ? (
                  <p className="text-right text-xs text-rose-200">{friendActionError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-50">
            Wines they&rsquo;ve uploaded
          </h2>
          {theirEntries.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
              No wines uploaded yet.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {theirEntries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/entries/${entry.id}`}
                  className="group flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                >
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
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
                      <h3 className="font-semibold text-zinc-50">
                        {entry.wine_name || "Untitled wine"}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {entry.producer || "Unknown producer"}
                        {entry.vintage ? (
                          <span className="text-zinc-500"> · {entry.vintage}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide">
                        {entry.rating ? `${entry.rating}/100` : "Unrated"}
                      </span>
                      <span>{formatConsumedDate(entry.consumed_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-50">
            Tagged in by others
          </h2>
          {taggedEntries.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
              Not tagged in any entries yet.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {taggedEntries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/entries/${entry.id}`}
                  className="group flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                >
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
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
                      <p className="text-xs text-zinc-500">
                        Logged by {entry.author_name ?? "Unknown"}
                      </p>
                      <h3 className="font-semibold text-zinc-50">
                        {entry.wine_name || "Untitled wine"}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {entry.producer || "Unknown producer"}
                        {entry.vintage ? (
                          <span className="text-zinc-500"> · {entry.vintage}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide">
                        {entry.rating ? `${entry.rating}/100` : "Unrated"}
                      </span>
                      <span>{formatConsumedDate(entry.consumed_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
