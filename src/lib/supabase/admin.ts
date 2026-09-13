import type { Database } from "@shared";
import { createClient } from "@supabase/supabase-js";

export function createTypedSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin environment variables (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** Explicit bridge for admin consumers awaiting AUD-21 query adoption. */
export function createSupabaseAdminClient() {
  return createTypedSupabaseAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
}
