"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
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
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ── Confirmation state for destructive actions ── */
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const displayName = (profile: Profile | null) =>
    profile?.display_name ?? profile?.email ?? "Unknown";

  const parseMutationPayload = async (
    response: Response
  ): Promise<FriendMutationPayload> =>
    (await response.json().catch(() => ({}))) as FriendMutationPayload;

  const loadFriends = async () => {
    setFriendError(null);

    const [friendsRes, requestsRes, usersRes, suggestionsRes] = await Promise.all([
      fetch("/api/friends", { cache: "no-store" }),
      fetch("/api/friends/requests", { cache: "no-store" }),
      fetch("/api/users", { cache: "no-store" }),
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

    if (usersRes.ok) {
      const data = await usersRes.json();
      setAllUsers(data.users ?? []);
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

  const filteredUsers = allUsers.filter((user) => {
    if (!friendSearch.trim()) return false;
    const query = friendSearch.trim().toLowerCase();
    const name = displayName(user).toLowerCase();
    return name.includes(query);
  });

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
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading friends...
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
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Friends
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            Keep your cellar circle close.
          </h1>
          <p className="text-sm text-zinc-300">
            Review requests, add friends, and see who you&rsquo;re connected with.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-zinc-200">Your friends</h2>
            <p className="mt-1 text-xs text-zinc-400">
              People you&rsquo;re connected with.
            </p>
            {friends.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No friends yet. Search to add someone.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <Link
                      href={`/profile/${friend.id}`}
                      className="text-sm font-medium text-zinc-100 underline-offset-2 hover:underline hover:text-amber-200"
                    >
                      {displayName(friend)}
                    </Link>

                    {friend.request_id ? (
                      confirmingRemove === friend.request_id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">Remove?</span>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => deleteRequest(friend.request_id!)}
                            className="rounded-full bg-rose-500/80 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmingRemove(null)}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => setConfirmingRemove(friend.request_id!)}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
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
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Pending invites
                </h3>
                <div className="mt-2 space-y-2">
                  {outgoingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <span className="text-sm text-zinc-200">
                        {displayName(request.recipient)}
                      </span>

                      {confirmingCancel === request.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">Cancel?</span>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => deleteRequest(request.id)}
                            className="rounded-full bg-rose-500/80 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmingCancel(null)}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => setConfirmingCancel(request.id)}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
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

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-200">
                Incoming requests
              </h2>
              {incomingRequests.length > 0 ? (
                <span className="accent-count-badge inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {incomingRequests.length > 99 ? "99+" : incomingRequests.length}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Accept or decline new friend requests.
            </p>
            {incomingRequests.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No new requests right now.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {incomingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <p className="text-sm font-medium text-zinc-100">
                      {displayName(request.requester)}
                    </p>
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
                        className="rounded-full border border-rose-400/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300"
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

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-zinc-200">Find friends</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Search by username to send a request.
            </p>
            <input
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
              placeholder="Search by username"
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
            />
            {friendError ? (
              <p className="mt-2 text-sm text-rose-200">{friendError}</p>
            ) : null}
            {filteredUsers.length > 0 ? (
              <div className="mt-3 space-y-2">
                {filteredUsers.slice(0, 5).map((user) => {
                  const label = displayName(user);
                  const isFriend = friendIds.has(user.id);
                  const isOutgoing = outgoingIds.has(user.id);
                  const isIncoming = incomingIds.has(user.id);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-100">
                          {label}
                        </p>
                        {isFriend ? (
                          <p className="text-xs text-emerald-200">
                            Already friends
                          </p>
                        ) : isOutgoing ? (
                          <p className="text-xs text-amber-200">
                            Request sent
                          </p>
                        ) : isIncoming ? (
                          <p className="text-xs text-amber-200">
                            Requested you
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={isFriend || isOutgoing || isMutating}
                        onClick={() => sendRequest(user.id)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : friendSearch.trim() ? (
              <p className="mt-2 text-sm text-zinc-400">No matches.</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-zinc-200">
              People you may know
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Suggested based on mutual friends.
            </p>
            {suggestions.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
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
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-100">
                          {displayName(person)}
                        </p>
                        <p className="text-xs text-amber-200">{mutualLabel}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isFriend || isOutgoing || isMutating}
                        onClick={() => sendRequest(person.id)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
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
  );
}
