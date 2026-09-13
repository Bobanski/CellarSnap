import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type MiddlewareContext = {
  request: NextRequest;
  response: NextResponse;
};

export async function createTypedSupabaseServerClient(context?: MiddlewareContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  // Middleware / Route Handler style (explicit request/response cookies)
  if (context) {
    const { request, response } = context;

    return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Keep request/response in sync so subsequent reads see refreshed tokens.
            try {
              request.cookies.set(name, value);
            } catch {
              // ignore request mutation failures
            }
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    });
  }

  // Server Components / general server usage (Next 16 cookies may be async)
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        // Server Components can have read-only cookies; Route Handlers can set.
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // ignore
          }
        });
      },
    },
  });
}

// Temporary AUD-21 bridge. New query slices should use the typed factory above.
export async function createSupabaseServerClient(context?: MiddlewareContext): Promise<SupabaseClient> {
  return createTypedSupabaseServerClient(context);
}
