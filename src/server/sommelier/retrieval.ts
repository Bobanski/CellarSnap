import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import {
  isAnyMissingDbColumnError,
  isMissingDbFunctionError,
} from "@/lib/supabase/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { POPULATION_AXIS_MEANS } from "@/server/algorithm/constants";
import type { SensoryAxis } from "@/server/algorithm/types";
import { buildUserPreferenceVector } from "@/server/algorithm/userPreferences";
import type { PreferenceSourceEntry } from "@/server/algorithm/userPreferences";
import { readPalateProfile } from "@/server/algorithm/palateDistillation";
import type { PalateProfileRecord } from "@/server/algorithm/palateDistillation";
import { generateEmbedding } from "@/server/sommelier/embeddings";
import type {
  AssembledSommelierContext,
  DistilledProfileContext,
  KnowledgeMatch,
  PreferenceSnippet,
  SommelierSource,
  UserContext,
  UserHistoryEntry,
} from "@/server/sommelier/types";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

type DataRow = Record<string, unknown>;
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
// Structured data is denser and noisier than curated docs, so it benefits from a stricter floor.
const WINE_KNOWLEDGE_MATCH_THRESHOLD = 0.6;
const GENERAL_KNOWLEDGE_MATCH_THRESHOLD = 0.55;
const USER_ENTRY_MATCH_THRESHOLD = 0.55;

type RequestScopedSupabase = {
  from: AdminClient["from"];
};

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toWineTypeOrNull(value: unknown): WineType | null {
  return WINE_TYPE_VALUES.includes(value as WineType) ? (value as WineType) : null;
}

function toKnowledgeMatch(row: DataRow): KnowledgeMatch {
  return {
    id: String(row.id ?? ""),
    content: normalizeText(row.content),
    similarity: toFiniteNumber(row.similarity) ?? 0,
    metadata: asRecord(row.metadata),
  };
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectWineTypes(query: string) {
  const normalized = normalizeSearchText(query);
  return WINE_TYPE_VALUES.filter((wineType) => normalized.includes(wineType)) as WineType[];
}

function excerpt(value: string, maxLength = 220) {
  if (value.length <= maxLength) {
    return value;
  }

  const candidate = value.slice(0, maxLength);
  const sentenceBreak = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? ")
  );
  const fallbackBreak = candidate.lastIndexOf(" ");
  const cutoff = Math.max(sentenceBreak + 1, fallbackBreak);

  return `${candidate.slice(0, cutoff > 0 ? cutoff : maxLength).trimEnd()}...`;
}

