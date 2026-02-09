"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const open = openPathname === pathname;

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }
      const data = await response.json();
      if (isMounted) {
        setCount(data.unseen_count ?? 0);
        setItems(data.notifications ?? []);
        setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const markSeen = async () => {
      await fetch("/api/notifications/mark-seen", {
        method: "POST",
      }).catch(() => null);
      setCount(0);
    };

    markSeen();
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
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
        onClick={() =>
          setOpenPathname((prev) => (prev === pathname ? null : pathname))
        }
        aria-label="Alerts"
      >
        <span className="text-lg">🔔</span>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-zinc-950">
            {count}
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
                        <span className="font-semibold text-amber-200">
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
                    <Link
                      href={`/entries/${item.entry_id}`}
                      className="block px-4 py-3 text-sm text-zinc-200 hover:bg-white/5"
                      onClick={() => setOpenPathname(null)}
                    >
                      <span className="font-semibold text-amber-200">
                        {item.actor_name}
                      </span>{" "}
                      tagged you in{" "}
                      <span className="text-zinc-100">
                        {item.wine_name || "a wine"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
