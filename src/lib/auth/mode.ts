import {
  DEFAULT_AUTH_MODE,
  getAuthMode as resolveAuthMode,
  type AuthMode,
} from "@shared/auth";

export type { AuthMode };
export { DEFAULT_AUTH_MODE };

export function getAuthMode(): AuthMode {
  return resolveAuthMode(process.env.NEXT_PUBLIC_AUTH_MODE);
}
