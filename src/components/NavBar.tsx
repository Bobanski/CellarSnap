"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AlertsMenu from "@/components/AlertsMenu";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "My entries", href: "/entries" },
  { label: "Feed", href: "/feed" },
  { label: "Friends", href: "/friends" },
  { label: "Profile", href: "/profile" },
];

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/entries") {
    return (
      pathname === "/entries" ||
      (pathname.startsWith("/entries/") && !pathname.startsWith("/entries/new"))
    );
  }
  if (href === "/profile") {
    return pathname === "/profile";
  }
  return pathname.startsWith(href);
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isNewEntryActive = pathname === "/entries/new";

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on click outside
  useEffect(() => {
    if (!mobileOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [mobileOpen]);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <nav ref={menuRef} className="relative border-b border-white/5 pb-6">
      {/* ── Top bar (always visible) ── */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-50 transition hover:text-amber-200"
        >
          CellarSnap
        </Link>

        {/* ── Desktop nav (md+) ── */}
        <div className="hidden items-center gap-2 md:flex">
          {NAV_ITEMS.map(({ label, href }) => {
            const active = isItemActive(href, pathname);
            return active ? (
              <span
                key={href}
                className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
              >
                {label}
              </span>
            ) : (
              <Link
                key={href}
                href={href}
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              >
                {label}
              </Link>
            );
          })}
          {isNewEntryActive ? (
            <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200">
              New entry
            </span>
          ) : (
            <Link
              href="/entries/new"
              className="rounded-full bg-amber-400/90 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              + New entry
            </Link>
          )}
          <AlertsMenu />
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
            type="button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>

        {/* ── Mobile controls (<md) ── */}
        <div className="flex items-center gap-2 md:hidden">
          {isNewEntryActive ? (
            <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-3 py-1.5 text-sm font-semibold text-amber-200">
              New entry
            </span>
          ) : (
            <Link
              href="/entries/new"
              className="rounded-full bg-amber-400/90 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              + New
            </Link>
          )}
          <AlertsMenu />
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:border-white/30"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              /* X icon */
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              /* Hamburger icon */
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
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown menu ── */}
      {mobileOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-white/10 bg-[#14100f] p-3 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] md:hidden">
          <div className="space-y-1">
            {NAV_ITEMS.map(({ label, href }) => {
              const active = isItemActive(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "border border-amber-300/60 bg-amber-400/10 text-amber-200"
                      : "text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            {!isNewEntryActive ? (
              <Link
                href="/entries/new"
                className="block rounded-xl bg-amber-400/90 px-4 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
              >
                + New entry
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
