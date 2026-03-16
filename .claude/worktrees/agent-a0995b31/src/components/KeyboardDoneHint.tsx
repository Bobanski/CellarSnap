"use client";

import { useEffect } from "react";

const KEYBOARD_TARGET_SELECTOR = "input:not([type='hidden']), textarea";

function applyDoneHint(element: HTMLInputElement | HTMLTextAreaElement) {
  if (element instanceof HTMLInputElement && element.type === "hidden") {
    return;
  }
  element.enterKeyHint = "done";
}

function applyDoneHintsWithin(node: ParentNode) {
  node
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      KEYBOARD_TARGET_SELECTOR
    )
    .forEach((element) => applyDoneHint(element));
}

function applyDoneHintsFromNode(node: Node) {
  if (!(node instanceof Element)) {
    return;
  }

  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    applyDoneHint(node);
  }
  applyDoneHintsWithin(node);
}

export default function KeyboardDoneHint() {
  useEffect(() => {
    applyDoneHintsWithin(document);

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        applyDoneHint(target);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      window.setTimeout(() => {
        if (document.activeElement === target) {
          target.blur();
        }
      }, 0);
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          applyDoneHintsFromNode(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
