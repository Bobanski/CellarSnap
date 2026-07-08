import { NextResponse } from "next/server";
import OpenAI from "openai";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { defaultLoadUserPreferenceEntries } from "@/app/api/algorithm/score/handler";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assembleWineProfile } from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import type {
  AssembleWineProfileInput,
  AxisContribution,
  EffectiveWineProfile,
  MatchScore,
  SensoryAxis,
} from "@/server/algorithm/types";
import { buildUserPreferenceVector } from "@/server/algorithm/userPreferences";
import {
  distilledSeedForWineType,
  readPalateProfile,
} from "@/server/algorithm/palateDistillation";
import {
  OpenAiImagePreparationError,
  prepareOpenAiImageDataUrl,
} from "@/server/images/openAiImage";
import {
  extractWineLabelFromDataUrl,
  WineLabelExtractionError,
  type WineLabelExtraction,
} from "@/server/labelAutofill/extractWineLabel";
import {
  RequestAuthError,
  requireRequestAuth,
} from "@/server/auth/requestAuth";
import type { WineType } from "@/types/wine";

// Mirrors label-autofill's limits — this route also calls OpenAI vision.
const MAX_PHOTO_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_PHOTO_PROCESSED_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

export type IdentifiedWine = {
  name: string | null;
  producer: string | null;
  vintage: string | null;
  region: string | null;
  country: string | null;
  grapes: string[];
  wine_type: WineType | null;
};

export type IdentifyBottleAxisHighlight = {
  axis: SensoryAxis;
  label: string;
  aligned: boolean;
};

export type IdentifyBottleMatch = {
  score: number;
  band: MatchScore["band"];
  confidence: number;
};

export type IdentifyBottleResponse = {
  wine: IdentifiedWine;
  match: IdentifyBottleMatch | null;
  axis_highlights: IdentifyBottleAxisHighlight[];
};

type IdentifyBottleHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createAdminClient: typeof createSupabaseAdminClient;
  extractWineLabel: typeof extractWineLabelFromDataUrl;
  loadUserPreferenceEntries: typeof defaultLoadUserPreferenceEntries;
  assembleProfile: (input: AssembleWineProfileInput) => Promise<EffectiveWineProfile>;
  buildUserPreferenceVector: typeof buildUserPreferenceVector;
  computeMatchScore: typeof computeMatchScore;
  readPalateProfile: typeof readPalateProfile;
  distilledSeedForWineType: typeof distilledSeedForWineType;
};

const defaultDependencies: IdentifyBottleHandlerDependencies = {
  requireRequestAuth,
  createAdminClient: createSupabaseAdminClient,
  extractWineLabel: extractWineLabelFromDataUrl,
  loadUserPreferenceEntries: defaultLoadUserPreferenceEntries,
  async assembleProfile(input) {
    const referenceSupabase = createSupabaseAdminClient();
    return assembleWineProfile(input, referenceSupabase);
  },
  buildUserPreferenceVector,
  computeMatchScore,
  readPalateProfile,
  distilledSeedForWineType,
};

// ── Axis highlight formatting ──────────────────────────────────────────
// Plain-language labels for the 16 sensory axes, used to tell the user
// (via the somm's chat reply) which parts of this wine line up with — or
// diverge from — what they usually enjoy.

const AXIS_DISPLAY_NAMES: Record<SensoryAxis, string> = {
  body: "body",
  acidity: "acidity",
  tannin: "tannin",
  alcohol_perception: "alcohol",
  fruit_ripeness: "fruit ripeness",
  oak_presence: "oak",
  earthy: "earthy character",
  mineral: "minerality",
  savory: "savory character",
  aromatic_intensity: "aromatic intensity",
  sweetness_perception: "sweetness",
  bitterness_phenolic_grip: "phenolic grip",
  finish_length: "finish length",
  concentration: "concentration",
  complexity: "complexity",
  freshness: "freshness",
};

// Axis values live on a ~1-5 sensory scale; these thresholds decide
// whether a wine's value on an axis counts as "matches" or "diverges from"
// the user's typical preference on that axis.
const AXIS_WEIGHT_FLOOR = 0.05;
const ALIGNED_DIFF_MAX = 0.6;
const MISALIGNED_DIFF_MIN = 1.1;
const MAX_AXIS_HIGHLIGHTS = 3;

function axisHighlightLabel(axis: SensoryAxis, aligned: boolean, diff: number): string {
  const name = AXIS_DISPLAY_NAMES[axis];
  if (aligned) {
    return `${name} matches what you usually enjoy`;
  }
  return diff > 0
    ? `${name} runs higher than you usually go for`
    : `${name} runs lower than you usually go for`;
}

