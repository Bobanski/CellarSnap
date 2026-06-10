import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isMissingDbFunctionError } from "@/lib/supabase/errors";
import { normalizePhone } from "@/lib/validation/phone";
import { resolveIdentifierForAuth } from "@/server/auth/identifierResolution";

const requestSchema = z.object({
  identifier: z.string().trim().min(1),
  redirectTo: z.string().url().optional(),
});

const emailSchema = z.string().email();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;

type SupabaseRecoveryClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  auth: {
    signInWithOtp: (params: {
      phone: string;
      options: { shouldCreateUser: false };
    }) => Promise<{ error: { message?: string } | null }>;
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo?: string }
    ) => Promise<{ error: { message?: string } | null }>;
  };
};

type RecoveryStartHandlerDependencies = {
  createAuthClient: () => SupabaseRecoveryClient;
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
  }) as unknown as SupabaseRecoveryClient;
}

const defaultDependencies: RecoveryStartHandlerDependencies = {
  createAuthClient: createDefaultAuthClient,
};

export function createRecoveryStartHandler(
  dependencies: Partial<RecoveryStartHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  return async function POST(request: Request) {
    const rateLimit = await applyRateLimit({
      request,
      routeKey: "recovery-start",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many recovery attempts. Please wait a bit and try again." },
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
      return NextResponse.json({ error: "Identifier required." }, { status: 400 });
    }

    let supabase: SupabaseRecoveryClient;
    try {
      supabase = resolvedDependencies.createAuthClient();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Recovery is temporarily unavailable.";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    const identifier = parsed.data.identifier.trim();
    const normalizedPhone = normalizePhone(identifier);

    if (normalizedPhone) {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { shouldCreateUser: false },
      });
      if (error) {
        return NextResponse.json({ error: "Unable to start recovery." }, { status: 400 });
      }

      return NextResponse.json(
        { channel: "phone" as const, phone: normalizedPhone },
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    const normalizedEmail = emailSchema.safeParse(identifier.toLowerCase());
    let recoveryEmail = normalizedEmail.success ? normalizedEmail.data : null;
    if (!recoveryEmail) {
      try {
        recoveryEmail = (
          await resolveIdentifierForAuth({
            client: supabase,
            identifier,
            mode: "username",
          })
        ).email;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string" &&
          isMissingDbFunctionError(
            error as { message: string; code?: string | null },
            "get_email_for_username"
          )
        ) {
          return NextResponse.json(
            { error: "Recovery is temporarily unavailable." },
            { status: 503 }
          );
        }

        return NextResponse.json(
          { error: "Recovery is temporarily unavailable." },
          { status: 503 }
        );
      }
    }

    if (!recoveryEmail) {
      return NextResponse.json({ error: "No account matches that identifier." }, { status: 404 });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
      redirectTo: parsed.data.redirectTo,
    });
    if (error) {
      return NextResponse.json({ error: "Unable to start recovery." }, { status: 400 });
    }

    return NextResponse.json(
      { channel: "email" as const },
      { headers: rateLimitHeaders(rateLimit) }
    );
  };
}
