"use client";

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TODAY_YMD = toYmd(new Date());

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
  return (
    <input
      id={id}
      type="date"
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      required={required}
      max={TODAY_YMD}
      autoComplete="off"
      className={className}
    />
  );
}
