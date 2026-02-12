import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { normalizePhone } from "@/lib/validation/phone";

const schema = z.object({
  phone: z.string().trim().min(1),
});

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;

export async function POST(request: Request) {
  const rateLimit = applyRateLimit({
    request,
    routeKey: "phone-check",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many phone checks. Please wait a bit and try again." },
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
    return NextResponse.json({ error: "Phone number required." }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Phone number is invalid." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("is_phone_available", {
    phone: normalizedPhone,
  });

  if (error) {
    if (error.message.includes("is_phone_available")) {
      return NextResponse.json(
        {
          error:
            "Phone checks are not available yet. Run supabase/sql/023_phone_login.sql and try again.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { available: Boolean(data), normalized_phone: normalizedPhone },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