function dedupeKnowledgeMatches(matches: KnowledgeMatch[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.metadata.title ?? ""}|${match.content}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function rpcKnowledgeSearch(
  supabase: AdminClient,
  fn: "match_wine_knowledge" | "match_general_knowledge",
  queryEmbedding: number[],
  limit: number,
  threshold: number
) {
  const { data, error } = await supabase.rpc(fn, {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DataRow[]).map((row) => toKnowledgeMatch(row));
}

async function retrieveWineKnowledgeByEmbedding(
  queryEmbedding: number[],
  limit = 5,
  dependencies: {
    supabase?: AdminClient;
  } = {}
) {
  const supabase = dependencies.supabase ?? createSupabaseAdminClient();
  return dedupeKnowledgeMatches(
    await rpcKnowledgeSearch(
      supabase,
      "match_wine_knowledge",
      queryEmbedding,
      limit,
      WINE_KNOWLEDGE_MATCH_THRESHOLD
    )
  );
}

async function retrieveGeneralKnowledgeByEmbedding(
  queryEmbedding: number[],
  limit = 5,
  dependencies: {
    supabase?: AdminClient;
  } = {}
) {
  const supabase = dependencies.supabase ?? createSupabaseAdminClient();
  return dedupeKnowledgeMatches(
    await rpcKnowledgeSearch(
      supabase,
      "match_general_knowledge",
      queryEmbedding,
      limit,
      GENERAL_KNOWLEDGE_MATCH_THRESHOLD
    )
  );
}

export async function retrieveWineKnowledge(
  query: string,
  limit = 5,
  dependencies: {
    supabase?: AdminClient;
  } = {}
) {
  const queryEmbedding = await generateEmbedding(query);
  return retrieveWineKnowledgeByEmbedding(queryEmbedding, limit, dependencies);
}

export async function retrieveGeneralKnowledge(
  query: string,
  limit = 5,
  dependencies: {
    supabase?: AdminClient;
  } = {}
) {
  const queryEmbedding = await generateEmbedding(query);
  return retrieveGeneralKnowledgeByEmbedding(queryEmbedding, limit, dependencies);
}

function scoreUserEntry(entry: UserHistoryEntry, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(" ").filter((token) => token.length >= 3);
  const haystack = normalizeSearchText(
    [
      entry.wineName,
      entry.producer,
      entry.region,
      entry.appellation,
      entry.country,
      entry.classification,
      entry.notes,
      entry.aiNotesSummary,
    ]
      .filter(Boolean)
      .join(" ")
  );

  let score = entry.rating ?? 0;

  tokens.forEach((token) => {
    if (haystack.includes(token)) {
      score += 12;
    }
  });

  if (entry.consumedAt) {
    const ageMs = Date.now() - new Date(entry.consumedAt).getTime();
    if (Number.isFinite(ageMs)) {
      score += Math.max(0, 14 - ageMs / (1000 * 60 * 60 * 24 * 30));
    }
  }

  return score;
}

/**
 * Interpret a sensory axis value relative to the population mean.
 * Returns a label like "high", "low", "very high", or "average".
 */
function interpretAxisLevel(axis: SensoryAxis, value: number): string {
  const mean = POPULATION_AXIS_MEANS[axis];
  const diff = value - mean;

  if (diff > 0.8) return "very high";
  if (diff > 0.35) return "high";
  if (diff < -0.8) return "very low";
  if (diff < -0.35) return "low";
  return "average";
}

/**
 * Build a rich preference summary snippet for Pocket Somm.
 *
 * Instead of dumping the first 4 raw axis numbers, this:
 * 1. Sorts axes by deviation from population mean (most distinctive first)
 * 2. Takes the top 6 most distinctive axes
 * 3. Adds interpretive labels ("high", "very low", etc.)
 * 4. Produces a natural-language summary the LLM can reason about
 */
function buildPreferenceSummarySnippet(
  wineType: WineType,
  entries: PreferenceSourceEntry[]
): PreferenceSnippet | null {
  const vector = buildUserPreferenceVector(entries, wineType);

  if (vector.event_count === 0 || Object.keys(vector.sensory).length === 0) {
    return null;
  }

  // Sort axes by deviation from population mean (most distinctive first)
  const rankedAxes = (Object.entries(vector.sensory) as Array<[SensoryAxis, number]>)
    .map(([axis, value]) => ({
      axis,
      value,
      deviation: Math.abs(value - POPULATION_AXIS_MEANS[axis]),
      level: interpretAxisLevel(axis, value),
    }))
    .sort((a, b) => b.deviation - a.deviation);

  // Top 6 most distinctive axes with interpretive labels
  const distinctiveAxes = rankedAxes.slice(0, 6);
  const sensoryFragments = distinctiveAxes.map(
    (a) => `${a.axis.replace(/_/g, " ")} ${a.value.toFixed(1)} (${a.level})`
  );

  // Identify strong preferences (deviation > 0.35) for a natural-language intro
  const strongPrefs = distinctiveAxes.filter((a) => a.deviation > 0.35);
  let patternNote = "";
  if (strongPrefs.length > 0) {
    const highAxes = strongPrefs
      .filter((a) => a.value > POPULATION_AXIS_MEANS[a.axis])
      .map((a) => a.axis.replace(/_/g, " "));
    const lowAxes = strongPrefs
      .filter((a) => a.value < POPULATION_AXIS_MEANS[a.axis])
      .map((a) => a.axis.replace(/_/g, " "));

    const parts: string[] = [];
    if (highAxes.length > 0) {
      parts.push(`gravitates toward ${highAxes.join(", ")}`);
    }
    if (lowAxes.length > 0) {
      parts.push(`avoids ${lowAxes.join(", ")}`);
    }
    if (parts.length > 0) {
      patternNote = ` This user ${parts.join(" and ")}.`;
    }
  }

  return {
    wineType,
    eventCount: vector.event_count,
    summary:
      `User preferences for ${wineType} (${vector.event_count} entries): ` +
      `${sensoryFragments.join(", ")}.${patternNote}`,
  };
}

export async function retrieveUserContext(
  supabase: RequestScopedSupabase,
  userId: string,
  query: string
): Promise<UserContext> {
  const attempts = [
    "id, wine_name, producer, vintage, wine_type, region, appellation, country, classification, rating, consumed_at, notes, ai_notes_summary, advanced_notes",
    "id, wine_name, producer, vintage, wine_type, region, appellation, country, classification, rating, consumed_at, notes, advanced_notes",
    "id, wine_name, producer, vintage, wine_type, region, appellation, country, classification, rating, consumed_at, notes",
  ];

  let data: DataRow[] | null = null;
  let error: { message: string } | null = null;

  for (const selectClause of attempts) {
    const response = await supabase
      .from("wine_entries")
      .select(selectClause)
      .eq("user_id", userId)
      .order("consumed_at", { ascending: false })
      .limit(50);

    if (!response.error) {
      data = (response.data ?? []) as unknown as DataRow[];
      error = null;
      break;
    }

    if (isAnyMissingDbColumnError(response.error)) {
      error = { message: response.error.message };
      continue;
    }

    throw new Error(response.error.message);
  }

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as DataRow[]).map(
    (row): UserHistoryEntry => ({
      id: String(row.id ?? ""),
      wineName: normalizeText(row.wine_name) || null,
      producer: normalizeText(row.producer) || null,
      vintage: normalizeText(row.vintage) || null,
      wineType: toWineTypeOrNull(row.wine_type),
      region: normalizeText(row.region) || null,
      appellation: normalizeText(row.appellation) || null,
      country: normalizeText(row.country) || null,
      classification: normalizeText(row.classification) || null,
      rating: toFiniteNumber(row.rating),
      consumedAt: normalizeText(row.consumed_at) || null,
      notes: normalizeText(row.notes) || null,
      aiNotesSummary: normalizeText(row.ai_notes_summary) || null,
    })
  );

  const relevantEntries = [...rows]
    .sort((left, right) => scoreUserEntry(right, query) - scoreUserEntry(left, query))
    .slice(0, 10);

  const recentFavorites = [...rows]
    .filter((entry) => typeof entry.rating === "number" && entry.rating >= 90)
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0))
    .slice(0, 3);

  const preferenceEntries = ((data ?? []) as DataRow[]).map(
    (row): PreferenceSourceEntry => ({
      rating: toFiniteNumber(row.rating),
      advanced_notes: (row.advanced_notes as PreferenceSourceEntry["advanced_notes"]) ?? null,
      wine_type: toWineTypeOrNull(row.wine_type),
    })
  );

  const requestedWineTypes = detectWineTypes(query);
  const wineTypesToSummarize =
    requestedWineTypes.length > 0
      ? requestedWineTypes
      : Array.from(
          new Set(
            preferenceEntries
              .map((entry) => entry.wine_type)
              .filter((wineType): wineType is WineType => Boolean(wineType))
          )
        ).slice(0, 3);

  const preferenceSnippets = wineTypesToSummarize
    .map((wineType) => buildPreferenceSummarySnippet(wineType, preferenceEntries))
    .filter((snippet): snippet is PreferenceSnippet => Boolean(snippet));

  if (relevantEntries.length > 0) {
    const grapeMap = await fetchPrimaryGrapesByEntryId(
      supabase as unknown as Parameters<typeof fetchPrimaryGrapesByEntryId>[0],
      relevantEntries.map((entry) => entry.id)
    );

    relevantEntries.forEach((entry) => {
      const grapes = grapeMap.get(entry.id)?.map((grape) => grape.name).filter(Boolean);
      if (grapes && grapes.length > 0) {
        entry.notes = [entry.notes, `Primary grapes: ${grapes.join(", ")}`]
          .filter(Boolean)
          .join(". ");
      }
    });
  }

  return {
    relevantEntries,
    recentFavorites,
    preferenceSnippets,
  };
}