function buildAxisHighlights(
  axisContributions: Record<SensoryAxis, AxisContribution>
): IdentifyBottleAxisHighlight[] {
  const candidates = (
    Object.entries(axisContributions) as Array<[SensoryAxis, AxisContribution]>
  )
    .filter(([, c]) => c.user_value !== null && c.weight > AXIS_WEIGHT_FLOOR)
    .map(([axis, c]) => {
      const diff = c.wine_value - (c.user_value as number);
      return {
        axis,
        weight: c.weight,
        diff,
        absDiff: Math.abs(diff),
        contribution: c.contribution,
      };
    });

  const misalignedPool = candidates
    .filter((c) => c.absDiff >= MISALIGNED_DIFF_MIN)
    .sort((a, b) => b.contribution - a.contribution);
  const alignedPool = candidates
    .filter((c) => c.absDiff <= ALIGNED_DIFF_MAX)
    .sort((a, b) => b.weight - a.weight);

  const highlights: IdentifyBottleAxisHighlight[] = [];
  const usedAxes = new Set<SensoryAxis>();

  for (const c of misalignedPool) {
    if (highlights.length >= MAX_AXIS_HIGHLIGHTS) break;
    highlights.push({ axis: c.axis, label: axisHighlightLabel(c.axis, false, c.diff), aligned: false });
    usedAxes.add(c.axis);
  }

  for (const c of alignedPool) {
    if (highlights.length >= MAX_AXIS_HIGHLIGHTS) break;
    if (usedAxes.has(c.axis)) continue;
    highlights.push({ axis: c.axis, label: axisHighlightLabel(c.axis, true, c.diff), aligned: true });
    usedAxes.add(c.axis);
  }

  return highlights;
}

function toIdentifiedWine(extraction: WineLabelExtraction): IdentifiedWine {
  return {
    name: extraction.wine_name,
    producer: extraction.producer,
    vintage: extraction.vintage,
    region: extraction.region,
    country: extraction.country,
    grapes: extraction.primary_grape_suggestions,
    wine_type: extraction.wine_type,
  };
}

export function createIdentifyBottleHandler(
  dependencies: Partial<IdentifyBottleHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  return async function POST(request: Request) {
    let auth;
    try {
      auth = await resolvedDependencies.requireRequestAuth(request);
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      throw error;
    }
    const { user } = auth;

    const rateLimit = await applyRateLimit({
      request,
      routeKey: "sommelier-identify-bottle",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      userId: user.id,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many bottle scans in a short time. Please wait a bit and try again.",
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Bottle photo is required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Photo must be an image" }, { status: 400 });
    }
    if (file.size > MAX_PHOTO_INPUT_BYTES) {
      return NextResponse.json(
        { error: "Photo is too large (max 24 MB)" },
        { status: 413 }
      );
    }

    let dataUrl: string;
    try {
      const prepared = await prepareOpenAiImageDataUrl(file, {
        maxInputBytes: MAX_PHOTO_INPUT_BYTES,
        maxOutputBytes: MAX_PHOTO_PROCESSED_BYTES,
        maxDimension: 1600,
        jpegQuality: 80,
      });
      dataUrl = prepared.dataUrl;
    } catch (error) {
      if (
        error instanceof OpenAiImagePreparationError &&
        error.code === "output_too_large"
      ) {
        return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
      }
      throw error;
    }

    let extraction: WineLabelExtraction;
    try {
      extraction = await resolvedDependencies.extractWineLabel(dataUrl, {
        apiKey,
        userId: user.id,
      });
    } catch (error) {
      if (error instanceof WineLabelExtractionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof OpenAI.APIError) {
        return NextResponse.json(
          { error: error.message || "OpenAI request failed" },
          { status: error.status ?? 502, headers: rateLimitHeaders(rateLimit) }
        );
      }
      return NextResponse.json({ error: "Bottle identification failed" }, { status: 500 });
    }

    const wine = toIdentifiedWine(extraction);

    let match: IdentifyBottleMatch | null = null;
    let axisHighlights: IdentifyBottleAxisHighlight[] = [];

    // Scoring is best-effort: an unreadable label (no wine_type) or any
    // scoring failure still returns the identified wine with match: null
    // rather than failing the whole request.
    if (extraction.wine_type) {
      try {
        const assembleInput: AssembleWineProfileInput = {
          wine_type: extraction.wine_type,
          canonical_region: extraction.region,
          canonical_sub_region: extraction.appellation,
          canonical_country: extraction.country,
          primary_grapes:
            extraction.primary_grape_suggestions.length > 0
              ? extraction.primary_grape_suggestions.join(", ")
              : null,
          vintage: extraction.vintage
            ? Number.parseInt(extraction.vintage, 10) || null
            : null,
          producer: extraction.producer,
          classification: extraction.classification,
          quality_tier: extraction.classification,
        };

        const effectiveProfile = await resolvedDependencies.assembleProfile(assembleInput);

        const [preferenceEntries, palateRecord] = await Promise.all([
          resolvedDependencies.loadUserPreferenceEntries(auth.supabase, auth.user.id),
          resolvedDependencies.readPalateProfile(auth.supabase, auth.user.id).catch(() => null),
        ]);

        const userPreference = resolvedDependencies.buildUserPreferenceVector(
          preferenceEntries,
          extraction.wine_type,
          palateRecord
            ? resolvedDependencies.distilledSeedForWineType(palateRecord, extraction.wine_type)
            : null
        );

        const matchScore = resolvedDependencies.computeMatchScore(
          effectiveProfile,
          userPreference
        );

        match = {
          score: Math.round(matchScore.score),
          band: matchScore.band,
          confidence: matchScore.confidence,
        };
        axisHighlights = buildAxisHighlights(matchScore.axis_contributions);
      } catch (scoringError) {
        console.warn(
          "[identify-bottle] Palate match scoring failed; returning identification without a match.",
          scoringError
        );
        match = null;
        axisHighlights = [];
      }
    }

    const responsePayload: IdentifyBottleResponse = {
      wine,
      match,
      axis_highlights: axisHighlights,
    };

    return NextResponse.json(responsePayload, { headers: rateLimitHeaders(rateLimit) });
  };
}
