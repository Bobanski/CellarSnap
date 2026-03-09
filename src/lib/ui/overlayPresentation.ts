"use client";

import { useLayoutEffect } from "react";

function blurActiveElement() {
  if (typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement !== document.body) {
    activeElement.blur();
  }
}

export function snapViewportToTop() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function useOverlayPresentation(isOpen: boolean) {
  useLayoutEffect(() => {
    if (
      !isOpen ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return;
    }

    blurActiveElement();
    snapViewportToTop();
    const rafId = window.requestAnimationFrame(snapViewportToTop);

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyPosition = body.style.position;
    const previousBodyInset = body.style.inset;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.width = "100%";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      window.cancelAnimationFrame(rafId);
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.position = previousBodyPosition;
      body.style.inset = previousBodyInset;
      body.style.width = previousBodyWidth;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [isOpen]);
}
