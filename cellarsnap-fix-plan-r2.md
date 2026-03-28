# CellarSnap Fix Plan — Round 2

> **Architect review complete.** The previous SWE round edited React Native mobile files
> (`apps/mobile/...`). All 6 fixes below target the **Next.js web app** under
> `/Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/`.
>
> Each fix has verified file paths, exact old code (copy-pasted from the source), and exact
> replacement code. Apply as find-and-replace. No ambiguity.

---

## Fix 1 — P0 #1: Nav highlight highlights CELLAR when coming from feed

**File:** `src/components/BottomTabBar.tsx`

**Problem:** Navigating from feed to an entry detail (`/entries/[id]?from=feed`) activates the
CELLAR tab. It should stay on FEED since the user entered from the feed context.

**Change A — Update import to add `useSearchParams`:**

```diff
// OLD (line 4)
import { usePathname } from "next/navigation";

// NEW
import { usePathname, useSearchParams } from "next/navigation";
```

**Exact old string:**
```
import { usePathname } from "next/navigation";
```

**Exact new string:**
```
import { usePathname, useSearchParams } from "next/navigation";
```

---

**Change B — Update `isTabActive` to accept `fromFeed` flag:**

**Exact old string:**
```
function isTabActive(href: string, pathname: string): boolean {
  if (href === "/feed") {
    return pathname === "/feed" || pathname === "/";
  }
  if (href === "/entries") {
    return (
      pathname === "/entries" ||
      (pathname.startsWith("/entries/") && !pathname.startsWith("/entries/new"))
    );
  }
  if (href === "/entries/new") {
    return pathname === "/entries/new";
  }
  return pathname.startsWith(href);
}
```

**Exact new string:**
```
function isTabActive(href: string, pathname: string, fromFeed: boolean): boolean {
  const onEntryDetail =
    pathname.startsWith("/entries/") && !pathname.startsWith("/entries/new");

  if (href === "/feed") {
    return pathname === "/feed" || pathname === "/" || (fromFeed && onEntryDetail);
  }
  if (href === "/entries") {
    if (fromFeed && onEntryDetail) return false;
    return pathname === "/entries" || onEntryDetail;
  }
  if (href === "/entries/new") {
    return pathname === "/entries/new";
  }
  return pathname.startsWith(href);
}
```

---

**Change C — Read `searchParams` and pass `fromFeed` into `isTabActive`:**

**Exact old string:**
```
export default function BottomTabBar() {
  const pathname = usePathname();
  const { hasPrivateBetaFeatureAccess } = usePrivateBetaFeatureAccess();

  const tabs = hasPrivateBetaFeatureAccess
    ? ALL_TABS
    : ALL_TABS.filter((tab) => !tab.betaOnly);

  return (
    <nav className="bottom-tab-bar flex shrink-0 items-end justify-around">
      {tabs.map((tab) => {
        const active = isTabActive(tab.href, pathname);
```

**Exact new string:**
```
export default function BottomTabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromFeed = searchParams.get("from") === "feed";
  const { hasPrivateBetaFeatureAccess } = usePrivateBetaFeatureAccess();

  const tabs = hasPrivateBetaFeatureAccess
    ? ALL_TABS
    : ALL_TABS.filter((tab) => !tab.betaOnly);

  return (
    <nav className="bottom-tab-bar flex shrink-0 items-end justify-around">
      {tabs.map((tab) => {
        const active = isTabActive(tab.href, pathname, fromFeed);
```

---

## Fix 2 — P0 #2: Hamburger menu shows 0 friends (profile shows correct count)

**File:** `src/components/MenuOverlay.tsx`

**Problem:** The hamburger queries `friendships` table with `.eq("user_id", user.id)`, which
only matches one side of the friendship. The `/api/friends` route (used by the profile page)
correctly queries `friend_requests` with status=`accepted` filtering on both
`requester_id` and `recipient_id`. The hamburger needs the same logic.

**Exact old string:**
```
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
              .eq("user_id", user.id),
            supabase
              .from("friendships")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id),
            supabase
              .from("friend_requests")
              .select("id", { count: "exact", head: true })
              .eq("recipient_id", user.id)
              .eq("status", "pending"),
```

**Exact new string:**
```
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
              .eq("user_id", user.id),
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
```

---

## Fix 3 — P0 #4: Feed shows "Loading feed..." text instead of skeleton cards

**File:** `src/app/feed/page.tsx`

**Problem:** The loading state renders a plain text message. It should render skeleton cards
that match the shape of real feed cards.

**Exact old string:**
```
        {loading ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm text-[var(--color-text-secondary)]">
            Loading feed...
          </div>
        ) : errorMessage ? (
```

