"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type MenuOverlayProps = {
  open: boolean;
  onClose: () => void;
};

type UserStats = {
  displayName: string;
  entryCount: number;
  friendCount: number;
  countryCount: number;
  pendingFriendRequests: number;
};

export default function MenuOverlay({ open, onClose }: MenuOverlayProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    const loadStats = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !isMounted) return;

        const [profileRes, entriesRes, friendsRes, requestsRes, countriesRes] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("display_name")
              .eq("id", user.id)
              .single(),
            supabase
              .from("wine_entries")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("entry_status", "consumed"),
            supabase
              .from("friend_requests")
              .select("id", { count: "exact", head: true })
              .eq("status", "accepted")
              .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
            supabase
              .from("friend_requests")
              .select("id", { count: "exact", head: true })
              .eq("recipient_id", user.id)
              .eq("status", "pending"),
            supabase
              .from("wine_entries")
              .select("country")
              .eq("user_id", user.id)
              .not("country", "is", null),
          ]);

        if (!isMounted) return;

        const uniqueCountries = new Set(
          (countriesRes.data ?? [])
            .map((row: { country: string | null }) => row.country?.trim())
            .filter(Boolean)
        );

        setStats({
          displayName:
            profileRes.data?.display_name ?? user.email ?? "Wine lover",
          entryCount: entriesRes.count ?? 0,
          friendCount: friendsRes.count ?? 0,
          countryCount: uniqueCountries.size,
          pendingFriendRequests: requestsRes.count ?? 0,
        });
      } catch {
        // Silently fail — menu still works without stats
      }
    };

    loadStats();
    return () => {
      isMounted = false;
    };
  }, [open, supabase]);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    onClose();
    router.push("/login");
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const initial = stats?.displayName?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ backgroundColor: "var(--color-screen-bg)" }}
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center gap-3 px-4"
        style={{ height: 50 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
          aria-label="Close menu"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="20" y1="12" x2="4" y2="12" />
            <polyline points="10 18 4 12 10 6" />
          </svg>
        </button>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            fontWeight: 300,
            letterSpacing: 0,
            color: "var(--color-text-primary)",
          }}
        >
          cluster
        </span>
      </div>

      {/* User section */}
      <div className="px-6 pb-6 pt-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold"
            style={{
              backgroundColor: "var(--color-accent-primary)",
              color: "var(--color-text-on-accent)",
            }}
          >
            {initial}
          </div>
          <div>
            <p
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {stats?.displayName ?? "Loading..."}
            </p>
            {stats ? (
              <p
                className="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {`${stats.entryCount} pours · ${stats.friendCount} friends · ${stats.countryCount} countries`}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Account section */}
      <div className="px-6">
        <p
          className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Account
        </p>
        <div className="space-y-1">
          <MenuLink
            href="/profile"
            label="Profile"
            subtitle="Edit name, bio, avatar, privacy"
            onClose={onClose}
          />
          <MenuLink
            href="/palate"
            label="My Palate"
            subtitle="Sensory profile & taste preferences"
            onClose={onClose}
          />
          <MenuLink
            href="/explore"
            label="Explore"
            subtitle="Regions, grapes, producers"
            onClose={onClose}
          />
          <MenuLink
            href="/entries?tab=collections"
            label="My Collections"
            subtitle="Saved wines from feed and your own pours"
            onClose={onClose}
          />
          <MenuLink
            href="/palate?tab=badges"
            label="Badges"
            subtitle="Your earned badges and achievements"
            onClose={onClose}
          />
          <MenuLink
            href="/palate?tab=friends"
            label="Friends"
            subtitle="Requests, search, suggestions"
            badge={
              stats?.pendingFriendRequests
                ? stats.pendingFriendRequests
                : undefined
            }
            onClose={onClose}
          />
        </div>
      </div>

      {/* More section */}
      <div className="mt-6 px-6">
        <p
          className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          More
        </p>
        <div className="space-y-1">
          <MenuLink
            href="/feedback"
            label="Feedback"
            subtitle="Bug reports & feature ideas"
            onClose={onClose}
          />
          <MenuLink
            href="/privacy"
            label="Privacy & Terms"
            onClose={onClose}
          />
        </div>
      </div>

      {/* Sign out */}
      <div className="mt-auto px-6 pb-8 pt-6">
        <button
          type="button"
          onClick={onSignOut}
          className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-semibold transition hover:border-[var(--color-border-strong)]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function MenuLink({
  href,
  label,
  subtitle,
  badge,
  onClose,
}: {
  href: string;
  label: string;
  subtitle?: string;
  badge?: number;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center justify-between rounded-xl px-3 py-3 transition hover:bg-[var(--color-surface-raised)]"
    >
      <div>
        <p
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </p>
        {subtitle ? (
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {badge ? (
        <span className="accent-count-badge flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
