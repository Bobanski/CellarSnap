import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  extractListScanFollowupCopy,
  getListScanDisplayLines,
  getListScanStructuredMeta,
  listScanParsedWineSchema,
  resolveListScanWineType,
} from "@shared";
import {
  assembleWineProfileWithDataSource,
  batchPrefetchProfileData,
  createPreFetchedProfileDataSource,
  createSupabaseProfileAssemblyDataSource,
} from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import type { AssembleWineProfileInput } from "@/server/algorithm/types";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { anthropicToolCall, isAnthropicConfigured } from "@/server/anthropic/client";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import {
  distilledSeedForWineType,
  readPalateProfile,
  type PalateProfileRecord,
} from "@/server/algorithm/palateDistillation";
import { defaultLoadUserPreferenceEntries } from "../../algorithm/score/handler";

const NOTE_MODEL = "gpt-5.4-mini";
const CLAUDE_NOTE_MODEL = process.env.SOMM_NOTES_MODEL ?? "claude-haiku-4-5-20251001";
const NOTE_TIMEOUT_MS = 3000;

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const noteRequestSchema = z.object({
  items: z.array(listScanParsedWineSchema).min(1).max(3),
});

type NoteItem = z.infer<typeof listScanParsedWineSchema>;

type NoteSignalSummary = {
  id: string;
  title: string;
  match_percent: number;
  wine_type: string;
  type_label: string | null;
  primary_varietal: string | null;
  display_region: string | null;
  sensory_signals: string[];
  categorical_signals: string[];
  draft_note: string | null;
};

function normalizeSignalText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreAffinityText(
  candidate: string | null | undefined,
  affinities: Record<string, number>
) {
  const normalizedCandidate = normalizeSignalText(candidate);
  if (!normalizedCandidate) {
    return 0;
  }

  let best = affinities[normalizedCandidate] ?? 0;
  if (best > 0) {
    return best;
  }

  const candidateTokens = new Set(normalizedCandidate.split(" "));

  for (const [key, affinity] of Object.entries(affinities)) {
    if (!key) {
      continue;
    }

    if (key.includes(normalizedCandidate) || normalizedCandidate.includes(key)) {
      best = Math.max(best, affinity * 0.85);
      continue;
    }

    const keyTokens = key.split(" ");
    const overlap = keyTokens.filter((token) => candidateTokens.has(token)).length;
    if (overlap > 0) {
      const overlapRatio = overlap / Math.max(keyTokens.length, candidateTokens.size);
      best = Math.max(best, affinity * (0.6 + overlapRatio * 0.2));
    }
  }

  return best;
}

function findBestAffinityCandidate(
  candidates: Array<string | null | undefined>,
  affinities: Record<string, number>
) {
  let bestCandidate: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreAffinityText(candidate, affinities);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate?.trim() ?? null;
    }
  }

  return bestCandidate;
}

function describeSensorySignal(params: {
  axis: string;
  userValue: number;
  wineValue: number;
  wineType: NoteSignalSummary["wine_type"];
}) {
  const { axis, userValue, wineValue, wineType } = params;
  const higher = wineValue > userValue;
  const lower = wineValue < userValue;

  switch (axis) {
    case "body":
      return higher ? "richer body" : lower ? "lighter body" : "balanced body";
    case "acidity":
      return higher ? "brighter acidity" : lower ? "softer acidity" : "balanced acidity";
    case "tannin":
      if (wineType !== "red") {
        return null;
      }
      return higher ? "firmer tannins" : lower ? "softer tannins" : "balanced tannins";
    case "alcohol_perception":
      return higher ? "more warmth" : lower ? "more restrained alcohol" : "balanced alcohol";
    case "fruit_ripeness":
      return higher ? "riper fruit" : lower ? "fresher fruit" : "balanced fruit ripeness";
    case "oak_presence":
      return higher ? "more oak" : lower ? "more restrained oak" : "balanced oak";
    case "earthy":
      return higher ? "more earthy character" : lower ? "less earthy character" : "balanced earthiness";
    case "mineral":
      return higher ? "more mineral drive" : lower ? "softer minerality" : "balanced minerality";
    case "savory":
      return higher ? "more savory edge" : lower ? "softer savory character" : "balanced savoriness";
    case "aromatic_intensity":
      return higher ? "more lifted aromatics" : lower ? "more restrained aromatics" : "balanced aromatics";
    case "sweetness_perception":
      return higher ? "slightly sweeter finish" : "drier finish";
    case "bitterness_phenolic_grip":
      return higher ? "more grip" : lower ? "softer grip" : "balanced grip";
    case "finish_length":
      return higher ? "longer finish" : lower ? "briefer finish" : "steady finish";
    case "concentration":
      return higher ? "more concentration" : lower ? "lighter concentration" : "balanced concentration";
    case "complexity":
      return higher ? "more layered complexity" : lower ? "cleaner complexity" : "balanced complexity";
    case "freshness":
      return higher ? "brighter freshness" : lower ? "softer freshness" : "balanced freshness";
    default:
      return axis.replace(/_/g, " ");
  }
}

