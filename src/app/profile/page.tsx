"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AlertsMenu from "@/components/AlertsMenu";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type ProfileFormValues = {
  display_name: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const requiresUsernameSetup =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("setup") === "username";

  const { register, handleSubmit, reset } = useForm<ProfileFormValues>({
    defaultValues: { display_name: "" },
  });

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        setErrorMessage("Unable to load profile.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (isMounted && data.profile) {
        setProfile(data.profile);
        reset({ display_name: data.profile.display_name ?? "" });
        setLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [reset, router]);

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
    loadFriends().catch(() => null);
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    const trimmedDisplayName = values.display_name.trim();
    if (trimmedDisplayName.length < 3) {
      setErrorMessage("Username must be at least 3 characters.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: trimmedDisplayName,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setErrorMessage(data.error ?? "Unable to update profile.");
      return;
    }

    const data = await response.json();
    if (data.profile) {
      setProfile(data.profile);
      setSuccessMessage(
        "Username saved. This is the name shown to other people in the app."
      );
    }
  });

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const displayName = (profile: Profile | null) =>
    profile?.display_name ?? profile?.email ?? "Unknown";

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              My profile
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Edit how you appear
            </h1>
            <p className="text-sm text-zinc-300">
              Set your username so friends see your name across the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
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
              Friends tab
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries/new"
            >
              New entry
            </Link>
            <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200">
              My profile
            </span>
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <form onSubmit={onSubmit} className="space-y-6">
            {requiresUsernameSetup ? (
              <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Set a username to continue using CellarSnap.
              </p>
            ) : null}
            {errorMessage ? (
              <p className="text-sm text-rose-200">{errorMessage}</p>
            ) : null}
            {successMessage ? (
              <p className="text-sm text-emerald-200">{successMessage}</p>
            ) : null}

            <div>
              <label
                className="mb-1 block text-sm font-medium text-zinc-300"
                htmlFor="display_name"
              >
                Username
              </label>
              <p className="mb-2 text-xs text-zinc-500">
                This name is shown across the app. Minimum 3 characters.
              </p>
              <input
                id="display_name"
                type="text"
                placeholder="e.g. wine_lover"
                maxLength={100}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("display_name", { required: true })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-500">
                Email
              </label>
              <p className="text-sm text-zinc-300">
                {profile?.email ?? "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Your email is used to sign in and is not editable here.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Friends
            </span>
            <h2 className="text-2xl font-semibold text-zinc-50">
              Manage your friends
            </h2>
            <p className="text-sm text-zinc-300">
              Add friends, review requests, and keep your circle close.
            </p>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <label className="text-sm font-medium text-zinc-300">
                Find people
              </label>
              <input
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
                placeholder="Search by name or email"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
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
                          {isFriend
                            ? "Friends"
                            : isOutgoing
                            ? "Pending"
                            : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : friendSearch.trim() ? (
                <p className="mt-2 text-sm text-zinc-400">No matches.</p>
              ) : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Incoming requests
                </h3>
                {incomingRequests.length === 0 ? (
                  <p className="text-sm text-zinc-500">No new requests.</p>
                ) : (
                  incomingRequests.map((request) => (
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
                  ))
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Outgoing requests
                </h3>
                {outgoingRequests.length === 0 ? (
                  <p className="text-sm text-zinc-500">No pending invites.</p>
                ) : (
                  outgoingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <p className="text-sm font-medium text-zinc-100">
                        {displayName(request.recipient)}
                      </p>
                      <p className="text-xs text-amber-200">
                        Awaiting response
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Friends</h3>
                {friends.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No friends yet. Add someone above.
                  </p>
                ) : (
                  friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <p className="text-sm font-medium text-zinc-100">
                        {displayName(friend)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
