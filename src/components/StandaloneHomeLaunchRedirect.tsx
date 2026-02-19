"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const LAST_HIDDEN_AT_KEY = "cellarsnap:lastHiddenAt";
const MIN_BACKGROUND_MS_FOR_HOME_REDIRECT = 1500;

const HOME_REDIRECT_EXEMPT_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
];

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || mediaStandalone;
}

function shouldRedirectToHome(pathname: string) {
  if (pathname === "/") {
    return false;
  }

  return !HOME_REDIRECT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getLastHiddenAt() {
  try {
    const value = window.localStorage.getItem(LAST_HIDDEN_AT_KEY);
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setLastHiddenAtNow() {
  try {
    window.localStorage.setItem(LAST_HIDDEN_AT_KEY, String(Date.now()));
  } catch {
    // Ignore localStorage failures.
  }
}

function clearLastHiddenAt() {
  try {
    window.localStorage.removeItem(LAST_HIDDEN_AT_KEY);
  } catch {
    // Ignore localStorage failures.
  }
}

export default function StandaloneHomeLaunchRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!isStandaloneDisplayMode()) {
      return;
    }

    const maybeRedirectToHome = () => {
      if (!shouldRedirectToHome(pathname)) {
        return;
      }

      const lastHiddenAt = getLastHiddenAt();
      if (!lastHiddenAt) {
        return;
      }

      const hiddenDurationMs = Date.now() - lastHiddenAt;
      clearLastHiddenAt();

      if (hiddenDurationMs >= MIN_BACKGROUND_MS_FOR_HOME_REDIRECT) {
        router.replace("/");
      }
    };

    if (!hasInitialized.current) {
      hasInitialized.current = true;
      maybeRedirectToHome();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setLastHiddenAtNow();
        return;
      }

      if (document.visibilityState === "visible") {
        maybeRedirectToHome();
      }
    };

    const onPageHide = () => {
      setLastHiddenAtNow();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname, router]);

  return null;
}
