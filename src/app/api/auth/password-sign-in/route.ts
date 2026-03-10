import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isMissingDbFunctionError } from "@/lib/supabase/errors";
import { resolveIdentifierForAuth } from "@/server/auth/identifierResolution";

const requestSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  authMode: z.enum(["email", "phone"]).optional(),
});

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

type AuthSession = {
  access_token: string;
  refresh_token: string;
};

type SupabaseAuthClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  auth: {
    signInWithPassword: (
      credentials:
        | { email: string; password: string }
        | { phone: string; password: string }
    ) => Promise<{
      data: { session: AuthSession | null };
      error: { message?: string } | null;
    }>;
  };
};

type PasswordSignInHandlerDependencies = {
  createAuthClient: () => SupabaseAuthClient;
};

function createDefaultAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as unknown as SupabaseAuthClient;
}

const defaultDependencies: PasswordSignInHandlerDependencies = {
  createAuthClient: createDefaultAuthClient,
};

export function createPasswordSignInHandler(
  dependencies: Partial<PasswordSignInHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  return async function POST(request: Request) {
    const rateLimit = applyRateLimit({
      request,
      routeKey: "password-sign-in",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait a bit and try again." },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Identifier and password required." }, { status: 400 });
    }

    let supabase: SupabaseAuthClient;
    try {
      supabase = resolvedDependencies.createAuthClient();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication is temporarily unavailable.";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    let resolution;
    try {
      resolution = await resolveIdentifierForAuth({
        client: supabase,
        identifier: parsed.data.identifier,
        mode: "auto",
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string" &&
        (isMissingDbFunctionError(error as { message: string; code?: string | null }, "get_email_for_phone") ||
          isMissingDbFunctionError(error as { message: string; code?: string | null }, "get_phone_for_email") ||
          isMissingDbFunctionError(error as { message: string; code?: string | null }, "get_phone_for_username") ||
          isMissingDbFunctionError(error as { message: string; code?: string | null }, "get_email_for_username"))
      ) {
        return NextResponse.json(
          { error: "Authentication is temporarily unavailable." },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: "Authentication is temporarily unavailable." },
        { status: 503 }
      );
    }

    const credential =
      parsed.data.authMode === "phone" && resolution.phone
        ? { phone: resolution.phone, password: parsed.data.password }
        : resolution.email
          ? { email: resolution.email, password: parsed.data.password }
          : resolution.phone
            ? { phone: resolution.phone, password: parsed.data.password }
            : null;

    if (!credential) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const { data, error } = await supabase.auth.signInWithPassword(credential);
    if (error || !data.session?.access_token || !data.session.refresh_token) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    return NextResponse.json(
      {
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  };
}

export const POST = createPasswordSignInHandler();
