"use client";

import { getTodayLocalYmd } from "@/lib/dateYmd";

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  const normalizedValue = isValidYmd(value) ? value : "";
  const todayYmd = getTodayLocalYmd();

  return (
    <input
      id={id}
      type="date"
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      required={required}
      max={todayYmd}
      autoComplete="off"
      className={className}
    />
  );
}