async function retrieveUserEntryMatchesByEmbedding(
  queryEmbedding: number[],
  userId: string,
  limit = 5,
  dependencies: {
    supabase?: AdminClient;
  } = {}
) {
  const supabase = dependencies.supabase ?? createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("match_user_entries", {
    query_embedding: queryEmbedding,
    target_user_id: userId,
    match_threshold: USER_ENTRY_MATCH_THRESHOLD,
    match_count: limit,
  });

  if (error) {
    if (isMissingDbFunctionError(error, "match_user_entries")) {
      return [] as KnowledgeMatch[];
    }
    throw new Error(error.message);
  }

  return dedupeKnowledgeMatches(
    ((data ?? []) as DataRow[]).map((row) => toKnowledgeMatch(row))
  );
}

// ── Distilled palate profile (palate_profiles.profile) ────────────────
// The "master somm reads your history" narrative + per-wine-type leans.
// Kept deliberately compact (top axes/varietals/regions only) so it never
// dominates the context budget — see formatDistilledProfileSection.

const MAX_WINE_TYPES_IN_CONTEXT = 5;
const MAX_AXIS_LEANS_PER_TYPE = 4;
const MAX_FAVORED_ITEMS = 3;
const MIN_AXIS_LEAN_CONFIDENCE = 0.3;

