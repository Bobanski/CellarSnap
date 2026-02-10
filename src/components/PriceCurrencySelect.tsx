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
        <span>{PRICE_PAID_CURRENCY_SYMBOLS[value]}</span>
        <span className="text-[10px] text-zinc-500">▼</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border border-white/15 bg-[#1f1b18] shadow-xl"
        >
          {PRICE_PAID_CURRENCY_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm transition ${
                    selected
                      ? "bg-amber-400/20 text-amber-100"
                      : "text-zinc-200 hover:bg-white/10"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="font-semibold">{option.symbol}</span>
                  <span className="text-xs tracking-[0.15em] text-zinc-400">
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
