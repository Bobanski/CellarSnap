export type AuthMode = "email" | "phone";

export const DEFAULT_AUTH_MODE: AuthMode = "email";

export function getAuthMode(): AuthMode {
  const raw = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (raw === "phone" || raw === "email") {
    return raw;
  }
  return DEFAULT_AUTH_MODE;
}
