"use client";

import { useEffect, useRef, useState } from "react";
import {
  PRICE_PAID_CURRENCY_OPTIONS,
  PRICE_PAID_CURRENCY_SYMBOLS,
  type PricePaidCurrency,
} from "@/lib/entryMeta";

type PriceCurrencySelectProps = {
  value: PricePaidCurrency;
  onChange: (value: PricePaidCurrency) => void;
  ariaLabel?: string;
};

export default function PriceCurrencySelect({
  value,
  onChange,
  ariaLabel = "Price currency",
}: PriceCurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resolvedValue = PRICE_PAID_CURRENCY_OPTIONS.some(
    (option) => option.value === value
  )
    ? value
    : "usd";

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="inline-flex h-10 items-center gap-1 rounded-l-xl border border-white bg-white px-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span>{PRICE_PAID_CURRENCY_SYMBOLS[resolvedValue]}</span>
        <span className="text-[10px] text-[var(--color-text-tertiary)]">▼</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] shadow-xl"
        >
          {PRICE_PAID_CURRENCY_OPTIONS.map((option) => {
            const selected = option.value === resolvedValue;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm transition ${
                    selected
                      ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-gold)]"
                      : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="font-semibold">{option.symbol}</span>
                  <span className="text-xs tracking-[0.15em] text-[var(--color-text-tertiary)]">
                    {option.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
