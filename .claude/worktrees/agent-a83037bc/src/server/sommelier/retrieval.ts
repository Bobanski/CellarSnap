import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import {
  isAnyMissingDbColumnError,
  isMissingDbFunctionError,
} from "@/lib/supabase/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildUserPreferenceVector } from "@/server/algorithm/userPreferences";
import type { PreferenceSourceEntry } from "@/server/algorithm/userPreferences";
import { generateEmbedding } from "@/server/sommelier/embeddings";
import type {
  AssembledSommelierContext,
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

  return ((data ?? []) as DataRow[]).map((row) => ({
    id: String(row.id ?? ""),
    content: normalizeText(row.content),
    similarity:
      typeof row.similarity === "number" ? row.similarity : Number(row.similarity ?? 0),
    metadata: asRecord(row.metadata),
  }));
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

function buildPreferenceSummarySnippet(
  wineType: WineType,
  entries: PreferenceSourceEntry[]
): PreferenceSnippet | null {
  const vector = buildUserPreferenceVector(entries, wineType);
  const sensoryFragments = Object.entries(vector.sensory)
    .slice(0, 4)
    .map(([axis, value]) => `${axis.replace(/_/g, " ")} ${value}`);

  if (vector.event_count === 0 || sensoryFragments.length === 0) {
    return null;
  }

  return {
    wineType,
    eventCount: vector.event_count,
    summary: `User preferences for ${wineType}: ${sensoryFragments.join(", ")}.`,
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
      wineType: WINE_TYPE_VALUES.includes(row.wine_type as WineType)
        ? (row.wine_type as WineType)
        : null,
      region: normalizeText(row.region) || null,
      appellation: normalizeText(row.appellation) || null,
      country: normalizeText(row.country) || null,
      classification: normalizeText(row.classification) || null,
      rating:
        typeof row.rating === "number" ? row.rating : Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
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
      rating:
        typeof row.rating === "number" ? row.rating : Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
      advanced_notes: (row.advanced_notes as PreferenceSourceEntry["advanced_notes"]) ?? null,
      wine_type: WINE_TYPE_VALUES.includes(row.wine_type as WineType)
        ? (row.wine_type as WineType)
        : null,
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
        ).slice(0, 2);

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
    ((data ?? []) as DataRow[]).map((row) => ({
      id: String(row.id ?? ""),
      content: normalizeText(row.content),
      similarity:
        typeof row.similarity === "number" ? row.similarity : Number(row.similarity ?? 0),
      metadata: asRecord(row.metadata),
    }))
  );
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
  userContext: UserContext
) {
  const sources: SommelierSource[] = [
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
  const [wineKnowledge, generalKnowledge, userContext, rawEntryMatches] = await Promise.all([
    retrieveWineKnowledgeByEmbedding(queryEmbedding, 5, { supabase: adminSupabase }),
    retrieveGeneralKnowledgeByEmbedding(queryEmbedding, 5, { supabase: adminSupabase }),
    retrieveUserContext(dependencies.requestSupabase, userId, query),
    retrieveUserEntryMatchesByEmbedding(queryEmbedding, userId, 5, {
      supabase: adminSupabase,
    }),
  ]);
  const entryMatches = filterDuplicateEntryMatches(rawEntryMatches, userContext);

  const contextText = [
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
    contextText,
    sources: buildSources(wineKnowledge, generalKnowledge, entryMatches, userContext),
  };
}
