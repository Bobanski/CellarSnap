"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { formatConsumedDate } from "@/lib/formatDate";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  className?: string;
  required?: boolean;
};

export default function DatePicker({
  value,
  onChange,
  onBlur,
  id,
  className = "",
  required,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseYMD(value) ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = parseYMD(value) ?? undefined;
  const displayValue = parseYMD(value)
    ? formatConsumedDate(value)
    : value;

  const handleFocus = () => {
    const parsed = parseYMD(value);
    if (parsed) {
      setMonth(parsed);
    }
    setOpen(true);
  };

  const handleBlur = () => onBlur?.();

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(toYMD(date));
    setMonth(date);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={displayValue}
        readOnly
        onBlur={handleBlur}
        onFocus={handleFocus}
        onClick={handleFocus}
        placeholder="e.g. Jan 26, 2026"
        required={required}
        autoComplete="off"
        className={className}
        aria-haspopup="dialog"
      />
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-white/10 bg-[#1c1917] p-3 shadow-xl"
          role="dialog"
          aria-label="Choose consumed date"
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            month={month}
            onMonthChange={setMonth}
            className="rdp-consumed"
          />
        </div>
      )}
    </div>
  );
}
