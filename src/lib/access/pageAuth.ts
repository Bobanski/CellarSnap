import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

type UserLike = User | null | undefined;

/**
 * Auth-only gate for server-component pages that used to be private-beta
 * gated. Redirects signed-out visitors to /login; returns the user
 * otherwise. No feature-flag / beta check — any signed-in account may
 * proceed. See src/lib/access/privateBetaFeatures.ts for the (still-used)
 * beta gate on admin-only surfaces like /sommelier/knowledge.
 */
export function requireAuthenticatedPageUser(user: UserLike): User {
  if (!user) {
    redirect("/login");
  }

  return user;
}
