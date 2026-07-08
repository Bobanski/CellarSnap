"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppImage from "@/components/AppImage";
import AppShell from "@/components/AppShell";

type Profile = {
  id: string;
  display_name: string | null;
  email?: string | null;
  avatar_url?: string | null;
  username?: string | null;
};

type Friend = Profile & { request_id: string | null };

type Suggestion = Profile & { mutual_count: number };
type FriendMutationPayload = {
  success?: boolean;
  status?: string;
  request_id?: string;
  error?: string;
};

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<
    { id: string; requester: Profile }[]
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    { id: string; recipient: Profile }[]
  >([]);
  const [searchResults, setSearchResults] = useState<
    { id: string; display_name: string | null; username?: string | null; avatar_url?: string | null }[]
  >([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ── Confirmation state for destructive actions ── */
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const displayName = (profile: Profile | null) =>
    profile?.display_name ?? "Unknown";

  const profileInitial = (profile: {
    display_name?: string | null;
    email?: string | null;
    username?: string | null;
  }) => {
    const label =
      profile.display_name?.trim() ||
      profile.username?.trim() ||
      profile.email?.trim() ||
      "?";
    return label.slice(0, 1).toUpperCase();
  };

  const FriendAvatar = ({ profile }: { profile: Profile }) => (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-sm font-semibold text-[var(--color-text-tertiary)]">
      {profile.avatar_url ? (
        <AppImage src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{profileInitial(profile)}</span>
      )}
    </div>
  );

  const parseMutationPayload = async (
    response: Response
  ): Promise<FriendMutationPayload> =>
    (await response.json().catch(() => ({}))) as FriendMutationPayload;

  const loadFriends = async () => {
    setFriendError(null);

    const [friendsRes, requestsRes, suggestionsRes] = await Promise.all([
      fetch("/api/friends", { cache: "no-store" }),
      fetch("/api/friends/requests", { cache: "no-store" }),
      fetch("/api/friends/suggestions", { cache: "no-store" }),
    ]);

    if (friendsRes.ok) {
      const data = await friendsRes.json();
      setFriends(data.friends ?? []);
    }

    if (requestsRes.ok) {
      const data = await requestsRes.json();
      setIncomingRequests(data.incoming ?? []);
      setOutgoingRequests(data.outgoing ?? []);
    }

    if (suggestionsRes.ok) {
      const data = await suggestionsRes.json();
      setSuggestions(data.suggestions ?? []);
    }
  };

  useEffect(() => {
    loadFriends()
      .catch(() => setFriendError("Unable to load friends right now."))
      .finally(() => setLoading(false));
  }, []);

  const friendIds = new Set(friends.map((friend) => friend.id));
  const outgoingIds = new Set(
    outgoingRequests.map((request) => request.recipient.id)
  );
  const incomingIds = new Set(
    incomingRequests.map((request) => request.requester.id)
  );

  useEffect(() => {
    let isMounted = true;
    const query = friendSearch.trim();

    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/users?search=${encodeURIComponent(query)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          if (isMounted) {
            setSearchResults([]);
            setSearchError("Unable to search right now.");
            setSearchLoading(false);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setSearchResults(data.users ?? []);
          setSearchLoading(false);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (isMounted) {
          setSearchResults([]);
          setSearchError("Unable to search right now.");
          setSearchLoading(false);
        }
      }
    }, 200);

    return () => {
      isMounted = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [friendSearch]);

  const sendRequest = async (userId: string) => {
    setIsMutating(true);
    setFriendError(null);
    try {
      const response = await fetch("/api/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: userId }),
      });
      const payload = await parseMutationPayload(response);

      if (!response.ok) {
        setFriendError(payload.error ?? "Unable to send request.");
        return;
      }

      if (
        !payload.request_id ||
        (payload.status !== "pending" && payload.status !== "accepted")
      ) {
        setFriendError("Unexpected response while sending request.");
        return;
      }

      setFriendSearch("");
      await loadFriends();
    } catch {
      setFriendError("Unable to send request.");
    } finally {
      setIsMutating(false);
    }
  };

  const respondToRequest = async (id: string, action: "accept" | "decline") => {
    setFriendError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/friends/requests/${id}/${action}`, {
        method: "POST",
      });
      const payload = await parseMutationPayload(response);

      if (!response.ok) {
        setFriendError(payload.error ?? "Unable to update request.");
        return;
      }

      const expectedStatus = action === "accept" ? "accepted" : "declined";
      if (
        payload.success !== true ||
        payload.request_id !== id ||
        payload.status !== expectedStatus
      ) {
        setFriendError("Request state changed unexpectedly. Please refresh.");
        return;
      }

      await loadFriends();
    } catch {
      setFriendError("Unable to update request.");
    } finally {
      setIsMutating(false);
    }
  };

  const deleteRequest = async (requestId: string) => {
    setFriendError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/friends/requests/${requestId}`, {
        method: "DELETE",
      });
      const payload = await parseMutationPayload(response);

      if (!response.ok) {
        setFriendError(payload.error ?? "Unable to process request.");
        return;
      }

      if (payload.success !== true || payload.request_id !== requestId) {
        setFriendError("Request state changed unexpectedly. Please refresh.");
        return;
      }

      setConfirmingCancel(null);
      setConfirmingRemove(null);
      await loadFriends();
    } catch {
      setFriendError("Unable to process request.");
    } finally {
      setIsMutating(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="px-6 py-6 text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-6xl space-y-8">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 text-sm text-[var(--color-text-secondary)]">
              Loading friends...
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
          <span className="block text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            Friends
          </span>
          <h1
            className="text-3xl font-normal text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Keep your cellar circle close.
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Review requests, add friends, and see who you&rsquo;re connected with.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Your friends</h2>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              People you&rsquo;re connected with.
            </p>
            {friends.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                No friends yet. Search to add someone.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                  >
                    <Link
                      href={`/profile/${friend.id}`}
                      className="flex min-w-0 items-center gap-3 text-sm font-medium text-[var(--color-text-primary)] underline-offset-2 hover:underline hover:text-[var(--color-accent-secondary)]"
                    >
                      <FriendAvatar profile={friend} />
                      <span className="truncate">{displayName(friend)}</span>
                    </Link>

                    {friend.request_id ? (
                      confirmingRemove === friend.request_id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-tertiary)]">Remove?</span>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => deleteRequest(friend.request_id!)}
                            className="rounded-full bg-rose-600/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmingRemove(null)}
                            className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => setConfirmingRemove(friend.request_id!)}
                          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-tertiary)] transition hover:border-rose-400/40 hover:text-rose-700 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {outgoingRequests.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Pending invites
                </h3>
                <div className="mt-2 space-y-2">
                  {outgoingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                    >
                      <Link
                        href={`/profile/${request.recipient.id}`}
                        className="flex min-w-0 items-center gap-3 text-sm text-[var(--color-text-primary)] underline-offset-2 hover:underline hover:text-[var(--color-accent-secondary)]"
                      >
                        <FriendAvatar profile={request.recipient} />
                        <span className="truncate">{displayName(request.recipient)}</span>
                      </Link>

                      {confirmingCancel === request.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-tertiary)]">Cancel?</span>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => deleteRequest(request.id)}
                            className="rounded-full bg-rose-600/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmingCancel(null)}
                            className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => setConfirmingCancel(request.id)}
                          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-tertiary)] transition hover:border-rose-400/40 hover:text-rose-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 backdrop-blur">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Incoming requests
              </h2>
              {incomingRequests.length > 0 ? (
                <span className="accent-count-badge inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {incomingRequests.length > 99 ? "99+" : incomingRequests.length}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Accept or decline new friend requests.
            </p>
            {incomingRequests.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                No new requests right now.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {incomingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
                  >
                    <Link
                      href={`/profile/${request.requester.id}`}
                      className="flex min-w-0 items-center gap-3 text-sm font-medium text-[var(--color-text-primary)] underline-offset-2 hover:underline hover:text-[var(--color-accent-secondary)]"
                    >
                      <FriendAvatar profile={request.requester} />
                      <span className="truncate">{displayName(request.requester)}</span>
                    </Link>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="accent-solid-button rounded-full px-3 py-1 text-xs font-semibold transition"
                        disabled={isMutating}
                        onClick={() => respondToRequest(request.id, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-rose-400/40 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300"
                        disabled={isMutating}
                        onClick={() => respondToRequest(request.id, "decline")}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Find friends</h2>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Search by username or name. Results show usernames only.
            </p>
            <input
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
              placeholder="Search by username or name"
              className="mt-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
            />
            {friendError ? (
              <p className="mt-2 text-sm text-rose-700">{friendError}</p>
            ) : null}
            {searchError ? (
              <p className="mt-2 text-sm text-rose-700">{searchError}</p>
            ) : null}
            {searchLoading ? (
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Searching...</p>
            ) : null}
            {searchResults.length > 0 ? (
              <div className="mt-3 space-y-2">
                {searchResults.slice(0, 5).map((user) => {
                  const label = user.display_name ?? user.username ?? "Unknown";
                  const isFriend = friendIds.has(user.id);
                  const isOutgoing = outgoingIds.has(user.id);
                  const isIncoming = incomingIds.has(user.id);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FriendAvatar profile={user} />
                        <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {label}
                        </p>
                        {isFriend ? (
                          <p className="text-xs text-emerald-700">
                            Already friends
                          </p>
                        ) : isOutgoing ? (
                          <p className="text-xs text-[var(--color-accent-secondary)]">
                            Request sent
                          </p>
                        ) : isIncoming ? (
                          <p className="text-xs text-[var(--color-accent-secondary)]">
                            Requested you
                          </p>
                        ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isFriend || isOutgoing || isMutating}
                        onClick={() => sendRequest(user.id)}
                        className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : friendSearch.trim() && !searchLoading && !searchError ? (
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">No matches.</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              People you may know
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Suggested based on mutual friends.
            </p>
            {suggestions.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                No suggestions right now. Add more friends to see recommendations.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {suggestions.map((person) => {
                  const isFriend = friendIds.has(person.id);
                  const isOutgoing = outgoingIds.has(person.id);
                  const mutualLabel =
                    person.mutual_count === 1
                      ? "1 mutual friend"
                      : `${person.mutual_count} mutual friends`;
                  return (
                    <div
                      key={person.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                    >
                      <Link
                        href={`/profile/${person.id}`}
                        className="flex min-w-0 items-center gap-3 underline-offset-2 hover:underline hover:text-[var(--color-accent-secondary)]"
                      >
                        <FriendAvatar profile={person} />
                        <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {displayName(person)}
                        </p>
                        <p className="text-xs text-[var(--color-accent-secondary)]">{mutualLabel}</p>
                        </div>
                      </Link>
                      <button
                        type="button"
                        disabled={isFriend || isOutgoing || isMutating}
                        onClick={() => sendRequest(person.id)}
                        className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