**Exact new string:**
```
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-4 animate-pulse"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-full bg-[var(--color-surface-raised)]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-28 rounded bg-[var(--color-surface-raised)]" />
                    <div className="h-2.5 w-20 rounded bg-[var(--color-surface-raised)]" />
                  </div>
                </div>
                <div className="aspect-[4/3] w-full rounded-xl bg-[var(--color-surface-raised)] mb-4" />
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded bg-[var(--color-surface-raised)]" />
                  <div className="h-3 w-1/2 rounded bg-[var(--color-surface-raised)]" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage ? (
```

---

## Fix 4 — P1 #1: Entry detail page uses two-column grid layout

**File:** `src/app/entries/[id]/page.tsx`

**Problem:** Line 788 uses `grid gap-6 lg:grid-cols-2`, creating a two-column layout on large
screens. The design calls for a single-column layout throughout.

**Exact old string:**
```
        <div className="grid gap-6 lg:grid-cols-2">
```

**Exact new string:**
```
        <div className="space-y-6">
```

---

## Fix 5 — P1 #4: Report dropdown doesn't close on Escape or click-outside

**File:** `src/app/feed/page.tsx`

This requires two changes.

**Change A — Add a `useEffect` for Escape key (place after the existing useEffects near line 476):**

**Exact old string:**
```
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, DRINKING_NOW_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);
```

**Exact new string:**
```
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, DRINKING_NOW_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!postMenuEntryId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPostMenuEntryId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [postMenuEntryId]);
```

---

**Change B — Add a backdrop div for click-outside (wraps the existing dropdown div):**

**Exact old string:**
```
                          {postMenuEntryId === entry.id ? (
                            <div
                              className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] py-1 text-left shadow-lg"
                              onClick={(event) => event.stopPropagation()}
                            >
```

**Exact new string:**
```
                          {postMenuEntryId === entry.id ? (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setPostMenuEntryId(null)}
                                aria-hidden="true"
                              />
                              <div
                                className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] py-1 text-left shadow-lg"
                                onClick={(event) => event.stopPropagation()}
                              >
```

**Change C — Close the new fragment wrapping (find the closing of the existing conditional):**

**Exact old string:**
```
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  {entry.entry_group && (entry.group_slides?.length ?? 0) > 0 ? (
```

**Exact new string:**
```
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  {entry.entry_group && (entry.group_slides?.length ?? 0) > 0 ? (
```

---

## Fix 6 — P1 #5: "Loading entry..." and "Loading entries..." text instead of skeletons

### Fix 6a — Entry detail loading state

**File:** `src/app/entries/[id]/page.tsx`

**Exact old string:**
```
  if (loading) {
    return (
      <AppShell>
        <div className="px-6 py-6 text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-5xl space-y-8">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm text-[var(--color-text-secondary)]">
              Loading entry...
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
```

**Exact new string:**
```
  if (loading) {
    return (
      <AppShell>
        <div className="px-6 py-6 text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-5xl space-y-8 animate-pulse">
            <div className="space-y-3">
              <div className="h-4 w-24 rounded bg-[var(--color-surface-raised)]" />
              <div className="h-7 w-3/4 rounded bg-[var(--color-surface-raised)]" />
              <div className="h-4 w-1/2 rounded bg-[var(--color-surface-raised)]" />
            </div>
            <div className="aspect-[4/3] w-full rounded-2xl bg-[var(--color-surface-raised)]" />
            <div className="space-y-3">
              <div className="h-4 w-full rounded bg-[var(--color-surface-raised)]" />
              <div className="h-4 w-5/6 rounded bg-[var(--color-surface-raised)]" />
              <div className="h-4 w-2/3 rounded bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
```

---

### Fix 6b — Profile entries loading state

**File:** `src/app/profile/page.tsx`

**Exact old string:**
```
                {entriesLoading ? (
                  <p className="mt-4 text-center text-sm text-[var(--color-text-tertiary)]">Loading entries...</p>
                ) : null}
```

**Exact new string:**
```
                {entriesLoading ? (
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 animate-pulse">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-lg bg-[var(--color-surface-raised)]"
                      />
                    ))}
                  </div>
                ) : null}
```

---

## Summary

| Fix | File | Lines affected |
|-----|------|---------------|
| P0 #1 Nav highlight | `src/components/BottomTabBar.tsx` | 4, 85–99, 101–113 |
| P0 #2 Friend count | `src/components/MenuOverlay.tsx` | 51–55 |
| P0 #4 Feed skeleton | `src/app/feed/page.tsx` | 1140–1143 |
| P1 #1 Entry layout | `src/app/entries/[id]/page.tsx` | 788 |
| P1 #4 Report dropdown | `src/app/feed/page.tsx` | ~470–476, 1293–1342 |
| P1 #5 Skeleton states | `src/app/entries/[id]/page.tsx` + `src/app/profile/page.tsx` | 509–521, 1054–1056 |
