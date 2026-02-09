"use client";

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

  const isNewEntryActive = pathname === "/entries/new";

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight text-zinc-50 transition hover:text-amber-200"
      >
        CellarSnap
      </Link>
      <div className="flex flex-wrap items-center gap-2">
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
    </nav>
  );
}
