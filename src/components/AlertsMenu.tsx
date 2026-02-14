"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type TagNotification = {
  id: string;
  type: "tagged";
  entry_id: string;
  actor_name: string;
  wine_name: string | null;
  created_at: string;
};

type FriendRequestNotification = {
  id: string;
  type: "friend_request";
  requester_id: string;
  requester_name: string;
  created_at: string;
};

type NotificationItem = TagNotification | FriendRequestNotification;

export default function AlertsMenu() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [badgeBaseline, setBadgeBaseline] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addToCellarId, setAddToCellarId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const open = openPathname === pathname;
  const openRef = useRef(open);
  const lastViewerUserIdRef = useRef<string | null>(null);
  const pendingRefreshRef = useRef<number | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (
      lastViewerUserIdRef.current &&
      viewerUserId &&
      lastViewerUserIdRef.current !== viewerUserId
    ) {
      setBadgeBaseline(0);
    }
    lastViewerUserIdRef.current = viewerUserId;
  }, [viewerUserId]);

  const persistBadgeBaseline = useCallback(
    (value: number) => {
      if (!viewerUserId) return;
      try {
        localStorage.setItem(
          `cellarsnap:alerts_badge_baseline:${viewerUserId}`,
          String(value)
        );
      } catch {
        // Ignore storage failures (private mode, etc).
      }
    },
    [viewerUserId]
  );

  useEffect(() => {
    if (!viewerUserId) return;
    try {
      const raw = localStorage.getItem(
        `cellarsnap:alerts_badge_baseline:${viewerUserId}`
      );
      const parsed = raw ? Number(raw) : 0;
      if (Number.isFinite(parsed) && parsed >= 0) {
        const next = Math.floor(parsed);
        setBadgeBaseline((prev) => (prev > 0 ? prev : next));
      }
    } catch {
      // Ignore storage failures.
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId) return;
    persistBadgeBaseline(badgeBaseline);
  }, [badgeBaseline, persistBadgeBaseline, viewerUserId]);

  const refreshCount = useCallback(async () => {
    const response = await fetch("/api/notifications?count_only=true", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    const unseen =
      typeof data.unseen_count === "number" && Number.isFinite(data.unseen_count)
        ? Math.max(0, Math.round(data.unseen_count))
        : 0;

    setCount(unseen);
    setBadgeBaseline((prev) => {
      const next = Math.min(prev, unseen);
      if (next !== prev) {
        persistBadgeBaseline(next);
      }
      return next;
    });
  }, [persistBadgeBaseline]);

  const refreshItems = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true);
      }
      setActionError(null);
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });
      if (!response.ok) {
        if (!silent) setLoading(false);
        return;
      }
      const data = await response.json().catch(() => ({}));
      setItems(data.notifications ?? []);
      const unseen =
        typeof data.unseen_count === "number" && Number.isFinite(data.unseen_count)
          ? Math.max(0, Math.round(data.unseen_count))
          : 0;
      setCount(unseen);

      // The badge represents "new since you last opened the menu", not
      // "pending until deletion". When the menu is open, acknowledge everything
      // currently present by updating the baseline to the current unseen count.
      if (openRef.current) {
        setBadgeBaseline(unseen);
        persistBadgeBaseline(unseen);
      } else {
        setBadgeBaseline((prev) => {
          const next = Math.min(prev, unseen);
          if (next !== prev) {
            persistBadgeBaseline(next);
          }
          return next;
        });
      }
      if (!silent) setLoading(false);
    },
    [persistBadgeBaseline]
  );

  const scheduleRefresh = useCallback(() => {
    if (pendingRefreshRef.current !== null) return;
    pendingRefreshRef.current = window.setTimeout(() => {
      pendingRefreshRef.current = null;
      refreshCount().catch(() => null);
      if (openRef.current) {
        refreshItems({ silent: true }).catch(() => null);
      }
    }, 250);
  }, [refreshCount, refreshItems]);

  const toggleOpen = () => {
    const nextOpen = !open;
    if (nextOpen) {
      setOpenPathname(pathname);
      setBadgeBaseline(count);
      persistBadgeBaseline(count);
      return;
    }
    setOpenPathname(null);
  };

  // Load current user id (used for realtime subscriptions)
  useEffect(() => {
    let isMounted = true;

    const loadViewer = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isMounted) return;
      setViewerUserId(user?.id ?? null);
    };

    loadViewer().catch(() => null);
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  // Keep badge count fresh even if the user doesn't navigate.
  // Realtime is best-effort; polling/focus are the fallback.
  useEffect(() => {
    refreshCount().catch(() => null);

    const intervalId = window.setInterval(() => {
      refreshCount().catch(() => null);
    }, 25000);

    const onFocus = () => refreshCount().catch(() => null);
    const onVisibility = () => {
      if (!document.hidden) refreshCount().catch(() => null);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshCount]);

  // Best-effort realtime: refresh count/items when notifications change.
  useEffect(() => {
    if (!viewerUserId) return;

    const channel = supabase
      .channel(`alerts:${viewerUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wine_notifications",
          filter: `user_id=eq.${viewerUserId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `recipient_id=eq.${viewerUserId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, scheduleRefresh, viewerUserId]);

  useEffect(() => {
    return () => {
      if (pendingRefreshRef.current !== null) {
        window.clearTimeout(pendingRefreshRef.current);
      }
    };
  }, []);

  // When menu opens: fetch full notifications list (lazy)
  useEffect(() => {
    if (!open) return;

    refreshItems().catch(() => null);
  }, [open, refreshItems]);

  const displayCount = open ? 0 : Math.max(0, count - badgeBaseline);

  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
    }
  }, [open]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpenPathname(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPathname(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="accent-outline-hover relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition"
        onClick={toggleOpen}
        aria-label="Alerts"
      >
        <span className="text-lg">🔔</span>
        {displayCount > 0 ? (
          <span className="accent-count-badge absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
            {displayCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-80 overflow-hidden rounded-2xl border border-white/10 bg-[#14100f] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Alerts
            </span>
            <button
              type="button"
              onClick={() => setOpenPathname(null)}
              className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:border-white/30"
              aria-label="Close alerts"
            >
              Close
            </button>
          </div>
          {loading ? (
            <div className="px-4 py-4 text-sm text-zinc-300">Loading...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-4 text-sm text-zinc-300">
              No new alerts yet.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {items.map((item) => {
                if (item.type === "friend_request") {
                  return (
                    <li
                      key={item.id}
                      className="border-b border-white/5 last:border-none"
                    >
                      <Link
                        href="/friends"
                        className="block px-4 py-3 text-sm text-zinc-200 hover:bg-white/5"
                        onClick={() => setOpenPathname(null)}
                      >
                        <span className="accent-text font-semibold">
                          {item.requester_name}
                        </span>{" "}
                        sent you a friend request
                      </Link>
                    </li>
                  );
                }

                return (
                  <li
                    key={item.id}
                    className="border-b border-white/5 last:border-none"
                  >
                    <div className="px-4 py-3 text-sm text-zinc-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm text-zinc-200">
                          <span className="accent-text font-semibold">
                            {item.actor_name}
                          </span>{" "}
                          tagged you in{" "}
                          <span className="text-zinc-100">
                            {item.wine_name || "a wine"}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={async () => {
                            if (deletingId) return;

                            if (confirmDeleteId !== item.id) {
                              setConfirmDeleteId(item.id);
                              return;
                            }

                            setActionError(null);
                            setDeletingId(item.id);
                            try {
                              const response = await fetch(
                                `/api/notifications/${item.id}`,
                                { method: "DELETE" }
                              );
                              const payload = await response
                                .json()
                                .catch(() => ({}));
                              if (!response.ok) {
                                setActionError(
                                  payload.error ?? "Unable to delete this alert."
                                );
                                return;
                              }

                              setItems((prev) =>
                                prev.filter((row) => row.id !== item.id)
                              );
                              setCount((prev) => {
                                const next = Math.max(0, prev - 1);
                                setBadgeBaseline((baselinePrev) => {
                                  const nextBaseline = Math.min(baselinePrev, next);
                                  if (nextBaseline !== baselinePrev) {
                                    persistBadgeBaseline(nextBaseline);
                                  }
                                  return nextBaseline;
                                });
                                return next;
                              });
                              setConfirmDeleteId(null);
                            } catch {
                              setActionError("Unable to delete this alert.");
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          aria-label={
                            confirmDeleteId === item.id
                              ? "Confirm delete alert"
                              : "Delete alert"
                          }
                          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-70 ${
                            confirmDeleteId === item.id
                              ? "border-rose-400/40 text-rose-200 hover:border-rose-300"
                              : "border-white/10 text-zinc-300 hover:border-white/30"
                          }`}
                        >
                          {deletingId === item.id
                            ? "..."
                            : confirmDeleteId === item.id
                              ? "DELETE"
                              : "x"}
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/entries/${item.entry_id}`}
                          className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-white/30"
                          onClick={() => setOpenPathname(null)}
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          disabled={addToCellarId === item.id}
                          onClick={async () => {
                            setActionError(null);
                            setAddToCellarId(item.id);
                            try {
                              const response = await fetch(
                                `/api/entries/${item.entry_id}/add-to-log`,
                                { method: "POST" }
                              );
                              const payload = await response
                                .json()
                                .catch(() => ({}));
                              if (!response.ok) {
                                setActionError(
                                  payload.error ??
                                    "Unable to add this tasting right now."
                                );
                                return;
                              }
                              const nextEntryId =
                                typeof payload.entry_id === "string"
                                  ? payload.entry_id
                                  : null;
                              if (!nextEntryId) {
                                setActionError(
                                  "Unable to add this tasting right now."
                                );
                                return;
                              }

                              setItems((prev) =>
                                prev.filter((row) => row.id !== item.id)
                              );
                              setCount((prev) => {
                                const next = Math.max(0, prev - 1);
                                setBadgeBaseline((baselinePrev) => {
                                  const nextBaseline = Math.min(baselinePrev, next);
                                  if (nextBaseline !== baselinePrev) {
                                    persistBadgeBaseline(nextBaseline);
                                  }
                                  return nextBaseline;
                                });
                                return next;
                              });
                              setOpenPathname(null);
                              router.push(`/entries/${nextEntryId}/edit`);
                            } catch {
                              setActionError(
                                "Unable to add this tasting right now."
                              );
                            } finally {
                              setAddToCellarId(null);
                            }
                          }}
                          className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {addToCellarId === item.id
                            ? "Adding..."
                            : "Add to my cellar"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {actionError ? (
            <div className="border-t border-white/10 px-4 py-3 text-xs text-rose-200">
              {actionError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
