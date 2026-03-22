import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import type { AlgorithmScoreResponse } from "@/lib/algorithm/api";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MIN_DISPLAY_CONFIDENCE } from "@/server/algorithm/constants";
import { assembleWineProfile } from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import type {
  AssembleWineProfileInput,
  EffectiveWineProfile,
} from "@/server/algorithm/types";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import {
  readCachedEntryScore,
  writeCachedEntryScore,
} from "@/server/algorithm/scoreCache";
import {
  RequestAuthError,
  requireRequestAuth,
} from "@/server/auth/requestAuth";
import { executeSelectWithFallback } from "@/server/db/compat";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

export type RequestAuthResult = Awaited<ReturnType<typeof requireRequestAuth>>;
export type RequestSupabaseClient = RequestAuthResult["supabase"];

export type LoadedEntryForScoring = Omit<AssembleWineProfileInput, "wine_type"> & {
  wine_type: WineType | null;
};

type EntryRowWithCanonicalFields = {
  id: string;
  user_id: string;
  wine_type: WineType | null;
  canonical_region: string | null;
  canonical_sub_region: string | null;
  canonical_country: string | null;
  producer: string | null;
  classification: string | null;
  quality_tier: string | null;
  vintage: string | null;
};

type EntryRowFallback = {
  id: string;
  user_id: string;
  producer: string | null;
  classification: string | null;
  vintage: string | null;
  region: string | null;
  appellation: string | null;
  country: string | null;
};

type PreferenceEntryRow = {
  id: string;
  rating: number | null;
  advanced_notes: unknown;
  wine_type?: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
};

type AlgorithmScoreHandlerDependencies = {
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
  assembleProfile: (input: AssembleWineProfileInput) => Promise<EffectiveWineProfile>;
  buildUserPreferenceVector: typeof buildUserPreferenceVector;
  computeMatchScore: typeof computeMatchScore;
  readCachedEntryScore: typeof readCachedEntryScore;
  writeCachedEntryScore: typeof writeCachedEntryScore;
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

const scoreRequestSchema = z
  .object({
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
    const hasDirectWineType = typeof value.wine_type === "string";

    if (!hasEntryId && !hasDirectWineType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either entry_id or direct wine fields including wine_type.",
        path: ["wine_type"],
      });
    }
  });

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

