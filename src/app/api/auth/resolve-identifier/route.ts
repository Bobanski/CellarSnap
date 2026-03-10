import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isMissingDbFunctionError } from "@/lib/supabase/errors";
import { resolveIdentifierForAuth } from "@/server/auth/identifierResolution";

const schema = z.object({
  identifier: z.string().trim().min(1),
  mode: z.enum(["auto", "username", "phone", "email"]).optional(),
});

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

function isFunctionLookupError(error: unknown, functionName: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    isMissingDbFunctionError(
      error as { message: string; code?: string | null },
      functionName
    )
  );
}

export async function POST(request: Request) {
  const rateLimit = applyRateLimit({
    request,
    routeKey: "resolve-identifier",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many sign-in identifier checks. Please wait a bit and try again.",
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const supabase = await createSupabaseServerClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifier required." }, { status: 400 });
  }

  const identifier = parsed.data.identifier.trim();
  const mode = parsed.data.mode ?? "auto";
  let resolution;

  try {
    resolution = await resolveIdentifierForAuth({
      client: supabase,
      identifier,
      mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Identifier resolution failed.";

    if (
      isFunctionLookupError(error, "get_email_for_phone") ||
      isFunctionLookupError(error, "get_phone_for_email") ||
      isFunctionLookupError(error, "get_phone_for_username")
    ) {
      return NextResponse.json(
        {
          error:
            "Identifier resolution is temporarily unavailable. Please try again later. (IDENTIFIER_RESOLUTION_UNAVAILABLE)",
          code: "IDENTIFIER_RESOLUTION_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    if (isFunctionLookupError(error, "get_email_for_username")) {
      return NextResponse.json(
        {
          error:
            "Username login is temporarily unavailable. Please try again later. (USERNAME_LOGIN_UNAVAILABLE)",
          code: "USERNAME_LOGIN_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!resolution.phone && !resolution.email) {
    return NextResponse.json(
      { error: "No account matches that email, phone number, or username." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { email: resolution.email, phone: resolution.phone },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
