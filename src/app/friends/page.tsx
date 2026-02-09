"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AlertsMenu from "@/components/AlertsMenu";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export default function FriendsPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<
    { id: string; requester: Profile }[]
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    { id: string; recipient: Profile }[]
  >([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const displayName = (profile: Profile | null) =>
    profile?.display_name ?? profile?.email ?? "Unknown";

  const loadFriends = async () => {
    setFriendError(null);

    const [friendsRes, requestsRes, usersRes] = await Promise.all([
      fetch("/api/friends", { cache: "no-store" }),
      fetch("/api/friends/requests", { cache: "no-store" }),
      fetch("/api/users", { cache: "no-store" }),
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
  };

  useEffect(() => {
    setLoading(true);
    loadFriends()
      .catch(() => null)
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
    setIsRequesting(true);
    setFriendError(null);
    const response = await fetch("/api/friends/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: userId }),
    });
    setIsRequesting(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setFriendError(payload.error ?? "Unable to send request.");
      return;
    }
    setFriendSearch("");
    await loadFriends();
  };

  const respondToRequest = async (id: string, action: "accept" | "decline") => {
    setFriendError(null);
    const response = await fetch(`/api/friends/requests/${id}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setFriendError(payload.error ?? "Unable to update request.");
      return;
    }
    await loadFriends();
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Loading friends...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Friends
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Keep your cellar circle close.
            </h1>
            <p className="text-sm text-zinc-300">
              Review requests, add friends, and see who you’re connected with.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries"
            >
              My entries
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/feed"
            >
              Social Feed
            </Link>
            <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200">
              Friends
            </span>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries/new"
            >
              New entry
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/profile"
            >
              My profile
            </Link>
            <AlertsMenu />
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-sm font-semibold text-zinc-200">
              Incoming requests
            </h2>
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
                        className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-300"
                        onClick={() => respondToRequest(request.id, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-rose-400/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300"
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
                        disabled={isFriend || isOutgoing || isRequesting}
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
            <h2 className="text-sm font-semibold text-zinc-200">Your friends</h2>
            <p className="mt-1 text-xs text-zinc-400">
              People you’re connected with.
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
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100"
                  >
                    {displayName(friend)}
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
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200"
                    >
                      {displayName(request.recipient)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