function toDistilledProfileContext(
  record: PalateProfileRecord | null
): DistilledProfileContext | null {
  if (!record || !record.profile) return null;

  const wineTypes = [...record.profile.wine_types]
    .sort((a, b) => {
      const aConfidence = Math.max(0, ...a.axis_seeds.map((s) => s.confidence));
      const bConfidence = Math.max(0, ...b.axis_seeds.map((s) => s.confidence));
      return bConfidence - aConfidence;
    })
    .slice(0, MAX_WINE_TYPES_IN_CONTEXT)
    .map((wt) => ({
      wineType: wt.wine_type,
      narrative: wt.narrative,
      favoredVarietals: wt.favored_varietals.slice(0, MAX_FAVORED_ITEMS),
      favoredRegions: wt.favored_regions.slice(0, MAX_FAVORED_ITEMS),
      leans: [...wt.axis_seeds]
        .filter((seed) => seed.confidence >= MIN_AXIS_LEAN_CONFIDENCE)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_AXIS_LEANS_PER_TYPE)
        .map((seed) => ({ axis: seed.axis, value: seed.value, confidence: seed.confidence })),
    }));

  return {
    narrative: record.profile.narrative,
    wineTypes,
  };
}

function describeLean(value: number): string {
  if (value >= 4) return "high";
  if (value >= 3.5) return "leans high";
  if (value <= 2) return "low";
  if (value <= 2.5) return "leans low";
  return "average";
}

