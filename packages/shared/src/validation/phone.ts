export const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

export const PHONE_FORMAT_MESSAGE =
  "Enter a valid phone number (10-digit US format or +E.164).";

function formatUsNumberWithDashes(digits: string): string {
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);

  if (digits.length <= 3) {
    return area;
  }

  if (digits.length <= 6) {
    return `${area}-${prefix}`;
  }

  return `${area}-${prefix}-${line}`;
}

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    if ((trimmed.match(/\+/g) ?? []).length > 1) {
      return null;
    }
    const digits = trimmed.slice(1).replace(/\D/g, "");
    const normalized = `+${digits}`;
    return PHONE_E164_REGEX.test(normalized) ? normalized : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

export function formatPhoneForInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return hasLeadingPlus ? "+" : "";
  }

  if (!hasLeadingPlus) {
    if (digits.length <= 10) {
      return formatUsNumberWithDashes(digits.slice(0, 10));
    }

    if (digits.length === 11 && digits.startsWith("1")) {
      const usLocal = digits.slice(1);
      return `1-${formatUsNumberWithDashes(usLocal)}`;
    }

    return digits;
  }

  if (digits.startsWith("1")) {
    const usLocal = digits.slice(1, 11);
    if (!usLocal) {
      return "+1";
    }
    return `+1-${formatUsNumberWithDashes(usLocal)}`;
  }

  return `+${digits}`;
}

export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) {
    return "—";
  }

  const normalized = normalizePhone(raw);
  if (!normalized) {
    return raw;
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return formatUsNumberWithDashes(digits.slice(1));
  }

  return normalized;
}
