const PRIVATE_BETA_EMAILS = new Set([
  "eitansneider1@gmail.com",
  "ethan.jesse.samuels@gmail.com",
  "daniswanson98@gmail.com",
]);

function normalizeEmail(email: string | null | undefined) {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function canAccessPrivateBetaFeatures(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized ? PRIVATE_BETA_EMAILS.has(normalized) : false;
}