export async function defaultLoadEntryForScoring(
  supabase: RequestSupabaseClient,
  userId: string,
  entryId: string
): Promise<LoadedEntryForScoring | null> {
  const entrySelectAttempts = [
    {
      fields:
        "id, user_id, wine_type, canonical_region, canonical_sub_region, canonical_country, producer, classification, quality_tier, vintage",
      includesWineType: true,
      missingColumns: [
        "wine_type",
        "canonical_region",
        "canonical_sub_region",
        "canonical_country",
        "quality_tier",
      ] as const,
    },
    {
      fields: "id, user_id, producer, classification, vintage, region, appellation, country",
      includesWineType: false,
      missingColumns: [] as const,
    },
  ] as const;

  const result = await executeSelectWithFallback({
    attempts: entrySelectAttempts,
    getFallbackColumns: (attempt) => attempt.missingColumns,
    fallbackOnAnyMissingColumn: false,
    attempt: async (attempt) => {
      const response = await supabase
        .from("wine_entries")
        .select(attempt.fields)
        .eq("id", entryId)
        .eq("user_id", userId)
        .maybeSingle();
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    return null;
  }

  const primaryGrapeMap = await fetchPrimaryGrapesByEntryId(supabase, [entryId]);
  const primaryGrapes = primaryGrapeMap.get(entryId)?.map((grape) => grape.name).join(", ") ?? null;

  if (result.usedAttempt?.includesWineType) {
    const row = result.data as unknown as EntryRowWithCanonicalFields;
    return {
      wine_type: isWineType(row.wine_type) ? row.wine_type : null,
      canonical_region: row.canonical_region ?? null,
      canonical_sub_region: row.canonical_sub_region ?? null,
      canonical_country: row.canonical_country ?? null,
      primary_grapes: primaryGrapes,
      vintage: row.vintage ? Number.parseInt(row.vintage, 10) || null : null,
      producer: row.producer ?? null,
      classification: row.classification ?? null,
      quality_tier: row.quality_tier ?? row.classification ?? null,
    };
  }

  const row = result.data as unknown as EntryRowFallback;
  return {
    wine_type: null,
    canonical_region: row.region ?? null,
    canonical_sub_region: row.appellation ?? null,
    canonical_country: row.country ?? null,
    primary_grapes: primaryGrapes,
    vintage: row.vintage ? Number.parseInt(row.vintage, 10) || null : null,
    producer: row.producer ?? null,
    classification: row.classification ?? null,
    quality_tier: row.classification ?? null,
  };
}

export async function defaultLoadUserPreferenceEntries(
  supabase: RequestSupabaseClient,
  userId: string
): Promise<PreferenceSourceEntry[]> {
  const selectAttempts = [
    {
      fields:
        "id, rating, advanced_notes, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country",
      includesWineType: true,
      missingColumns: [
        "wine_type",
        "canonical_region",
        "canonical_sub_region",
        "canonical_country",
      ] as const,
    },
    {
      fields: "id, rating, advanced_notes, region, appellation, country",
      includesWineType: false,
      missingColumns: [] as const,
    },
  ] as const;

  const result = await executeSelectWithFallback({
    attempts: selectAttempts,
    getFallbackColumns: (attempt) => attempt.missingColumns,
    attempt: async (attempt) => {
      const response = await supabase
        .from("wine_entries")
        .select(attempt.fields)
        .eq("user_id", userId)
        .not("rating", "is", null);
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const rows = ((result.data ?? []) as unknown) as PreferenceEntryRow[];
  const grapeMap = await fetchPrimaryGrapesByEntryId(
    supabase as unknown as Parameters<typeof fetchPrimaryGrapesByEntryId>[0],
    rows.map((row) => row.id)
  );

  return rows.map((row) => ({
    rating: row.rating ?? null,
    advanced_notes: normalizeAdvancedNotes(row.advanced_notes),
    wine_type: isWineType(row.wine_type) ? row.wine_type : null,
    canonical_region: row.canonical_region ?? row.region ?? null,
    canonical_sub_region: row.canonical_sub_region ?? row.appellation ?? null,
    canonical_country: row.canonical_country ?? row.country ?? null,
    region: row.region ?? null,
    appellation: row.appellation ?? null,
    country: row.country ?? null,
    primary_grapes:
      grapeMap.get(row.id)?.map((grape) => grape.name).join(", ") ?? null,
  }));
}

export const defaultAlgorithmScoreDependencies: AlgorithmScoreHandlerDependencies = {
  requireRequestAuth,
  loadEntryForScoring: defaultLoadEntryForScoring,
  loadUserPreferenceEntries: defaultLoadUserPreferenceEntries,
  async assembleProfile(input) {
    const referenceSupabase = createSupabaseAdminClient();
    return assembleWineProfile(input, referenceSupabase);
  },
  buildUserPreferenceVector,
  computeMatchScore,
  readCachedEntryScore,
  writeCachedEntryScore,
};

export function buildDirectInput(
  payload: z.infer<typeof scoreRequestSchema>
): LoadedEntryForScoring {
  return {
    wine_type: payload.wine_type ?? null,
    canonical_region: payload.canonical_region ?? null,
    canonical_sub_region: payload.canonical_sub_region ?? null,
    canonical_country: payload.canonical_country ?? null,
    primary_grapes: payload.primary_grapes ?? null,
    vintage: payload.vintage ?? null,
    producer: payload.producer ?? null,
    classification: payload.classification ?? null,
    quality_tier: payload.quality_tier ?? payload.classification ?? null,
  };
}

export function hasDirectScoreOverrides(
  payload: z.infer<typeof scoreRequestSchema>
) {
  return [
    payload.wine_type,
    payload.canonical_region,
    payload.canonical_sub_region,
    payload.canonical_country,
    payload.primary_grapes,
    payload.vintage,
    payload.producer,
    payload.classification,
    payload.quality_tier,
  ].some((value) => value !== undefined);
}

export function buildAlgorithmScoreResponse(params: {
  effectiveProfile: EffectiveWineProfile;
  match: ReturnType<typeof computeMatchScore>;
  preferenceEventCount: number;
}): AlgorithmScoreResponse {
  return {
    score: Math.round(params.match.score),
    band: params.match.band,
    confidence: params.match.confidence,
    balance_factor: params.match.balance_factor,
    age_factor: params.match.age_factor,
    enjoyment_factor: params.match.enjoyment_factor,
    pre_balance_score: params.match.pre_balance_score,
    effective_profile: params.effectiveProfile,
    axis_contributions: params.match.axis_contributions,
    modifiers_applied: params.effectiveProfile.metadata.modifiers_applied,
    display_score: params.match.confidence >= MIN_DISPLAY_CONFIDENCE,
    confidence_warning:
      params.match.confidence >= MIN_DISPLAY_CONFIDENCE
        ? null
        : "Confidence is below the display threshold for this score.",
    preference_event_count: params.preferenceEventCount,
  };
}

export function createAlgorithmScoreHandler(
  dependencies: Partial<AlgorithmScoreHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultAlgorithmScoreDependencies,
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

    if (!(await userHasPrivateBetaFeatureAccess(auth.supabase, auth.user))) {
      return createPrivateBetaFeatureDeniedResponse();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const payload = scoreRequestSchema.safeParse(body);
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.flatten() },
        { status: 400 }
      );
    }

    const directInput = buildDirectInput(payload.data);
    const hasOverrides = hasDirectScoreOverrides(payload.data);
    let scoreInput = directInput;
    const cacheEntryId =
      payload.data.entry_id && !hasOverrides ? payload.data.entry_id : null;

    if (cacheEntryId) {
      const cached = await resolvedDependencies.readCachedEntryScore(
        auth.supabase,
        auth.user.id,
        cacheEntryId
      );
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    if (payload.data.entry_id) {
      const loaded = await resolvedDependencies.loadEntryForScoring(
        auth.supabase,
        auth.user.id,
        payload.data.entry_id
      );

      if (!loaded) {
        console.warn(
          `[score/handler] Entry not found for user: ${auth.user.id}, entry_id: ${payload.data.entry_id}`
        );
        return NextResponse.json(
          { error: "This entry could not be found or is not accessible to you." },
          { status: 404 }
        );
      }

      scoreInput = {
        wine_type: directInput.wine_type ?? loaded.wine_type,
        canonical_region: directInput.canonical_region ?? loaded.canonical_region,
        canonical_sub_region:
          directInput.canonical_sub_region ?? loaded.canonical_sub_region,
        canonical_country: directInput.canonical_country ?? loaded.canonical_country,
        primary_grapes: directInput.primary_grapes ?? loaded.primary_grapes,
        vintage: directInput.vintage ?? loaded.vintage,
        producer: directInput.producer ?? loaded.producer,
        classification: directInput.classification ?? loaded.classification,
        quality_tier:
          directInput.quality_tier ??
          directInput.classification ??
          loaded.quality_tier ??
          loaded.classification ??
          null,
      };
    }

    if (!scoreInput.wine_type) {
      return NextResponse.json(
        {
          error:
            "Wine type is required to score this entry. Use direct fields or ensure canonical wine_type is populated.",
        },
        { status: 400 }
      );
    }

    const effectiveProfile = await resolvedDependencies.assembleProfile({
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

    const preferenceEntries =
      await resolvedDependencies.loadUserPreferenceEntries(
        auth.supabase,
        auth.user.id
      );
    const userPreference = resolvedDependencies.buildUserPreferenceVector(
      preferenceEntries,
      scoreInput.wine_type
    );
    const match = resolvedDependencies.computeMatchScore(
      effectiveProfile,
      userPreference
    );

    const responsePayload = buildAlgorithmScoreResponse({
      effectiveProfile,
      match,
      preferenceEventCount: userPreference.event_count,
    });

    if (cacheEntryId) {
      await resolvedDependencies.writeCachedEntryScore(
        auth.supabase,
        auth.user.id,
        cacheEntryId,
        responsePayload
      );
    }

    return NextResponse.json(responsePayload);
  };
}