function truncateNote(value: string, maxChars = 140) {
  if (value.length <= maxChars) {
    return value.trim();
  }

  return value.slice(0, maxChars).trimEnd().replace(/[.,;:!?-]+$/, "");
}

function capitalizeNote(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function sanitizeNote(value: string | null | undefined) {
  const normalized = (value ?? "")
    .replace(/^\s*[-•*]+\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const visible = extractListScanFollowupCopy(normalized, {
    preferFollowup: true,
  });
  return visible ? capitalizeNote(truncateNote(visible)) : null;
}

function buildDraftNote(signal: NoteSignalSummary) {
  const cues = [signal.sensory_signals[0], signal.sensory_signals[1], signal.categorical_signals[0]]
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);

  if (cues.length > 0) {
    if (cues.length === 1) {
      return capitalizeNote(truncateNote(`${cues[0]} fits your preferences.`));
    }
    if (cues.length === 2) {
      return capitalizeNote(truncateNote(`${cues[0]} and ${cues[1]} fit your preferences.`));
    }
    return capitalizeNote(
      truncateNote(`${cues[0]}, ${cues[1]}, and ${cues[2]} fit your preferences.`)
    );
  }

  return null;
}

function buildFallbackNote(signal: NoteSignalSummary) {
  return buildDraftNote(signal);
}

function buildSignalSummary(params: {
  item: NoteItem;
  score: ReturnType<typeof computeMatchScore>;
  userPreference: ReturnType<typeof buildUserPreferenceVector>;
}): NoteSignalSummary {
  const display = getListScanDisplayLines(params.item);
  const structured = getListScanStructuredMeta(params.item);
  const resolvedWineType = resolveListScanWineType(params.item);

  const sensorySignals: string[] = [];
  Object.entries(params.score.axis_contributions)
    .filter(([, contribution]) => contribution.user_value !== null)
    .sort((left, right) => left[1].contribution - right[1].contribution)
    .forEach(([axis, contribution]) => {
      if (sensorySignals.length >= 2) {
        return;
      }

      const phrase = describeSensorySignal({
        axis,
        userValue: contribution.user_value ?? contribution.wine_value,
        wineValue: contribution.wine_value,
        wineType: params.item.wine_type,
      });
      if (phrase) {
        sensorySignals.push(phrase);
      }
    });

  const categoricalSignals = Array.from(
    new Set(
      [
        findBestAffinityCandidate(params.item.varietals, params.userPreference.categorical.varietals),
        findBestAffinityCandidate(
          [
            params.item.regions[params.item.regions.length - 1],
            params.item.regions[0],
            params.item.canonical_country,
          ],
          params.userPreference.categorical.regions
        ),
        findBestAffinityCandidate(
          [params.item.canonical_country],
          params.userPreference.categorical.countries
        ),
      ].filter((value): value is string => Boolean(value))
    )
  ).slice(0, 2);

  return {
    id: params.item.id,
    title: display.title,
    match_percent: params.item.match_percent,
    wine_type: resolvedWineType,
    type_label: structured.typeLabel,
    primary_varietal: structured.primaryVarietal,
    display_region: structured.displayRegion,
    sensory_signals: sensorySignals,
    categorical_signals: categoricalSignals,
    draft_note: buildDraftNote({
      id: params.item.id,
      title: display.title,
      match_percent: params.item.match_percent,
      wine_type: resolvedWineType,
      type_label: structured.typeLabel,
      primary_varietal: structured.primaryVarietal,
      display_region: structured.displayRegion,
      sensory_signals: sensorySignals,
      categorical_signals: categoricalSignals,
      draft_note: "",
    }),
  };
}

function createOpenAiClient(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey });
}

