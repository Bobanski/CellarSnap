"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { usePrivateBetaFeatureAccess } from "@/lib/access/usePrivateBetaFeatureAccess";

function FeedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6.4" r="3.6" fill="currentColor" opacity="0.95" />
      <circle cx="6.4" cy="11.2" r="3.6" fill="currentColor" opacity="0.8" />
      <circle cx="13.6" cy="11.2" r="3.6" fill="currentColor" opacity="0.6" />
      <line x1="10" y1="2.8" x2="10" y2="2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
      <path d="M10 2 Q12.4 1.2 13.2 2" stroke="currentColor" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function CellarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
      <path d="M5.12 56.32 L5.12 28.16 Q5.12 3.84 32 3.84 Q58.88 3.84 58.88 28.16 L58.88 56.32" fill="none" stroke="currentColor" strokeWidth="2.88" strokeLinecap="round" opacity="0.3" />
      <path d="M14.08 56.32 L14.08 30.72 Q14.08 11.52 32 11.52 Q49.92 11.52 49.92 30.72 L49.92 56.32" fill="none" stroke="currentColor" strokeWidth="2.88" strokeLinecap="round" opacity="0.55" />
      <path d="M21.76 56.32 L21.76 33.28 Q21.76 17.92 32 17.92 Q42.24 17.92 42.24 33.28 L42.24 56.32" fill="currentColor" opacity="0.2" />
      <path d="M21.76 56.32 L21.76 33.28 Q21.76 17.92 32 17.92 Q42.24 17.92 42.24 33.28 L42.24 56.32" fill="none" stroke="currentColor" strokeWidth="2.56" strokeLinecap="round" opacity="0.8" />
      <circle cx="32" cy="35.84" r="5.12" fill="currentColor" opacity="0.9" />
      <line x1="5.12" y1="56.32" x2="58.88" y2="56.32" stroke="currentColor" strokeWidth="1.92" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

function LogFabIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="11.96" style={{ fill: "var(--color-accent-primary)" }} />
      <circle cx="13" cy="14.04" r="6.76" style={{ fill: "var(--color-text-primary)" }} />
      <line x1="13" y1="7.28" x2="13" y2="5.72" style={{ stroke: "var(--color-text-primary)" }} strokeWidth="1.17" strokeLinecap="round" />
      <path d="M13 5.72 Q15.86 4.42 16.9 5.46" style={{ stroke: "var(--color-text-primary)" }} strokeWidth="0.91" fill="none" strokeLinecap="round" />
      <rect x="11.8" y="10.92" width="2.34" height="6.24" rx="0.78" style={{ fill: "var(--color-accent-primary)" }} />
      <rect x="9.16" y="13.06" width="7.8" height="2.08" rx="0.78" style={{ fill: "var(--color-accent-primary)" }} />
    </svg>
  );
}

function SommIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <ellipse cx="10" cy="14.4" rx="5.6" ry="3.6" fill="currentColor" opacity="0.9" />
      <path d="M8.8 11.6 Q8.8 8.8 9.2 6 Q9.6 4 10 3.6 Q10.4 4 10.8 6 Q11.2 8.8 11.2 11.6 Z" fill="currentColor" opacity="0.85" />
      <circle cx="10" cy="3.2" r="1.2" fill="currentColor" opacity="0.8" />
      <ellipse cx="10" cy="15.4" rx="3.6" ry="1.6" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="8.8" cy="10" r="6" fill="currentColor" opacity="0.9" />
      <circle cx="8.8" cy="10" r="3.4" fill="currentColor" opacity="0.5" />
      <circle cx="16" cy="5.6" r="2" fill="currentColor" opacity="0.85" />
      <circle cx="16.4" cy="10.8" r="1.6" fill="currentColor" opacity="0.65" />
      <circle cx="14.4" cy="15.6" r="1.4" fill="currentColor" opacity="0.45" />
      <line x1="15.2" y1="6.8" x2="13.2" y2="8.4" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      <line x1="15.6" y1="10.8" x2="13.2" y2="10.8" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      <line x1="14.4" y1="14.8" x2="12.8" y2="13.4" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
    </svg>
  );
}

function PalateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <ellipse cx="10" cy="13" rx="6" ry="4.5" fill="currentColor" opacity="0.3" />
      <path d="M7 13 Q7 6 10 4 Q13 6 13 13" fill="currentColor" opacity="0.7" />
      <ellipse cx="10" cy="13.5" rx="3.5" ry="2" fill="currentColor" opacity="0.4" />
      <circle cx="10" cy="8" r="1.2" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

type TabDef = {
  label: string;
  href: string;
  icon: React.ReactNode;
  isFab?: boolean;
  betaOnly?: boolean;
};

const ALL_TABS: TabDef[] = [
  { label: "Feed", href: "/feed", icon: <FeedIcon /> },
  { label: "Somm", href: "/sommelier", icon: <SommIcon />, betaOnly: true },
  { label: "Log", href: "/entries/new", icon: <LogFabIcon />, isFab: true },
  { label: "Explore", href: "/explore", icon: <ExploreIcon />, betaOnly: true },
  { label: "Palate", href: "/palate", icon: <PalateIcon /> },
];

function isTabActive(href: string, pathname: string, fromFeed: boolean): boolean {
  const onEntryDetail =
    pathname.startsWith("/entries/") && !pathname.startsWith("/entries/new");

  if (href === "/feed") {
    return pathname === "/feed" || pathname === "/" || (fromFeed && onEntryDetail);
  }
  if (href === "/entries/new") {
    return pathname === "/entries/new";
  }
  if (href === "/palate") {
    return pathname === "/palate" || pathname === "/profile" || pathname === "/badges" || pathname === "/friends";
  }
  return pathname.startsWith(href);
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromFeed = searchParams.get("from") === "feed";
  const { hasPrivateBetaFeatureAccess } = usePrivateBetaFeatureAccess();

  const tabs = hasPrivateBetaFeatureAccess === false
    ? ALL_TABS.filter((tab) => !tab.betaOnly)
    : ALL_TABS;

  return (
    <nav className="bottom-tab-bar flex shrink-0 items-end justify-around" style={{ overflow: "visible" }}>
      {tabs.map((tab) => {
        const active = isTabActive(tab.href, pathname, fromFeed);

        if (tab.isFab) {
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              className="flex flex-col items-center gap-0.5"
            >
              <div
                className="flex h-[46px] w-[46px] items-center justify-center rounded-full"
                style={{
                  background: "var(--color-accent-primary)",
                  boxShadow: "0 4px 16px rgba(123, 29, 58, 0.5)",
                  marginTop: "-12px",
                }}
              >
                {tab.icon}
              </div>
              <span
                className="text-[8px] font-medium uppercase tracking-[1px]"
                style={{
                  color: active
                    ? "var(--color-accent-secondary)"
                    : "var(--color-text-tertiary)",
                }}
              >
                {tab.label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-0.5"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: active ? "rgba(196, 96, 122, 0.1)" : "transparent",
                color: active ? "var(--color-accent-secondary)" : "var(--color-text-tertiary)",
              }}
            >
              {tab.icon}
            </div>
            <span
              className="text-[8px] font-medium uppercase tracking-[1px]"
              style={{
                color: active
                  ? "var(--color-accent-secondary)"
                  : "var(--color-text-tertiary)",
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
