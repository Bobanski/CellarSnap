"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type FriendRequestAcceptedNotification = {
  id: string;
  type: "friend_request_accepted";
  actor_id: string;
  actor_name: string;
  created_at: string;
};

type BadgeNotification = {
  id: string;
  type: "badge_earned";
  badge_id: string;
  badge_name: string;
  earned_at: string;
};

type NotificationItem =
  | TagNotification
  | FriendRequestNotification
  | FriendRequestAcceptedNotification
  | BadgeNotification;

export default function AlertsMenu() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [badgeBaseline, setBadgeBaseline] = useState<number | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addToCellarId, setAddToCellarId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(
    null
  );
  const [respondingRequestAction, setRespondingRequestAction] = useState<
    "accept" | "decline" | null
  >(null);
  const [badgesSeenAt, setBadgesSeenAt] = useState<string | null>(null);
  const respondingRequestRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const open = openPathname === pathname;
  const openRef = useRef(open);
  const lastViewerUserIdRef = useRef<string | null>(null);
  const pendingRefreshRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  // Portal target isn't available until after mount (SSR-safe).
  useEffect(() => {
    setMounted(true);
  }, []);

  // The alerts trigger lives inside `.app-header`, which sets `backdrop-filter`
  // and therefore establishes its own CSS stacking context. An `absolute`
  // child confined to that context can never paint above later, unrelated
  // page content (e.g. feed cards) — its z-index only competes with siblings
  // inside the header. Portaling the panel to <body> and positioning it with
  // `fixed` (computed from the trigger's rect) escapes that trap so it
  // reliably renders above all page content instead of "sometimes" losing to
  // whatever's underneath.
  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelPosition({
        top: rect.bottom + 12,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open]);

  // Move focus into the panel when it opens so keyboard/screen-reader users
  // land on it immediately instead of it silently appearing behind content.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (
      lastViewerUserIdRef.current &&
      viewerUserId &&
      lastViewerUserIdRef.current !== viewerUserId
    ) {
      setBadgeBaseline(null);
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
        setBadgeBaseline((prev) => (prev === null ? next : prev));
      }
    } catch {
      // Ignore storage failures.
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || badgeBaseline === null) return;
    persistBadgeBaseline(badgeBaseline);
  }, [badgeBaseline, persistBadgeBaseline, viewerUserId]);

  // Initialize badges_seen_at from localStorage. If no value exists (first visit
  // or backfill scenario), set it to now so backfilled badges don't show as new.
  useEffect(() => {
    if (!viewerUserId) return;
    const key = `cellarsnap:badges_seen_at:${viewerUserId}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setBadgesSeenAt(stored);
      } else {
        const now = new Date().toISOString();
        localStorage.setItem(key, now);
        setBadgesSeenAt(now);
      }
    } catch {
      // Ignore storage failures (private mode, etc).
      setBadgesSeenAt(new Date().toISOString());
    }
  }, [viewerUserId]);

  const refreshCount = useCallback(async () => {
    const badgesParam = badgesSeenAt
      ? `&badges_since=${encodeURIComponent(badgesSeenAt)}`
      : "";
    const response = await fetch(
      `/api/notifications?count_only=true${badgesParam}`,
      { cache: "no-store" }
    );
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    const unseen =
      typeof data.unseen_count === "number" && Number.isFinite(data.unseen_count)
        ? Math.max(0, Math.round(data.unseen_count))
        : 0;

    setCount(unseen);
    setBadgeBaseline((prev) => {
      if (prev === null) {
        return null;
      }
      const next = Math.min(prev, unseen);
      if (next !== prev) {
        persistBadgeBaseline(next);
      }
      return next;
    });
  }, [badgesSeenAt, persistBadgeBaseline]);

  const refreshItems = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true);
      }
      setActionError(null);
      const badgesParam = badgesSeenAt
        ? `?badges_since=${encodeURIComponent(badgesSeenAt)}`
        : "";
      const response = await fetch(`/api/notifications${badgesParam}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setActionError(payload.error ?? "Unable to load alerts.");
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
          if (prev === null) {
            return null;
          }
          const next = Math.min(prev, unseen);
          if (next !== prev) {
            persistBadgeBaseline(next);
          }
          return next;
        });
      }
      if (!silent) setLoading(false);
    },
    [badgesSeenAt, persistBadgeBaseline]
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
      // Mark all badge notifications as seen by advancing the timestamp
      if (viewerUserId) {
        const now = new Date().toISOString();
        setBadgesSeenAt(now);
        try {
          localStorage.setItem(
            `cellarsnap:badges_seen_at:${viewerUserId}`,
            now
          );
        } catch {
          // Ignore storage failures.
        }
      }
      return;
    }
    setOpenPathname(null);
  };

  // Load current user id (used for realtime subscriptions)
  useEffect(() => {
    let isMounted = true;

    const loadViewer = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!isMounted) return;
        setViewerUserId(user?.id ?? null);
      } finally {
        if (isMounted) {
          setViewerLoaded(true);
        }
      }
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_notifications",
          filter: `user_id=eq.${viewerUserId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_badges",
          filter: `user_id=eq.${viewerUserId}`,
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

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (deletingId) return;

      setActionError(null);
      setDeletingId(notificationId);
      try {
        const response = await fetch(`/api/notifications/${notificationId}`, {
          method: "DELETE",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setActionError(payload.error ?? "Unable to delete this alert.");
          return;
        }

        setItems((prev) => prev.filter((row) => row.id !== notificationId));
        setCount((prev) => {
          const next = Math.max(0, prev - 1);
          setBadgeBaseline((baselinePrev) => {
            if (baselinePrev === null) {
              return next;
            }
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
    },
    [deletingId, persistBadgeBaseline]
  );

  const respondToFriendRequest = useCallback(
    async (requestId: string, action: "accept" | "decline") => {
      if (respondingRequestRef.current) return;

      respondingRequestRef.current = true;
      setActionError(null);
      setRespondingRequestId(requestId);
      setRespondingRequestAction(action);

      try {
        const response = await fetch(
          `/api/friends/requests/${requestId}/${action}`,
          { method: "POST" }
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          setActionError(payload.error ?? "Unable to update friend request.");
          return;
        }

        const expectedStatus = action === "accept" ? "accepted" : "declined";
        if (
          payload.success !== true ||
          payload.request_id !== requestId ||
          payload.status !== expectedStatus
        ) {
          setActionError("Request state changed unexpectedly. Please refresh.");
          return;
        }

        setItems((prev) =>
          prev.filter((row) => !(row.type === "friend_request" && row.id === requestId))
        );
        setCount((prev) => {
          const next = Math.max(0, prev - 1);
          setBadgeBaseline((baselinePrev) => {
            if (baselinePrev === null) {
              return next;
            }
            const nextBaseline = Math.min(baselinePrev, next);
            if (nextBaseline !== baselinePrev) {
              persistBadgeBaseline(nextBaseline);
            }
            return nextBaseline;
          });
          return next;
        });
      } catch {
        setActionError("Unable to update friend request.");
      } finally {
        respondingRequestRef.current = false;
        setRespondingRequestId(null);
        setRespondingRequestAction(null);
      }
    },
    [persistBadgeBaseline]
  );

  const displayCount =
    !viewerLoaded || badgeBaseline === null
      ? 0
      : open
        ? 0
        : Math.max(0, count - badgeBaseline);

  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
    }
  }, [open]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      // The panel is portaled to <body>, so it's not a DOM descendant of
      // menuRef anymore — check both refs before treating a click as "outside".
      if (menuRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpenPathname(null);
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
        className="accent-outline-hover relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-primary)] transition"
        onClick={toggleOpen}
        aria-label="Alerts"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="10" cy="5.6" r="3" opacity="0.35" />
          <circle cx="6.8" cy="8.8" r="3" opacity="0.3" />
          <circle cx="13.2" cy="8.8" r="3" opacity="0.35" />
          <circle cx="8.4" cy="12" r="3" opacity="0.3" />
          <circle cx="11.6" cy="12" r="3" opacity="0.35" />
          <circle cx="10" cy="14.8" r="3" opacity="0.25" />
          <line x1="10" y1="2.6" x2="10" y2="1.6" stroke="currentColor" strokeWidth="0.8" opacity="0.6" fill="none" />
          <path d="M10 1.6 Q12 1 12.8 1.6" stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.5" />
        </svg>
        {displayCount > 0 ? (
          <span className="accent-count-badge absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
            {displayCount}
          </span>
        ) : null}
      </button>

      {open && mounted && panelPosition
        ? createPortal(
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-label="Alerts"
              className="fixed z-[60] w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] outline-none"
              style={{ top: panelPosition.top, right: panelPosition.right }}
            >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
              Alerts
            </span>
            <button
              type="button"
              onClick={() => setOpenPathname(null)}
              className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
              aria-label="Close alerts"
            >
              Close
            </button>
          </div>
          {loading ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">Loading...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">
              No new alerts yet.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {items.map((item) => {
                if (item.type === "friend_request") {
                  const accepting =
                    respondingRequestId === item.id &&
                    respondingRequestAction === "accept";
                  const declining =
                    respondingRequestId === item.id &&
                    respondingRequestAction === "decline";
                  return (
                    <li
                      key={item.id}
                      className="border-b border-white/5 last:border-none"
                    >
                      <div className="px-4 py-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-primary)]/10">
                        <div className="min-w-0">
                          <Link
                            href={`/profile/${item.requester_id}`}
                            className="underline-offset-2 hover:underline hover:text-[var(--color-accent-secondary)]"
                            onClick={() => setOpenPathname(null)}
                          >
                            <span className="accent-text font-semibold">
                              {item.requester_name}
                            </span>
                          </Link>{" "}
                          sent you a friend request
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={respondingRequestId !== null}
                            onClick={() =>
                              respondToFriendRequest(item.id, "accept")
                            }
                            aria-label="Accept friend request"
                            className="accent-solid-button rounded-full px-3 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {accepting ? "Accepting..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            disabled={respondingRequestId !== null}
                            onClick={() =>
                              respondToFriendRequest(item.id, "decline")
                            }
                            aria-label="Decline friend request"
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {declining ? "Declining..." : "Decline"}
                          </button>
                          <Link
                            href="/friends"
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                            onClick={() => setOpenPathname(null)}
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                }

                if (item.type === "friend_request_accepted") {
                  return (
                    <li
                      key={item.id}
                      className="border-b border-white/5 last:border-none"
                    >
                      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-primary)]/10">
                        <Link
                          href={`/profile/${item.actor_id}`}
                          className="min-w-0 flex-1 truncate"
                          onClick={() => {
                            setOpenPathname(null);
                            deleteNotification(item.id).catch(() => null);
                          }}
                        >
                          <span className="accent-text font-semibold">
                            {item.actor_name}
                          </span>{" "}
                          accepted your friend request
                        </Link>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={() => deleteNotification(item.id)}
                          aria-label="Dismiss alert"
                          className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {deletingId === item.id ? "..." : "x"}
                        </button>
                      </div>
                    </li>
                  );
                }

                if (item.type === "badge_earned") {
                  return (
                    <li
                      key={item.id}
                      className="border-b border-white/5 last:border-none"
                    >
                      <Link
                        href={`/badges/${item.badge_id}`}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-primary)]/10"
                        onClick={() => setOpenPathname(null)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Badge unlocked:{" "}
                          <span className="accent-text font-semibold">
                            {item.badge_name}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                }

                return (
                  <li
                    key={item.id}
                    className="border-b border-white/5 last:border-none"
                  >
                    <div className="px-4 py-3 text-sm text-[var(--color-text-primary)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm text-[var(--color-text-primary)]">
                          <span className="accent-text font-semibold">
                            {item.actor_name}
                          </span>{" "}
                          tagged you in{" "}
                          <span className="text-[var(--color-text-primary)]">
                            {item.wine_name || "a wine"}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={async () => {
                            if (confirmDeleteId !== item.id) {
                              setConfirmDeleteId(item.id);
                              return;
                            }
                            deleteNotification(item.id).catch(() => null);
                          }}
                          aria-label={
                            confirmDeleteId === item.id
                              ? "Confirm delete alert"
                              : "Delete alert"
                          }
                          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-70 ${
                            confirmDeleteId === item.id
                              ? "border-rose-400/40 text-rose-200 hover:border-rose-300"
                              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
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
                          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
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
                                  if (baselinePrev === null) {
                                    return next;
                                  }
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
                          className="rounded-full bg-[var(--color-accent-primary)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-70"
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
            <div className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-rose-200">
              {actionError}
            </div>
          ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