function buildPrompt(signals: NoteSignalSummary[]) {
  return [
    "Write one short bullet point for each wine recommendation card.",
    "Use the supplied draft note as the baseline and keep the concrete reasons.",
    "Prefer specific phrasing like lighter body, brighter acidity, drier finish, more restrained oak, or named places and varietals.",
    "Start each note with a capital letter.",
    "Do not open with a generic lead-in or echo the draft note verbatim when a more specific reason is available.",
    "Never mention tannins for non-red wines.",
    "If a wine reads dry, say dryness or drier finish instead of sweetness.",
    "Do not mention the score percentage, the word 'match', or backend details.",
    "Keep each note to a plain, conversational fragment of 16 words or fewer.",
    "Avoid repeating the wine title or sounding generic.",
    "Return JSON only.",
    "",
    JSON.stringify(
      {
        items: signals,
      },
      null,
      2
    ),
  ].join("\n");
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

  // Beta gate removed (PR #62 follow-up).
  void createPrivateBetaFeatureDeniedResponse;
  void userHasPrivateBetaFeatureAccess;

  const rateLimit = await applyRateLimit({
    request,
    routeKey: "list-scan-recommendation-notes",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: auth.user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many recommendation-note requests. Please wait a bit and try again." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = noteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide up to three top recommendation items." },
      { status: 400 }
    );
  }

  const eligibleItems = parsed.data.items.filter((item) => item.match_percent > 59);
  if (eligibleItems.length === 0) {
    return NextResponse.json({ notes: [] });
  }

  let preferenceEntries: PreferenceSourceEntry[];
  let palateRecord: PalateProfileRecord | null = null;
  try {
    [preferenceEntries, palateRecord] = await Promise.all([
      defaultLoadUserPreferenceEntries(auth.supabase, auth.user.id),
      readPalateProfile(auth.supabase, auth.user.id).catch(() => null),
    ]);
  } catch {
    return NextResponse.json({ notes: [] });
  }

  // A distilled palate profile stands in for logged history (same unlock as
  // the list-scan scoring path).
  const qualifyingEntryCount = preferenceEntries.filter((entry) => entry.advanced_notes).length;
  if (qualifyingEntryCount < 5 && !palateRecord) {
    return NextResponse.json({ notes: [] });
  }

  // Resolve wine_type per item first (up to 3 items) so we can prefetch the
  // reference tables for every distinct wine_type/vintage combination once,
  // instead of assembleWineProfile() issuing its own ~8 Supabase reads per item.
  const eligibleWithProfileInput = eligibleItems
    .map((item) => {
      const resolvedWineType = resolveListScanWineType(item);
      if (resolvedWineType === "unknown") {
        return null;
      }
      const algorithmWineType: AssembleWineProfileInput["wine_type"] =
        resolvedWineType === "dessert_fortified" ? "sweet" : resolvedWineType;

      const profileInput: AssembleWineProfileInput = {
        wine_type: algorithmWineType,
        canonical_region: item.regions[0] ?? null,
        canonical_sub_region:
          item.regions.length > 1 ? item.regions[item.regions.length - 1] : null,
        canonical_country: item.canonical_country ?? null,
        primary_grapes: item.varietals.length > 0 ? item.varietals.join(", ") : null,
        vintage: item.vintage ? Number.parseInt(item.vintage, 10) || null : null,
        producer: item.producer,
        classification: null,
        quality_tier: null,
      };

      return { item, algorithmWineType, profileInput };
    })
    .filter(
      (entry): entry is { item: NoteItem; algorithmWineType: AssembleWineProfileInput["wine_type"]; profileInput: AssembleWineProfileInput } =>
        entry !== null
    );

  if (eligibleWithProfileInput.length === 0) {
    return NextResponse.json({ notes: [] });
  }

  const referenceSupabase = createSupabaseAdminClient();
  const prefetchedData = await batchPrefetchProfileData(
    createSupabaseProfileAssemblyDataSource(referenceSupabase),
    Array.from(new Set(eligibleWithProfileInput.map((entry) => entry.algorithmWineType))),
    Array.from(
      new Set(
        eligibleWithProfileInput
          .map((entry) => entry.profileInput.vintage)
          .filter((vintage): vintage is number => typeof vintage === "number")
      )
    )
  );
  const prefetchedDataSource = createPreFetchedProfileDataSource(prefetchedData);

  const signalSummaries = (
    await Promise.all(
      eligibleWithProfileInput.map(async ({ item, algorithmWineType, profileInput }) => {
        const profile = await assembleWineProfileWithDataSource(profileInput, prefetchedDataSource);

        const preferenceVector = buildUserPreferenceVector(
          preferenceEntries,
          algorithmWineType,
          palateRecord ? distilledSeedForWineType(palateRecord, algorithmWineType) : null
        );
        const score = computeMatchScore(profile, preferenceVector);
        return buildSignalSummary({
          item,
          score,
          userPreference: preferenceVector,
        });
      })
    )
  ).filter((signal): signal is NoteSignalSummary => signal !== null);

  if (signalSummaries.length === 0) {
    return NextResponse.json({ notes: [] });
  }

  const fallbackNotes = new Map(
    signalSummaries.map((signal) => [signal.id, buildFallbackNote(signal)])
  );

  // Preferred path: Claude with the distilled palate narrative — notes speak
  // to THIS user's palate instead of generic wine descriptions. Falls through
  // to the OpenAI path (then static fallbacks) on any failure.
  if (isAnthropicConfigured()) {
    try {
      const narrative = palateRecord?.profile?.narrative ?? null;
      const { input } = await anthropicToolCall<{ notes?: Array<{ id: string; note: string | null }> }>({
        model: CLAUDE_NOTE_MODEL,
        system: [
          "You are the Cluster pocket sommelier writing one-line reasons a specific wine suits a specific person.",
          "Warm and direct, never condescending, no wine-snob gatekeeping. No score percentages, no 'match', no backend details.",
          "Each note: a conversational fragment of 16 words or fewer, starting with a capital letter.",
          "When the taster's palate profile is provided, tie the reason to their palate (e.g. 'the savory, structured style you keep coming back to').",
          "Never mention tannins for non-red wines. If a wine reads dry, say dryness or drier finish instead of sweetness.",
        ].join("\n"),
        user: [
          narrative ? `Taster palate profile: ${narrative}` : "No palate profile available — reason from the signals alone.",
          "",
          buildPrompt(signalSummaries),
        ].join("\n"),
        toolName: "recommendation_notes",
        toolDescription: "Record one note per recommendation id.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            notes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  note: { type: ["string", "null"] },
                },
                required: ["id", "note"],
              },
            },
          },
          required: ["notes"],
        },
        maxTokens: 300,
        timeoutMs: NOTE_TIMEOUT_MS,
        maxRetries: 0,
      });

      const noteMap = new Map<string, string>();
      (input.notes ?? []).forEach((entry) => {
        const sourceSignal = signalSummaries.find((signal) => signal.id === entry.id);
        if (!sourceSignal) return;
        const sanitized = sanitizeNote(entry.note);
        if (!sanitized) return;
        if (sourceSignal.wine_type !== "red" && /\btannins?\b/i.test(sanitized)) return;
        if (
          /\bsweetness\b/i.test(sanitized) &&
          sourceSignal.wine_type !== "dessert_fortified" &&
          !/\bdry|drier\b/i.test(sanitized)
        ) {
          return;
        }
        noteMap.set(entry.id, sanitized);
      });

      if (noteMap.size > 0) {
        return NextResponse.json({
          notes: signalSummaries.map((signal) => ({
            id: signal.id,
            note: noteMap.get(signal.id) ?? fallbackNotes.get(signal.id) ?? null,
          })),
        });
      }
    } catch {
      // fall through to the OpenAI path
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      notes: signalSummaries.map((signal) => ({
        id: signal.id,
        note: fallbackNotes.get(signal.id) ?? null,
      })),
    });
  }

  const openai = createOpenAiClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTE_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: NOTE_MODEL,
        reasoning: { effort: "minimal" },
        max_output_tokens: 220,
        text: {
          format: {
            type: "json_schema",
            name: "list_scan_recommendation_notes",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                notes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      note: { type: ["string", "null"] },
                    },
                    required: ["id", "note"],
                  },
                },
              },
              required: ["notes"],
            },
          },
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(signalSummaries),
              },
            ],
          },
        ],
        safety_identifier: auth.user.id,
      },
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";

    const parsedNotes = outputText ? (JSON.parse(outputText) as { notes?: Array<{ id: string; note: string | null }> }) : {};
    const noteMap = new Map<string, string>();

    (parsedNotes.notes ?? []).forEach((entry) => {
      const sourceSignal = signalSummaries.find((signal) => signal.id === entry.id);
      if (!sourceSignal) {
        return;
      }

      const sanitized = sanitizeNote(entry.note);
      if (!sanitized) {
        return;
      }

      if (sourceSignal.wine_type !== "red" && /\btannins?\b/i.test(sanitized)) {
        return;
      }

      if (/\bsweetness\b/i.test(sanitized) && sourceSignal.wine_type !== "dessert_fortified" && !/\bdry|drier\b/i.test(sanitized)) {
        return;
      }

      noteMap.set(entry.id, sanitized);
    });

    return NextResponse.json({
      notes: signalSummaries.map((signal) => ({
        id: signal.id,
        note: noteMap.get(signal.id) ?? fallbackNotes.get(signal.id) ?? null,
      })),
    });
  } catch {
    return NextResponse.json({
      notes: signalSummaries.map((signal) => ({
        id: signal.id,
        note: fallbackNotes.get(signal.id) ?? null,
      })),
    });
  } finally {
    clearTimeout(timeout);
  }
}
