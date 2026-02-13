import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { normalizePhone } from "@/lib/validation/phone";

const schema = z.object({
  identifier: z.string().trim().min(1),
  mode: z.enum(["auto", "username", "phone", "email"]).optional(),
});

const emailSchema = z.string().email();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
  const parsedEmail = emailSchema.safeParse(identifier.toLowerCase());
  const normalizedPhone = normalizePhone(identifier);

  const resolveByPhone = mode === "phone" || (mode === "auto" && !!normalizedPhone);
  const resolveByEmail =
    mode === "email" || (mode === "auto" && parsedEmail.success && !normalizedPhone);

  if (resolveByPhone) {
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Phone number required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("get_email_for_phone", {
      phone: normalizedPhone,
    });

    if (error) {
      if (error.message.includes("get_email_for_phone")) {
        return NextResponse.json(
          {
            error:
              "Phone login is not available yet. Run supabase/sql/023_phone_login.sql and supabase/sql/024_auth_identifier_helpers.sql and try again.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { phone: normalizedPhone, email: asNullableString(data) },
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  if (resolveByEmail) {
    const normalizedEmail = parsedEmail.success ? parsedEmail.data : null;
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email required." }, { status: 400 });
    }

    const { data: phoneData, error: phoneError } = await supabase.rpc(
      "get_phone_for_email",
      {
        email: normalizedEmail,
      }
    );

    if (phoneError) {
      if (phoneError.message.includes("get_phone_for_email")) {
        return NextResponse.json(
          {
            error:
              "Identifier resolution is not available yet. Run supabase/sql/024_auth_identifier_helpers.sql and try again.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: phoneError.message }, { status: 500 });
    }

    return NextResponse.json(
      { email: normalizedEmail, phone: asNullableString(phoneData) },
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  const { data: phoneData, error: phoneError } = await supabase.rpc(
    "get_phone_for_username",
    {
      username: identifier,
    }
  );

  if (phoneError) {
    if (phoneError.message.includes("get_phone_for_username")) {
      return NextResponse.json(
        {
          error:
            "Identifier resolution is not available yet. Run supabase/sql/024_auth_identifier_helpers.sql and try again.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: phoneError.message }, { status: 500 });
  }

  const { data: emailData, error: emailError } = await supabase.rpc(
    "get_email_for_username",
    {
      username: identifier,
    }
  );

  if (emailError) {
    if (emailError.message.includes("get_email_for_username")) {
      return NextResponse.json(
        {
          error:
            "Username login is not available yet. Run supabase/sql/008_username_login.sql and try again.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: emailError.message }, { status: 500 });
  }

  const resolvedPhone = asNullableString(phoneData);
  const resolvedEmail = asNullableString(emailData);

  if (!resolvedPhone && !resolvedEmail) {
    return NextResponse.json(
      { error: "No account matches that email, phone number, or username." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { email: resolvedEmail, phone: resolvedPhone },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
