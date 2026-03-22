import { NextResponse } from "next/server";
import { isMissingDbColumnError } from "@/lib/supabase/errors";
import { normalizeProducerText, normalizeWineNameText } from "@/lib/wineText";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import {
  fetchPrimaryGrapesByEntryId,
  normalizePrimaryGrapeIds,
} from "@/lib/primaryGrapes";
import { resolveGroupedPostData } from "@/server/entries/groupPosts";
import { updateEntrySchema } from "@/server/entries/schema";
import { executeWithColumnFallback } from "@/server/db/compat";
import { resolvePersistedEntryRating } from "@/server/entries/updateValidation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { persistEntryResolution } from "@/server/algorithm/persistEntryResolution";
import { isValidWineType } from "@/server/algorithm/resolver";
import { invalidateUserScoreCache } from "@/server/algorithm/scoreCache";
import { refreshRecentUserScoreCache } from "@/server/algorithm/cacheRefresh";

function isPrimaryGrapeSchemaMissing(message: string) {
  return (
    message.includes("grape_varieties") ||
    message.includes("grape_aliases") ||
    message.includes("entry_primary_grapes")
  );
}

function isMissingGroupedPostSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("entry_group") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("does not exist")
  );
}

const ENTRY_OPTIONAL_UPDATE_COLUMNS = [
  "classification",
  "is_feed_visible",
  "location_place_id",
  "comments_scope",
  "reaction_privacy",
  "comments_privacy",
] as const;

type EntryPutHandlerDependencies = {
  createSupabaseServerClient: typeof createSupabaseServerClient;
  executeWithColumnFallback: typeof executeWithColumnFallback;
  fetchPrimaryGrapesByEntryId: typeof fetchPrimaryGrapesByEntryId;
  persistEntryResolution: typeof persistEntryResolution;
};

const defaultEntryPutHandlerDependencies: EntryPutHandlerDependencies = {
  createSupabaseServerClient,
  executeWithColumnFallback,
  fetchPrimaryGrapesByEntryId,
  persistEntryResolution,
};

