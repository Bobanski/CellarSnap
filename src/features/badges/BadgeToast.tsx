"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BadgeIcon from "./BadgeIcon";

type BadgeCategory = "taste" | "region" | "milestone" | "social";
type BadgeTier = "nouveau" | "vieilles_vignes" | "reserve" | "mise_en_cave";
type BadgeShape =
  | "cluster"
  | "drop"
  | "volcano"
  | "star"
  | "compass"
  | "book"
  | "leaf"
  | "flame"
  | "crown"
  | "lightning"
  | "hourglass";
type BadgeColor =
  | "barolo"
  | "grenache"
  | "rose"
  | "nebbiolo"
  | "champagne"
  | "viognier"
  | "green"
  | "fog";

interface ToastBadge {
  id: string;
  name: string;
  tier: string;
  shape: string;
  color: string;
  accent: string;
  toastText: string;
}

interface BadgeToastProps {
  badge: ToastBadge | null;
  onDismiss: () => void;
}

export default function BadgeToast({ badge, onDismiss }: BadgeToastProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!badge) {
      setVisible(false);
      return;
    }

    // Trigger slide-up animation on next frame
    const enterTimer = requestAnimationFrame(() => setVisible(true));

    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [badge, onDismiss]);

  if (!badge) return null;

  return (
    <button
      type="button"
      onClick={() => {
        onDismiss();
        router.push("/badges");
      }}
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-[380px] cursor-pointer border-0 bg-transparent p-0"
    >
      <div
        className="flex items-center gap-4 rounded-2xl border border-[var(--color-border-strong)] px-5 py-4 transition-all duration-300"
        style={{
          background: "#2C0A14",
          transform: visible ? "translateY(0)" : "translateY(16px)",
          opacity: visible ? 1 : 0,
        }}
      >
        <BadgeIcon
          shape={badge.shape as BadgeShape}
          color={badge.color as BadgeColor}
          accent={badge.accent as BadgeColor}
          tier={badge.tier as BadgeTier}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] uppercase tracking-[2px] text-[var(--color-accent-secondary)]"
            style={{ fontFamily: "var(--font-sans)", marginBottom: "3px" }}
          >
            Badge unlocked
          </div>
          <div
            className="text-base text-[#F5EDD6]"
            style={{ fontFamily: "var(--font-serif)", marginBottom: "2px" }}
          >
            {badge.name}
          </div>
          <div
            className="text-xs leading-snug text-[#F5EDD6]/75"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {badge.toastText}
          </div>
        </div>
      </div>
    </button>
  );
}
