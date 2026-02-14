import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isMissingDbTableError } from "@/lib/supabase/errors";

const feedbackSchema = z.object({
  category: z.enum(["bug", "idea", "ux", "other"]),
  message: z.string().trim().min(10).max(2000),
  email: z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim() === "") {
        return undefined;
      }
      return value;
    },
    z.string().trim().email().max(320).optional()
  ),
  page_path: z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim() === "") {
        return undefined;
      }
      return value;
    },
    z.string().trim().max(200).optional()
  ),
});

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rateLimit = applyRateLimit({
    request,
    routeKey: "feedback-submit",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: user?.id ?? null,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many feedback submissions in a short time. Please try again later.",
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    return NextResponse.json(
      {
        error:
          flattened.formErrors[0] ??
          flattened.fieldErrors.message?.[0] ??
          flattened.fieldErrors.category?.[0] ??
          flattened.fieldErrors.email?.[0] ??
          "Invalid feedback payload.",
      },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get("user-agent");
  const { data, error } = await supabase
    .from("launch_feedback")
    .insert({
      user_id: user?.id ?? null,
      email: parsed.data.email ?? null,
      category: parsed.data.category,
      message: parsed.data.message,
      page_path: parsed.data.page_path ?? null,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingDbTableError(error, "launch_feedback")) {
      return NextResponse.json(
        {
          error:
            "Feedback is temporarily unavailable. Please try again later. (FEEDBACK_UNAVAILABLE)",
          code: "FEEDBACK_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    console.error("Feedback submission failed.", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error:
          "Unable to submit feedback right now. Please try again. (FEEDBACK_SUBMIT_FAILED)",
        code: "FEEDBACK_SUBMIT_FAILED",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { received: true, feedback_id: data?.id ?? null },
    { status: 201, headers: rateLimitHeaders(rateLimit) }
  );
}
