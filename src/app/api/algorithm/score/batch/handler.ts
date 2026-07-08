import { NextResponse } from "next/server";
import { z } from "zod";
import type { AlgorithmBatchResult } from "@/lib/algorithm/api";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assembleWineProfileWithDataSource,
  batchPrefetchProfileData,
  createPreFetchedProfileDataSource,
  createSupabaseProfileAssemblyDataSource,
} from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import type { AssembleWineProfileInput, EffectiveWineProfile } from "@/server/algorithm/types";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import {
  distilledSeedForWineType,
  readPalateProfile,
} from "@/server/algorithm/palateDistillation";
import {
  RequestAuthError,
  requireRequestAuth,
} from "@/server/auth/requestAuth";
import {
  readCachedEntryScores,
  writeCachedEntryScore,
  writeCachedEntryScoresBulk,
} from "@/server/algorithm/scoreCache";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";
import {
  buildAlgorithmScoreResponse,
  buildDirectInput,
  defaultAlgorithmScoreDependencies,
  hasDirectScoreOverrides,
  type LoadedEntryForScoring,
  type RequestAuthResult,
  type RequestSupabaseClient,
} from "../handler";

type BatchDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  loadEntryForScoring: (
    supabase: RequestSupabaseClient,
    userId: string,
    entryId: string
  ) => Promise<LoadedEntryForScoring | null>;
  loadUserPreferenceEntries: (
    supabase: RequestSupabaseClient,
    userId: string
  ) => Promise<PreferenceSourceEntry[]>;
  assembleProfile: typeof defaultAlgorithmScoreDependencies.assembleProfile;
  buildUserPreferenceVector: typeof buildUserPreferenceVector;
  computeMatchScore: typeof computeMatchScore;
  readCachedEntryScores: typeof readCachedEntryScores;
  writeCachedEntryScore: typeof writeCachedEntryScore;
  writeCachedEntryScoresBulk: typeof writeCachedEntryScoresBulk;
};

const nullableString = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().nullable()
);

const nullableNumber = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z.number().int().min(1900).max(2100).nullable()
);

const batchItemSchema = z
  .object({
    request_id: z.string().optional(),
    entry_id: z.string().uuid().optional(),
    wine_type: z.enum(WINE_TYPE_VALUES).optional(),
    canonical_region: nullableString.optional(),
    canonical_sub_region: nullableString.optional(),
    canonical_country: nullableString.optional(),
    primary_grapes: nullableString.optional(),
    vintage: nullableNumber.optional(),
    producer: nullableString.optional(),
    classification: nullableString.optional(),
    quality_tier: nullableString.optional(),
  })
  .superRefine((value, ctx) => {
    const hasEntryId = typeof value.entry_id === "string";
    const hasWineType = typeof value.wine_type === "string";

    if (!hasEntryId && !hasWineType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each batch item needs either entry_id or direct wine fields with wine_type.",
        path: ["wine_type"],
      });
    }
  });

const batchRequestSchema = z.object({
  items: z.array(batchItemSchema).min(1).max(50),
});

type BatchItem = z.infer<typeof batchItemSchema>;

// Result of resolving a single batch item's score input, before profile
// assembly. Splitting resolution from assembly lets us collect every item's
// wine_type/vintage first and prefetch reference data for all of them in one
// shot, instead of assembleProfile() hitting Supabase per item.
type ResolvedScoreItem =
  | { status: "result"; result: AlgorithmBatchResult }
  | {
      status: "pending";
      item: BatchItem;
      requestId: string | null;
      scoreInput: LoadedEntryForScoring & { wine_type: WineType };
    };

