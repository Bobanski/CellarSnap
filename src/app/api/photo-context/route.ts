import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const responseSchema = z.object({
  tag: z.enum(["place", "pairing", "people", "other_bottles", "unknown"]),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const TIMEOUT_MS = 12000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Invalid JSON response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function getAuthenticatedUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const bearerToken = bearerMatch?.[1]?.trim();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (bearerToken && supabaseUrl && supabaseAnonKey) {
    const bearerClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    });
    const {
      data: { user },
    } = await bearerClient.auth.getUser();
    if (user) {
      return user;
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = applyRateLimit({
    request,
    routeKey: "photo-context",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many photo context checks in a short time. Please wait a bit and try again.",
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Photo is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 8 MB)" },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const openai = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        max_output_tokens: 200,
        text: {
          format: {
            type: "json_schema",
            name: "photo_context",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                tag: {
                  type: "string",
                  enum: [
                    "place",
                    "pairing",
                    "people",
                    "other_bottles",
                    "unknown",
                  ],
                },
                confidence: { type: ["number", "null"] },
              },
              required: ["tag", "confidence"],
            },
          },
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Classify this wine-entry photo into one tag.\n" +
                  "Tag priority: people > pairing > place > other_bottles.\n" +
                  "people = one or more people are a clear subject, even if bottles are visible.\n" +
                  "pairing = food/drink pairing is a clear subject, even if bottles are visible.\n" +
                  "place = venue/location/environment is the clear subject (table, room, bar, scenery).\n" +
                  "other_bottles = bottle(s), shelves, cellar, or bottle-focused context with no clear people/pairing/place focus.\n" +
                  "unknown = ambiguous/uncertain.\n" +
                  "Return exactly one tag and confidence 0-1.",
              },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
        safety_identifier: user.id,
      },
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";
    if (!outputText.trim()) {
      return NextResponse.json(
        { error: "No context returned from image analysis" },
        { status: 422 }
      );
    }

    const parsed = responseSchema.safeParse(extractJson(outputText));
    if (!parsed.success) {
      return NextResponse.json({ error: "Unable to parse context tag" }, { status: 422 });
    }

    return NextResponse.json(
      {
        tag: parsed.data.tag,
        confidence:
          typeof parsed.data.confidence === "number" &&
          Number.isFinite(parsed.data.confidence)
            ? Math.min(1, Math.max(0, parsed.data.confidence))
            : null,
      },
      {
        headers: rateLimitHeaders(rateLimit),
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: error.message || "OpenAI request failed" },
        { status: error.status ?? 500 }
      );
    }
    return NextResponse.json({ error: "Photo context tagging failed" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
