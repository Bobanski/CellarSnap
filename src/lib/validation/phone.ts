export const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

export const PHONE_FORMAT_MESSAGE =
  "Enter a valid phone number (10-digit US format or +E.164).";

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
