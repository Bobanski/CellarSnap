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
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7" />
      <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="10" y1="3" x2="10" y2="17" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" opacity="0.6" />
      <circle cx="13.5" cy="6.5" r="1.2" fill="currentColor" opacity="0.4" />
      <circle cx="6.5" cy="13.5" r="1.2" fill="currentColor" opacity="0.5" />
      <circle cx="13.5" cy="13.5" r="1.2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function LogFabIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="11.96" fill="#7B1D3A" />
      <circle cx="13" cy="14.04" r="6.76" fill="#F5EDD6" />
      <line x1="13" y1="7.28" x2="13" y2="5.72" stroke="#F5EDD6" strokeWidth="1.17" strokeLinecap="round" />
      <path d="M13 5.72 Q15.86 4.42 16.9 5.46" stroke="#F5EDD6" strokeWidth="0.91" fill="none" strokeLinecap="round" />
      <rect x="11.8" y="10.92" width="2.34" height="6.24" rx="0.78" fill="#7B1D3A" />
      <rect x="9.16" y="13.06" width="7.8" height="2.08" rx="0.78" fill="#7B1D3A" />
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

function ScanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7" />
      <line x1="7" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="7" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="2" y1="10" x2="18" y2="10" stroke="#C4607A" strokeWidth="1.2" opacity="0.6" strokeDasharray="1.5 1.5" />
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
  { label: "Cellar", href: "/entries", icon: <CellarIcon /> },
  { label: "Log", href: "/entries/new", icon: <LogFabIcon />, isFab: true },
  { label: "Somm", href: "/sommelier", icon: <SommIcon />, betaOnly: true },
  { label: "Scan", href: "/list-scan", icon: <ScanIcon />, betaOnly: true },
];

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