function formatDistilledProfileSection(profile: DistilledProfileContext | null): string {
  if (!profile) return "";

  const lines: string[] = [
    "Distilled palate profile (a master-somm-style read of this user's full tasting history — trust this over a single logged entry):",
    profile.narrative,
  ];

  for (const wt of profile.wineTypes) {
    const leanFragments = wt.leans.map(
      (lean) => `${lean.axis.replace(/_/g, " ")} ${describeLean(lean.value)}`
    );
    const favored = [
      wt.favoredVarietals.length > 0 ? `favors ${wt.favoredVarietals.join(", ")}` : null,
      wt.favoredRegions.length > 0 ? `from ${wt.favoredRegions.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    lines.push(
      `- ${wt.wineType}: ${wt.narrative}${favored ? ` (${favored})` : ""}${
        leanFragments.length > 0 ? ` — ${leanFragments.join(", ")}` : ""
      }`
    );
  }

  return lines.join("\n");
}

function formatUserContext(userContext: UserContext) {
  const sections: string[] = [];

  if (userContext.preferenceSnippets.length > 0) {
    sections.push(
      "User preference summary:\n" +
        userContext.preferenceSnippets.map((snippet) => `- ${snippet.summary}`).join("\n")
    );
  }

  if (userContext.relevantEntries.length > 0) {
    sections.push(
      "Relevant tasting history:\n" +
        userContext.relevantEntries
          .map((entry) =>
            `- ${[
              entry.wineName || "Unknown wine",
              entry.producer,
              entry.vintage,
              entry.region || entry.country,
              entry.rating ? `rated ${entry.rating}` : null,
              entry.aiNotesSummary || entry.notes,
            ]
              .filter(Boolean)
              .join(" | ")}`
          )
          .join("\n")
    );
  }

  if (userContext.recentFavorites.length > 0) {
    sections.push(
      "Recent favorites:\n" +
        userContext.recentFavorites
          .map((entry) =>
            `- ${[
              entry.wineName || "Unknown wine",
              entry.producer,
              entry.vintage,
              entry.rating ? `rated ${entry.rating}` : null,
            ]
              .filter(Boolean)
              .join(" | ")}`
          )
          .join("\n")
    );
  }

  return sections.join("\n\n");
}

function formatKnowledgeSection(title: string, matches: KnowledgeMatch[]) {
  if (matches.length === 0) {
    return "";
  }

  return [
    `${title}:`,
    ...matches.map(
      (match, index) =>
        `${index + 1}. ${excerpt(match.content, 340)}${
          match.similarity ? ` (similarity ${match.similarity.toFixed(3)})` : ""
        }`
    ),
  ].join("\n");
}

function filterDuplicateEntryMatches(
  matches: KnowledgeMatch[],
  userContext: UserContext
) {
  const existingEntryIds = new Set(userContext.relevantEntries.map((entry) => entry.id));

  return matches.filter((match) => {
    const sourceRowId =
      typeof match.metadata.source_row_id === "string"
        ? match.metadata.source_row_id
        : typeof match.metadata.entry_id === "string"
          ? match.metadata.entry_id
          : null;

    return sourceRowId ? !existingEntryIds.has(sourceRowId) : true;
  });
}

function buildSources(
  wineKnowledge: KnowledgeMatch[],
  generalKnowledge: KnowledgeMatch[],
  entryMatches: KnowledgeMatch[],
  userContext: UserContext,
  distilledProfile: DistilledProfileContext | null
) {
  const sources: SommelierSource[] = [
    ...(distilledProfile
      ? [
          {
            id: "distilled-palate-profile",
            kind: "preference_summary" as const,
            label: "Distilled palate profile",
            excerpt: excerpt(distilledProfile.narrative),
            metadata: {
              wine_types: distilledProfile.wineTypes.map((wt) => wt.wineType),
            },
          },
        ]
      : []),
    ...wineKnowledge.map((match) => ({
      id: `wine-${match.id}`,
      kind: "wine_knowledge" as const,
      label:
        typeof match.metadata.title === "string"
          ? match.metadata.title
          : typeof match.metadata.table === "string"
            ? match.metadata.table
            : "Structured wine knowledge",
      excerpt: excerpt(match.content),
      similarity: match.similarity,
      metadata: match.metadata,
    })),
    ...generalKnowledge.map((match) => ({
      id: `doc-${match.id}`,
      kind: "general_knowledge" as const,
      label:
        typeof match.metadata.title === "string"
          ? match.metadata.title
          : "Knowledge document",
      excerpt: excerpt(match.content),
      similarity: match.similarity,
      metadata: match.metadata,
    })),
    ...entryMatches.slice(0, 4).map((match) => ({
      id: `entry-match-${match.id}`,
      kind: "user_history" as const,
      label:
        typeof match.metadata.title === "string"
          ? match.metadata.title
          : "Cellar entry",
      excerpt: excerpt(match.content),
      similarity: match.similarity,
      metadata: match.metadata,
    })),
    ...userContext.relevantEntries.slice(0, 3).map((entry) => ({
      id: `entry-${entry.id}`,
      kind: "user_history" as const,
      label: entry.wineName || entry.producer || "Past tasting",
      excerpt: excerpt(
        [
          entry.producer,
          entry.region || entry.country,
          entry.rating ? `rated ${entry.rating}` : null,
          entry.aiNotesSummary || entry.notes,
        ]
          .filter(Boolean)
          .join(" | ")
      ),
      metadata: {
        wine_type: entry.wineType,
        rating: entry.rating,
      },
    })),
    ...userContext.preferenceSnippets.map((snippet) => ({
      id: `pref-${snippet.wineType}`,
      kind: "preference_summary" as const,
      label: `${snippet.wineType} preferences`,
      excerpt: snippet.summary,
      metadata: {
        wine_type: snippet.wineType,
        event_count: snippet.eventCount,
      },
    })),
  ];

  return sources.slice(0, 12);
}

export async function assembleContext(
  query: string,
  userId: string,
  dependencies: {
    requestSupabase: RequestScopedSupabase;
    adminSupabase?: AdminClient;
  }
): Promise<AssembledSommelierContext> {
  const adminSupabase = dependencies.adminSupabase ?? createSupabaseAdminClient();
  const queryEmbedding = await generateEmbedding(query);
  const [wineKnowledge, generalKnowledge, userContext, rawEntryMatches, palateProfileRecord] =
    await Promise.all([
      retrieveWineKnowledgeByEmbedding(queryEmbedding, 5, { supabase: adminSupabase }),
      retrieveGeneralKnowledgeByEmbedding(queryEmbedding, 5, { supabase: adminSupabase }),
      retrieveUserContext(dependencies.requestSupabase, userId, query),
      retrieveUserEntryMatchesByEmbedding(queryEmbedding, userId, 5, {
        supabase: adminSupabase,
      }),
      // Read-only: the somm never triggers a (re)distillation inline — it
      // only reads whatever palate_profiles already has cached.
      readPalateProfile(adminSupabase, userId).catch(() => null),
    ]);
  const entryMatches = filterDuplicateEntryMatches(rawEntryMatches, userContext);
  const distilledProfile = toDistilledProfileContext(palateProfileRecord);

  // Ordered by priority: truncateTextToApproxTokens (chat.ts) trims whole
  // paragraphs off the END when the combined text exceeds the context
  // budget, so the distilled profile — the highest-value personalization
  // signal — goes first and survives trimming longest.
  const contextText = [
    formatDistilledProfileSection(distilledProfile),
    formatUserContext(userContext),
    formatKnowledgeSection("Matched cellar entries", entryMatches),
    formatKnowledgeSection("Structured wine knowledge", wineKnowledge),
    formatKnowledgeSection("General wine knowledge documents", generalKnowledge),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    query,
    wineKnowledge,
    generalKnowledge,
    entryMatches,
    userContext,
    distilledProfile,
    contextText,
    sources: buildSources(wineKnowledge, generalKnowledge, entryMatches, userContext, distilledProfile),
  };
}