export function createEntryPutHandler(
  dependencies: Partial<EntryPutHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultEntryPutHandlerDependencies,
    ...dependencies,
  };

  return async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;

    const supabase = await resolvedDependencies.createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const payload = updateEntrySchema.safeParse(body);
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.flatten() },
        { status: 400 }
      );
    }

    const normalizedData = {
      ...payload.data,
      wine_name:
        payload.data.wine_name === undefined
          ? undefined
          : payload.data.wine_name === null
            ? null
            : normalizeWineNameText(payload.data.wine_name) ??
              payload.data.wine_name,
      producer:
        payload.data.producer === undefined
          ? undefined
          : normalizeProducerText(payload.data.producer),
      advanced_notes:
        payload.data.advanced_notes === undefined
          ? undefined
          : normalizeAdvancedNotes(payload.data.advanced_notes),
    };

    const primaryGrapeIds =
      normalizedData.primary_grape_ids === undefined
        ? undefined
        : normalizePrimaryGrapeIds(normalizedData.primary_grape_ids);
    const entryGroupMode = normalizedData.entry_group_mode;
    const entryGroupTitle = normalizedData.entry_group_title;
    const syncGroupConsumedAt = normalizedData.sync_group_consumed_at === true;
    const entryFieldUpdates = { ...normalizedData };
    delete entryFieldUpdates.primary_grape_ids;
    delete entryFieldUpdates.entry_group_mode;
    delete entryFieldUpdates.entry_group_title;
    delete entryFieldUpdates.sync_group_consumed_at;

    const updates = Object.fromEntries(
      Object.entries(entryFieldUpdates).filter(([, value]) => value !== undefined)
    );

    const hasGroupUpdates =
      entryGroupMode !== undefined ||
      entryGroupTitle !== undefined ||
      syncGroupConsumedAt;

    if (
      Object.keys(updates).length === 0 &&
      primaryGrapeIds === undefined &&
      !hasGroupUpdates
    ) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    const { data: targetEntry, error: targetEntryError } = await supabase
      .from("wine_entries")
      .select("id, user_id, rating, entry_group_id")
      .eq("id", id)
      .maybeSingle();

    if (targetEntryError) {
      return NextResponse.json(
        { error: targetEntryError.message },
        { status: 500 }
      );
    }

    if (!targetEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (targetEntry.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const persistedRating = resolvePersistedEntryRating({
      existingRating: targetEntry.rating,
      nextRating: payload.data.rating,
    });
    if (persistedRating === null) {
      return NextResponse.json(
        {
          error: {
            formErrors: [],
            fieldErrors: {
              rating: ["Rating required."],
            },
          },
        },
        { status: 400 }
      );
    }

    let updatedEntry: ({ id: string } & Record<string, unknown>) | null = null;

    if (Object.keys(updates).length > 0) {
      const updateResult = await resolvedDependencies.executeWithColumnFallback({
        initialPayload: updates,
        removableColumns: ENTRY_OPTIONAL_UPDATE_COLUMNS,
        maxAttempts: 3,
        attempt: async (payloadToApply) => {
          if (Object.keys(payloadToApply).length === 0) {
            const existingEntry = await supabase
              .from("wine_entries")
              .select("*")
              .eq("id", id)
              .eq("user_id", user.id)
              .maybeSingle();
            return {
              data: existingEntry.data,
              error: existingEntry.error,
            };
          }

          const updateAttempt = await supabase
            .from("wine_entries")
            .update(payloadToApply)
            .eq("id", id)
            .eq("user_id", user.id)
            .select("*")
            .maybeSingle();

          return {
            data: updateAttempt.data,
            error: updateAttempt.error,
          };
        },
      });
      const data = updateResult.data;
      const error = updateResult.error;

      if (!error && !data) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }

      if (error || !data) {
        if (error && isMissingDbColumnError(error, "advanced_notes")) {
          return NextResponse.json(
            {
              error:
                "Advanced notes are temporarily unavailable. Please try again later. (ADVANCED_NOTES_UNAVAILABLE)",
              code: "ADVANCED_NOTES_UNAVAILABLE",
            },
            { status: 503 }
          );
        }
        if (
          error?.message.includes(
            "wine_entries_price_source_requires_price_check"
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Price paid, currency, and source must be set together. Select a currency and retail/restaurant when entering a price.",
            },
            { status: 400 }
          );
        }
        if (
          (error && isMissingDbColumnError(error, "price_paid")) ||
          (error && isMissingDbColumnError(error, "price_paid_currency")) ||
          (error && isMissingDbColumnError(error, "price_paid_source")) ||
          (error && isMissingDbColumnError(error, "qpr_level"))
        ) {
          return NextResponse.json(
            {
              error:
                "Entry pricing and QPR are temporarily unavailable. Please try again later. (ENTRY_PRICING_UNAVAILABLE)",
              code: "ENTRY_PRICING_UNAVAILABLE",
            },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: error?.message ?? "Update failed" },
          { status: 500 }
        );
      }

      updatedEntry = data;
    } else {
      const { data, error } = await supabase
        .from("wine_entries")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }

      updatedEntry = data;
    }

    if (primaryGrapeIds !== undefined) {
      let primaryGrapeSchemaAvailable = true;

      if (primaryGrapeIds.length > 0) {
        const { data: grapeRows, error: grapeLookupError } = await supabase
          .from("grape_varieties")
          .select("id")
          .in("id", primaryGrapeIds);

        if (grapeLookupError) {
          if (isPrimaryGrapeSchemaMissing(grapeLookupError.message)) {
            primaryGrapeSchemaAvailable = false;
          } else {
            return NextResponse.json(
              { error: grapeLookupError.message },
              { status: 500 }
            );
          }
        } else {
          const validGrapeIds = new Set((grapeRows ?? []).map((row) => row.id));
          if (validGrapeIds.size !== primaryGrapeIds.length) {
            return NextResponse.json(
              { error: "One or more selected primary grapes are invalid." },
              { status: 400 }
            );
          }
        }
      }

      if (primaryGrapeSchemaAvailable) {
        const { error: deletePrimaryGrapesError } = await supabase
          .from("entry_primary_grapes")
          .delete()
          .eq("entry_id", id);

        if (deletePrimaryGrapesError) {
          if (isPrimaryGrapeSchemaMissing(deletePrimaryGrapesError.message)) {
            primaryGrapeSchemaAvailable = false;
          } else {
            return NextResponse.json(
              { error: deletePrimaryGrapesError.message },
              { status: 500 }
            );
          }
        }
      }

      if (primaryGrapeSchemaAvailable && primaryGrapeIds.length > 0) {
        const { error: insertPrimaryGrapesError } = await supabase
          .from("entry_primary_grapes")
          .insert(
            primaryGrapeIds.map((varietyId, index) => ({
              entry_id: id,
              variety_id: varietyId,
              position: index + 1,
            }))
          );

        if (insertPrimaryGrapesError) {
          if (isPrimaryGrapeSchemaMissing(insertPrimaryGrapesError.message)) {
            // Ignore if migration is not installed yet; entry updates should still succeed.
          } else {
            return NextResponse.json(
              { error: insertPrimaryGrapesError.message },
              { status: 500 }
            );
          }
        }
      }
    }

    const targetEntryGroupId =
      typeof targetEntry.entry_group_id === "string" &&
      targetEntry.entry_group_id.length > 0
        ? targetEntry.entry_group_id
        : null;

    if (hasGroupUpdates && !targetEntryGroupId) {
      return NextResponse.json(
        { error: "This entry is not part of a grouped bulk post." },
        { status: 400 }
      );
    }

    if (targetEntryGroupId && (entryGroupMode !== undefined || entryGroupTitle !== undefined)) {
      const groupUpdatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (entryGroupMode !== undefined) {
        groupUpdatePayload.mode = entryGroupMode;
      }
      if (entryGroupTitle !== undefined) {
        groupUpdatePayload.title = entryGroupTitle;
      }

      const { error: groupUpdateError } = await supabase
        .from("entry_groups")
        .update(groupUpdatePayload)
        .eq("id", targetEntryGroupId)
        .eq("user_id", user.id);

      if (groupUpdateError) {
        if (isMissingGroupedPostSchemaError(groupUpdateError.message)) {
          return NextResponse.json(
            {
              error:
                "Grouped bulk posts are unavailable until `supabase/sql/045_entry_groups.sql` is applied.",
              code: "ENTRY_GROUPS_UNAVAILABLE",
            },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: groupUpdateError.message },
          { status: 500 }
        );
      }
    }

    if (targetEntryGroupId && syncGroupConsumedAt && typeof updates.consumed_at === "string") {
      const { error: syncConsumedAtError } = await supabase
        .from("wine_entries")
        .update({ consumed_at: updates.consumed_at })
        .eq("entry_group_id", targetEntryGroupId)
        .eq("user_id", user.id);

      if (syncConsumedAtError) {
        if (isMissingGroupedPostSchemaError(syncConsumedAtError.message)) {
          return NextResponse.json(
            {
              error:
                "Grouped bulk posts are unavailable until `supabase/sql/045_entry_groups.sql` is applied.",
              code: "ENTRY_GROUPS_UNAVAILABLE",
            },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: syncConsumedAtError.message },
          { status: 500 }
        );
      }
    }

    if (!updatedEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const primaryGrapesByEntryId =
      await resolvedDependencies.fetchPrimaryGrapesByEntryId(supabase, [id]);
    const currentPrimaryGrapes = primaryGrapesByEntryId.get(id) ?? [];
    const shouldRerunResolution =
      primaryGrapeIds !== undefined ||
      ["region", "producer", "classification", "wine_type", "country"].some(
        (field) => Object.prototype.hasOwnProperty.call(updates, field)
      );

    if (shouldRerunResolution) {
      try {
        const currentWineType =
          typeof updatedEntry.wine_type === "string" ? updatedEntry.wine_type : null;
        const persistedResolution = await resolvedDependencies.persistEntryResolution({
          supabase,
          entryId: id,
          userId: user.id,
          input: {
            region:
              typeof updatedEntry.region === "string" ? updatedEntry.region : null,
            producer:
              typeof updatedEntry.producer === "string" ? updatedEntry.producer : null,
            classification:
              typeof updatedEntry.classification === "string"
                ? updatedEntry.classification
                : null,
            wine_type: isValidWineType(currentWineType) ? currentWineType : null,
            country:
              typeof updatedEntry.country === "string" ? updatedEntry.country : null,
            primary_grapes: currentPrimaryGrapes
              .map((grape) => grape.name)
              .filter((name): name is string => typeof name === "string" && name.trim().length > 0),
            varietal: currentPrimaryGrapes[0]?.name ?? null,
          },
        });

        if (persistedResolution.entry) {
          updatedEntry = persistedResolution.entry;
        }
      } catch {
        // Resolution is best-effort and should not block entry updates.
      }
    }

    const groupedPostData = await resolveGroupedPostData(supabase, [
      {
        id,
        entry_group_id:
          typeof ((updatedEntry as unknown as { entry_group_id?: unknown }).entry_group_id) === "string"
            ? ((updatedEntry as unknown as { entry_group_id: string }).entry_group_id as string)
            : null,
      },
    ]);
    const groupedPost = groupedPostData.get(id);

    try {
      await invalidateUserScoreCache(supabase, user.id);
      await refreshRecentUserScoreCache(supabase, user.id);
    } catch {
      // Cache refresh is best-effort and should not block entry updates.
    }

    return NextResponse.json({
      entry: groupedPost
        ? {
            ...updatedEntry,
            primary_grapes: primaryGrapesByEntryId.get(id) ?? [],
            entry_group: groupedPost.entry_group,
            group_slides: groupedPost.group_slides,
          }
        : {
            ...updatedEntry,
            primary_grapes: primaryGrapesByEntryId.get(id) ?? [],
          },
    });
  };
}
