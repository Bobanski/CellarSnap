import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getListScanDisplayLines,
  getListScanStructuredMeta,
  listScanParsedWineSchema,
  resolveListScanWineType,
} from "@shared";
import { assembleWineProfile } from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { defaultLoadUserPreferenceEntries } from "../../algorithm/score/handler";

const NOTE_MODEL = "gpt-5.4-mini";
const NOTE_TIMEOUT_MS = 3000;

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

function axisLabel(axis: string) {
  const labels: Record<string, string> = {
    body: "body",
    acidity: "acidity",
    tannin: "tannin",
    alcohol_perception: "alcohol",
    fruit_ripeness: "fruit ripeness",
    oak_presence: "oak",
    earthy: "earthiness",
    mineral: "minerality",
    savory: "savory character",
    aromatic_intensity: "aromatic intensity",
    sweetness_perception: "sweetness",
    bitterness_phenolic_grip: "grip",
    finish_length: "finish length",
    concentration: "concentration",
    complexity: "complexity",
    freshness: "freshness",
  };

  return labels[axis] ?? axis.replace(/_/g, " ");
}

function truncateNote(value: string, maxChars = 140) {
  if (value.length <= maxChars) {
    return value.trim();
  }

  return value.slice(0, maxChars).trimEnd().replace(/[.,;:!?-]+$/, "");
}

function sanitizeNote(value: string | null | undefined) {
  const normalized = (value ?? "")
    .replace(/^\s*[-•*]+\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? truncateNote(normalized) : null;
}

function buildFallbackNote(signal: NoteSignalSummary) {
  const cues = [signal.categorical_signals[0], signal.sensory_signals[0], signal.sensory_signals[1]]
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);

  if (cues.length > 0) {
    return truncateNote(`${cues.join(" and ")} line up with your palate.`);
  }

  return "Its style lines up with the palate signals behind your strongest matches.";
}

function buildSignalSummary(params: {
  item: NoteItem;
  score: ReturnType<typeof computeMatchScore>;
  userPreference: ReturnType<typeof buildUserPreferenceVector>;
}): NoteSignalSummary {
  const display = getListScanDisplayLines(params.item);
  const structured = getListScanStructuredMeta(params.item);
  const resolvedWineType = resolveListScanWineType(params.item);

  const sensorySignals = Object.entries(params.score.axis_contributions)
    .filter(([, contribution]) => contribution.user_value !== null)
    .sort((left, right) => left[1].contribution - right[1].contribution)
    .slice(0, 2)
    .map(([axis]) => axisLabel(axis))
    .filter(Boolean);

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
    "Each note must explain why the wine aligns with the user's palate.",
    "Use the supplied signals, but do not mention the score percentage, the word 'match', or backend details.",
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

  if (!(await userHasPrivateBetaFeatureAccess(auth.supabase, auth.user))) {
    return createPrivateBetaFeatureDeniedResponse();
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
  try {
    preferenceEntries = await defaultLoadUserPreferenceEntries(auth.supabase, auth.user.id);
  } catch {
    return NextResponse.json({ notes: [] });
  }

  const qualifyingEntryCount = preferenceEntries.filter((entry) => entry.advanced_notes).length;
  if (qualifyingEntryCount < 5) {
    return NextResponse.json({ notes: [] });
  }

  const referenceSupabase = createSupabaseAdminClient();
  const signalSummaries = (
    await Promise.all(
      eligibleItems.map(async (item) => {
        const resolvedWineType = resolveListScanWineType(item);
        if (resolvedWineType === "unknown") {
          return null;
        }
        const algorithmWineType: Parameters<typeof assembleWineProfile>[0]["wine_type"] =
          resolvedWineType === "dessert_fortified" ? "sweet" : resolvedWineType;

        const profile = await assembleWineProfile(
          {
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
          },
          referenceSupabase
        );

        const preferenceVector = buildUserPreferenceVector(preferenceEntries, algorithmWineType);
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
      const sanitized = sanitizeNote(entry.note);
      if (sanitized) {
        noteMap.set(entry.id, sanitized);
      }
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
