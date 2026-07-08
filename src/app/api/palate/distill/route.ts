import { NextResponse } from "next/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAnthropicConfigured } from "@/server/anthropic/client";
import { ensurePalateProfile, readPalateProfile } from "@/server/algorithm/palateDistillation";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 6;

/**
 * GET  /api/palate/distill — the current cached distilled palate profile.
 * POST /api/palate/distill — refresh it (no-op when the signal is unchanged;
 *                            body {"force": true} to redistill regardless).
 *
 * Distillation is the expensive "master somm reads your history" step; the
 * scoring paths never call it inline — they only read the cache this route
 * (and future background refreshes) maintains.
 */

export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const record = await readPalateProfile(auth.supabase, auth.user.id);
  if (!record) {
    return NextResponse.json({ profile: null }, { status: 200 });
  }
  return NextResponse.json({
    profile: record.profile,
    model: record.model,
    updated_at: record.updated_at,
  });
}

export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "Palate distillation is not configured on this deployment." },
      { status: 503 }
    );
  }

  const rateLimit = await applyRateLimit({
    request,
    routeKey: "palate-distill",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: auth.user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Palate profile was refreshed recently. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = body?.force === true;
  } catch {
    // empty body is fine
  }

  try {
    const { record, refreshed } = await ensurePalateProfile(
      createSupabaseAdminClient(),
      auth.user.id,
      { force }
    );
    return NextResponse.json({
      profile: record.profile,
      model: record.model,
      updated_at: record.updated_at,
      refreshed,
    });
  } catch (error) {
    console.error("palate distillation failed", error);
    return NextResponse.json(
      { error: "Could not distill your palate profile right now." },
      { status: 502 }
    );
  }
}
