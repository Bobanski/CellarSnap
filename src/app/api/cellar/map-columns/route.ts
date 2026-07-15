import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const MAX_SAMPLE_ROWS = 5;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const requestSchema = z.object({
  headers: z.array(z.string()).min(1).max(100),
  sample_rows: z
    .array(z.array(z.string()))
    .min(1)
    .max(MAX_SAMPLE_ROWS),
});

const TARGET_FIELDS = [
  "wine_name",
  "producer",
  "vintage",
  "country",
  "region",
  "appellation",
  "wine_type",
  "cellar_quantity",
  "bottle_format",
  "varietal",
  "classification",
  "price_paid",
  "notes",
] as const;

type TargetField = (typeof TARGET_FIELDS)[number];

type MappingValue =
  | { target: TargetField }
  | { target: "custom"; field_type: "text" | "number" | "date" };

function buildPrompt(headers: string[], sampleRows: string[][]): string {
  const rowLines = sampleRows
    .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
    .join("\n");

  return `You are mapping CSV column headers to a wine cellar database schema.

Available target fields:
- wine_name (string): The name of the wine
- producer (string): The wine producer/winery
- vintage (string): The vintage year
- country (string): Country of origin
- region (string): Wine region
- appellation (string): Specific appellation
- wine_type (string): red, white, rose, sparkling, orange, sweet
- cellar_quantity (number): Number of bottles
- bottle_format (string): 375ml, 750ml, 1.5L, 3L, 5L, 6L, other
- varietal (string): Grape variety
- classification (string): Quality classification (e.g., Grand Cru)
- price_paid (number): Price paid per bottle
- notes (string): Tasting or personal notes

Here are the CSV headers and sample data:
Headers: ${JSON.stringify(headers)}
${rowLines}

Return a JSON object mapping each CSV header to either a target field name or "custom" if it doesn't match any target field. Also include a suggested field_type for custom fields ("text", "number", or "date").

Format:
{
  "mappings": {
    "Wine Name": { "target": "wine_name" },
    "Producer": { "target": "producer" },
    "Qty": { "target": "cellar_quantity" },
    "Parker Score": { "target": "custom", "field_type": "number" },
    "Year": { "target": "vintage" }
  }
}

Return ONLY the JSON object, no other text.`;
}

const targetFieldSet = new Set<string>(TARGET_FIELDS);

function validateMappings(
  raw: Record<string, unknown>
): Record<string, MappingValue> | null {
  if (typeof raw !== "object" || raw === null) return null;

  const result: Record<string, MappingValue> = {};

  for (const [header, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;

    if (typeof v.target !== "string") return null;

    if (targetFieldSet.has(v.target)) {
      result[header] = { target: v.target as TargetField };
    } else if (v.target === "custom") {
      const fieldType = v.field_type;
      if (fieldType !== "text" && fieldType !== "number" && fieldType !== "date") {
        result[header] = { target: "custom", field_type: "text" };
      } else {
        result[header] = { target: "custom", field_type: fieldType };
      }
    } else {
      // Unknown target — treat as custom
      result[header] = { target: "custom", field_type: "text" };
    }
  }

  return result;
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

  const rateLimit = await applyRateLimit({
    request,
    routeKey: "cellar-map-columns",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: auth.user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many column-mapping requests. Please wait a bit and try again." },
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { headers, sample_rows } = parsed.data;

  const prompt = buildPrompt(headers, sample_rows);

  let responseText: string;
  try {
    const openai = new OpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 1000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    responseText = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Parse JSON from the response — handle code fences, nested objects, etc.
  let rawMappings: Record<string, unknown> | undefined;
  try {
    // Strip markdown code fences if present
    let cleaned = responseText.trim();
    // Remove ```json ... ``` wrapping (could appear anywhere, not just start/end)
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    } else {
      // Also try stripping leading/trailing fences
      cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
    }

    const parsed = JSON.parse(cleaned);

    // GPT might return { mappings: {...} } or just {...} directly
    if (parsed && typeof parsed === "object") {
      if (parsed.mappings && typeof parsed.mappings === "object") {
        rawMappings = parsed.mappings;
      } else if (!Array.isArray(parsed)) {
        // Assume the object itself is the mappings
        rawMappings = parsed;
      }
    }
  } catch {
    // If JSON parse fails entirely, try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        rawMappings = extracted.mappings ?? extracted;
      } catch {
        // Give up
      }
    }
  }

  if (!rawMappings || typeof rawMappings !== "object") {
    // Last resort: build a naive mapping based on header name matching
    const naiveMappings: Record<string, MappingValue> = {};
    const headerMatches: Record<string, TargetField> = {
      wine: "wine_name", name: "wine_name", "wine name": "wine_name",
      producer: "producer", winery: "producer", maker: "producer",
      vintage: "vintage", year: "vintage",
      country: "country", region: "region", appellation: "appellation",
      type: "wine_type", color: "wine_type", "wine type": "wine_type",
      quantity: "cellar_quantity", qty: "cellar_quantity", bottles: "cellar_quantity", count: "cellar_quantity",
      format: "bottle_format", size: "bottle_format",
      grape: "varietal", varietal: "varietal", variety: "varietal",
      classification: "classification", class: "classification",
      price: "price_paid", cost: "price_paid",
      notes: "notes", note: "notes", comments: "notes",
    };

    for (const header of headers) {
      const lower = header.toLowerCase().trim();
      const match = headerMatches[lower];
      if (match) {
        naiveMappings[header] = { target: match };
      } else {
        naiveMappings[header] = { target: "custom", field_type: "text" };
      }
    }

    return NextResponse.json({
      mappings: naiveMappings,
      unmapped_count: Object.values(naiveMappings).filter((m) => m.target === "custom").length,
      fallback: true,
    });
  }

  const mappings = validateMappings(rawMappings);
  if (!mappings) {
    return NextResponse.json(
      { error: "Invalid mapping structure from GPT", raw: responseText },
      { status: 502 }
    );
  }

  const unmappedCount = Object.values(mappings).filter(
    (m) => m.target === "custom"
  ).length;

  return NextResponse.json({ mappings, unmapped_count: unmappedCount });
}
