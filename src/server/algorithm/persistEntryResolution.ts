import {
  isMissingDbTableError,
  type SupabaseErrorLike,
} from "@/lib/supabase/errors";
import { executeWithColumnFallback } from "@/server/db/compat";
import {
  createStubResolution,
  resolveEntryFields,
  type ResolverInput,
  type ResolverOutput,
} from "@/server/algorithm/resolver";
import type { ResolverSupabaseClient } from "@/server/algorithm/aliasLookup";

type PersistedEntryRow = ({ id: string } & Record<string, unknown>) | null;

type InsertBuilder = {
  insert: (payload: Record<string, unknown>) => Promise<{
    data?: unknown;
    error: SupabaseErrorLike | null;
  }>;
};

type ExistingEntryBuilder = {
  select: (columns: string) => ExistingEntryBuilder;
  eq: (column: string, value: string) => ExistingEntryBuilder;
  maybeSingle: () => Promise<{
    data: PersistedEntryRow;
    error: SupabaseErrorLike | null;
  }>;
};

type UpdateEntryBuilder = {
  update: (payload: Record<string, unknown>) => UpdateEntryBuilder;
  eq: (column: string, value: string) => UpdateEntryBuilder;
  select: (columns: string) => UpdateEntryBuilder;
  maybeSingle: () => Promise<{
    data: PersistedEntryRow;
    error: SupabaseErrorLike | null;
  }>;
};

const ENTRY_RESOLUTION_COLUMNS = [
  "raw_region",
  "raw_producer",
  "raw_classification",
  "raw_wine_type",
  "canonical_region",
  "canonical_producer",
  "canonical_classification",
  "resolution_confidence",
  "fallback_level",
];

const LOG_RESOLUTION_COLUMNS = [
  "entry_id",
  "user_id",
  "raw_region",
  "raw_producer",
  "raw_classification",
  "raw_wine_type",
  "canonical_region",
  "canonical_producer",
  "canonical_classification",
  "resolution_confidence",
  "fallback_level",
  "region_alias_matched",
  "producer_alias_matched",
  "resolution_source",
];

function buildEntryResolutionPayload(
  input: ResolverInput,
  resolution: ResolverOutput
) {
  return {
    raw_region: input.region ?? null,
    raw_producer: input.producer ?? null,
    raw_classification: input.classification ?? null,
    raw_wine_type: input.wine_type ? String(input.wine_type) : null,
    canonical_region: resolution.canonical_region,
    canonical_producer: resolution.canonical_producer,
    canonical_classification: resolution.canonical_classification,
    resolution_confidence: resolution.resolution_confidence,
    fallback_level: resolution.fallback_level,
  };
}

function buildResolutionLogPayload({
  entryId,
  userId,
  input,
  resolution,
}: {
  entryId: string;
  userId: string;
  input: ResolverInput;
  resolution: ResolverOutput;
}) {
  return {
    entry_id: entryId,
    user_id: userId,
    raw_region: input.region ?? null,
    raw_producer: input.producer ?? null,
    raw_classification: input.classification ?? null,
    raw_wine_type: input.wine_type ? String(input.wine_type) : null,
    canonical_region: resolution.canonical_region,
    canonical_producer: resolution.canonical_producer,
    canonical_classification: resolution.canonical_classification,
    resolution_confidence: resolution.resolution_confidence,
    fallback_level: resolution.fallback_level,
    region_alias_matched: resolution.region_alias_matched,
    producer_alias_matched: resolution.producer_alias_matched,
    resolution_source: resolution.resolution_source,
  };
}

async function persistResolutionLog({
  supabase,
  entryId,
  userId,
  input,
  resolution,
}: {
  supabase: ResolverSupabaseClient;
  entryId: string;
  userId: string;
  input: ResolverInput;
  resolution: ResolverOutput;
}) {
  const result = await executeWithColumnFallback({
    initialPayload: buildResolutionLogPayload({
      entryId,
      userId,
      input,
      resolution,
    }),
    removableColumns: LOG_RESOLUTION_COLUMNS,
    maxAttempts: 3,
    attempt: async (payload) => {
      const insertResult = await (supabase.from("scan_resolution_log") as InsertBuilder).insert(
        payload
      );
      return {
        data: payload,
        error: insertResult.error as SupabaseErrorLike | null,
      };
    },
  });

  if (result.error && !isMissingDbTableError(result.error, "scan_resolution_log")) {
    throw result.error;
  }
}

export async function persistEntryResolution({
  supabase,
  entryId,
  userId,
  input,
}: {
  supabase: ResolverSupabaseClient;
  entryId: string;
  userId: string;
  input: ResolverInput;
}): Promise<{
  entry: PersistedEntryRow;
  resolution: ResolverOutput;
}> {
  let resolution: ResolverOutput;

  try {
    resolution = await resolveEntryFields(supabase, input);
  } catch {
    resolution = createStubResolution(input);
  }

  const updateResult = await executeWithColumnFallback({
    initialPayload: buildEntryResolutionPayload(input, resolution),
    removableColumns: ENTRY_RESOLUTION_COLUMNS,
    maxAttempts: 3,
    attempt: async (payload) => {
      if (Object.keys(payload).length === 0) {
        const existingEntry = await (supabase
          .from("wine_entries") as ExistingEntryBuilder)
          .select("*")
          .eq("id", entryId)
          .eq("user_id", userId)
          .maybeSingle();

        return {
          data: existingEntry.data as PersistedEntryRow,
          error: existingEntry.error as SupabaseErrorLike | null,
        };
      }

      const updateEntry = await (supabase
        .from("wine_entries") as UpdateEntryBuilder)
        .update(payload)
        .eq("id", entryId)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      return {
        data: updateEntry.data as PersistedEntryRow,
        error: updateEntry.error as SupabaseErrorLike | null,
      };
    },
  });

  try {
    await persistResolutionLog({
      supabase,
      entryId,
      userId,
      input,
      resolution,
    });
  } catch {
    // Logging is best-effort; entry persistence should still succeed.
  }

  return {
    entry: updateResult.data as PersistedEntryRow,
    resolution,
  };
}
