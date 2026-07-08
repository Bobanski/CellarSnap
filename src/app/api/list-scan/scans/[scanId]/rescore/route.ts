import { NextResponse } from "next/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import {
  getSavedListScanResult,
  updateListScanResultScores,
} from "@/server/listScan/persistence";
import { rescoreListScanResult } from "@/server/listScan/parse";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

/**
 * Re-scores an already-parsed, already-saved scan against the caller's
 * current preferences — no OCR/LLM re-parse. Used right after a user
 * completes the mini-palate quick-survey on the results screen (Wave 3,
 * item 4) so matches personalize immediately without leaving the page.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ scanId: string }> }
) {
  let auth: Awaited<ReturnType<typeof requireRequestAuth>>;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const rateLimit = await applyRateLimit({
    request,
    routeKey: "list-scan-rescore",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: auth.user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many re-score requests. Please wait a bit and try again." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const { scanId } = await context.params;

  try {
    const saved = await getSavedListScanResult(auth.supabase, auth.user.id, scanId);
    if (!saved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rescored = await rescoreListScanResult(saved, auth.user.id, auth.supabase);
    await updateListScanResultScores(auth.supabase, auth.user.id, rescored);

    return NextResponse.json(rescored);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to re-score this scan right now.",
      },
      { status: 500 }
    );
  }
}
