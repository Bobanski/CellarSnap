import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const schema = z.object({
  identifier: z.string().trim().min(1),
  mode: z.enum(["auto", "username"]).optional(),
});

const emailSchema = z.string().email();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

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

  const identifier = parsed.data.identifier;
  const mode = parsed.data.mode ?? "auto";

  if (mode === "auto") {
    const parsedEmail = emailSchema.safeParse(identifier);
    if (parsedEmail.success) {
      return NextResponse.json(
        { email: parsedEmail.data },
        { headers: rateLimitHeaders(rateLimit) }
      );
    }
  }

  const { data, error } = await supabase.rpc("get_email_for_username", {
    username: identifier,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "No account matches that email or username." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { email: data },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