export function createAlgorithmScoreBatchHandler(
  dependencies: Partial<BatchDependencies> = {}
) {
  // If a caller injects its own assembleProfile/writeCachedEntryScore (as unit
  // tests do), honor it exactly as before — mocked assembly doesn't benefit
  // from prefetching, and tests assert on these hooks being called per item.
  // Otherwise (the real production path), use the batched prefetch + bulk
  // write below.
  const hasCustomAssembleProfile = typeof dependencies.assembleProfile === "function";
  const hasCustomWriteCachedEntryScore =
    typeof dependencies.writeCachedEntryScore === "function";

  const resolvedDependencies: BatchDependencies = {
    requireRequestAuth,
    loadEntryForScoring: defaultAlgorithmScoreDependencies.loadEntryForScoring,
    loadUserPreferenceEntries: defaultAlgorithmScoreDependencies.loadUserPreferenceEntries,
    assembleProfile: defaultAlgorithmScoreDependencies.assembleProfile,
    buildUserPreferenceVector,
    computeMatchScore,
    readCachedEntryScores,
    writeCachedEntryScore,
    writeCachedEntryScoresBulk,
    ...dependencies,
  };

  return async function POST(request: Request) {
    let auth: RequestAuthResult;
    try {
      auth = await resolvedDependencies.requireRequestAuth(request);
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      throw error;
    }

    // Beta gate removed (PR #62 follow-up).
    void createPrivateBetaFeatureDeniedResponse;
    void userHasPrivateBetaFeatureAccess;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const payload = batchRequestSchema.safeParse(body);
    if (!payload.success) {
      return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
    }

    const [preferenceEntries, palateRecord] = await Promise.all([
      resolvedDependencies.loadUserPreferenceEntries(auth.supabase, auth.user.id),
      readPalateProfile(auth.supabase, auth.user.id).catch(() => null),
    ]);
    const preferenceCache = new Map<WineType, ReturnType<typeof buildUserPreferenceVector>>();
    const cachedScores = await resolvedDependencies.readCachedEntryScores(
      auth.supabase,
      auth.user.id,
      payload.data.items
        .filter((item) => !hasDirectScoreOverrides(item))
        .map((item) => item.entry_id)
        .filter((entryId): entryId is string => typeof entryId === "string")
    );

    // Phase 1: resolve every item's score input (loading entries as needed,
    // honoring the cache), without assembling a profile yet. This lets us
    // collect every distinct wine_type/vintage in the request before doing
    // any profile assembly work.
    const resolvedItems = await Promise.all(
      payload.data.items.map(async (item): Promise<ResolvedScoreItem> => {
        const requestId = item.request_id ?? item.entry_id ?? null;
        try {
          const cached = item.entry_id ? cachedScores.get(item.entry_id) ?? null : null;
          if (cached) {
            return {
              status: "result",
              result: {
                request_id: requestId,
                entry_id: item.entry_id ?? null,
                ok: true,
                data: cached,
                error: null,
              },
            };
          }

          let scoreInput = buildDirectInput(item);

          if (item.entry_id && !scoreInput.wine_type) {
            const loaded = await resolvedDependencies.loadEntryForScoring(
              auth.supabase,
              auth.user.id,
              item.entry_id
            );

            if (!loaded) {
              return {
                status: "result",
                result: {
                  request_id: requestId,
                  entry_id: item.entry_id,
                  ok: false,
                  data: null,
                  error: "Entry not found",
                },
              };
            }

            scoreInput = {
              wine_type: scoreInput.wine_type ?? loaded.wine_type,
              canonical_region: scoreInput.canonical_region ?? loaded.canonical_region,
              canonical_sub_region:
                scoreInput.canonical_sub_region ?? loaded.canonical_sub_region,
              canonical_country: scoreInput.canonical_country ?? loaded.canonical_country,
              primary_grapes: scoreInput.primary_grapes ?? loaded.primary_grapes,
              vintage: scoreInput.vintage ?? loaded.vintage,
              producer: scoreInput.producer ?? loaded.producer,
              classification: scoreInput.classification ?? loaded.classification,
              quality_tier:
                scoreInput.quality_tier ??
                scoreInput.classification ??
                loaded.quality_tier ??
                loaded.classification ??
                null,
            };
          }

          if (!scoreInput.wine_type) {
            return {
              status: "result",
              result: {
                request_id: requestId,
                entry_id: item.entry_id ?? null,
                ok: false,
                data: null,
                error: "Wine type is required to score this entry.",
              },
            };
          }

          return {
            status: "pending",
            item,
            requestId,
            scoreInput: { ...scoreInput, wine_type: scoreInput.wine_type },
          };
        } catch (error) {
          return {
            status: "result",
            result: {
              request_id: requestId,
              entry_id: item.entry_id ?? null,
              ok: false,
              data: null,
              error: error instanceof Error ? error.message : "Unable to score this entry.",
            },
          };
        }
      })
    );

    const pendingItems = resolvedItems.filter(
      (resolved): resolved is Extract<ResolvedScoreItem, { status: "pending" }> =>
        resolved.status === "pending"
    );

    // Phase 2: assemble profiles + compute scores. In production (no
    // assembleProfile override) prefetch every reference table once for the
    // distinct wine_type/vintage combinations in this request instead of
    // letting assembleProfile() issue its own ~8 Supabase reads per item.
    let assembleProfileForItem = resolvedDependencies.assembleProfile;

    if (!hasCustomAssembleProfile && pendingItems.length > 0) {
      const uniqueWineTypes = Array.from(
        new Set(pendingItems.map((pending) => pending.scoreInput.wine_type))
      );
      const uniqueVintages = Array.from(
        new Set(
          pendingItems
            .map((pending) => pending.scoreInput.vintage)
            .filter((vintage): vintage is number => typeof vintage === "number")
        )
      );

      const referenceSupabase = createSupabaseAdminClient();
      const prefetchedData = await batchPrefetchProfileData(
        createSupabaseProfileAssemblyDataSource(referenceSupabase),
        uniqueWineTypes,
        uniqueVintages
      );
      const prefetchedDataSource = createPreFetchedProfileDataSource(prefetchedData);
      assembleProfileForItem = (input: AssembleWineProfileInput): Promise<EffectiveWineProfile> =>
        assembleWineProfileWithDataSource(input, prefetchedDataSource);
    }

    const cacheWrites: Array<{ entryId: string; payload: ReturnType<typeof buildAlgorithmScoreResponse> }> = [];

    const finalResults = await Promise.all(
      resolvedItems.map(async (resolved): Promise<AlgorithmBatchResult> => {
        if (resolved.status === "result") {
          return resolved.result;
        }

        const { item, requestId, scoreInput } = resolved;

        try {
          const effectiveProfile = await assembleProfileForItem({
            wine_type: scoreInput.wine_type,
            canonical_region: scoreInput.canonical_region,
            canonical_sub_region: scoreInput.canonical_sub_region,
            canonical_country: scoreInput.canonical_country,
            primary_grapes: scoreInput.primary_grapes,
            vintage: scoreInput.vintage,
            producer: scoreInput.producer,
            classification: scoreInput.classification,
            quality_tier: scoreInput.quality_tier,
          });

          const userPreference =
            preferenceCache.get(scoreInput.wine_type) ??
            resolvedDependencies.buildUserPreferenceVector(
              preferenceEntries,
              scoreInput.wine_type,
              palateRecord
                ? distilledSeedForWineType(palateRecord, scoreInput.wine_type)
                : null
            );

          if (!preferenceCache.has(scoreInput.wine_type)) {
            preferenceCache.set(scoreInput.wine_type, userPreference);
          }

          const match = resolvedDependencies.computeMatchScore(
            effectiveProfile,
            userPreference
          );

          const responsePayload = buildAlgorithmScoreResponse({
            effectiveProfile,
            match,
            preferenceEventCount: userPreference.event_count,
          });

          if (item.entry_id && !hasDirectScoreOverrides(item)) {
            if (hasCustomWriteCachedEntryScore) {
              await resolvedDependencies.writeCachedEntryScore(
                auth.supabase,
                auth.user.id,
                item.entry_id,
                responsePayload
              );
            } else {
              cacheWrites.push({ entryId: item.entry_id, payload: responsePayload });
            }
          }

          return {
            request_id: requestId,
            entry_id: item.entry_id ?? null,
            ok: true,
            data: responsePayload,
            error: null,
          };
        } catch (error) {
          return {
            request_id: requestId,
            entry_id: item.entry_id ?? null,
            ok: false,
            data: null,
            error: error instanceof Error ? error.message : "Unable to score this entry.",
          };
        }
      })
    );

    if (cacheWrites.length > 0) {
      await resolvedDependencies.writeCachedEntryScoresBulk(
        auth.supabase,
        auth.user.id,
        cacheWrites
      );
    }

    return NextResponse.json({ results: finalResults });
  };
}
