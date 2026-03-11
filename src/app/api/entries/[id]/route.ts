import { NextResponse } from "next/server";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingDbColumnError } from "@/lib/supabase/errors";
import { normalizeProducerText, normalizeWineNameText } from "@/lib/wineText";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import {
  fetchPrimaryGrapesByEntryId,
  normalizePrimaryGrapeIds,
} from "@/lib/primaryGrapes";
import {
  canUserViewEntry,
  getAcceptedFriendIds,
  getBlockedEitherWayUserIds,
  getFriendsOfFriendsIds,
} from "@/lib/access/entryVisibility";
import { resolveInteractionAccessForViewer } from "@/lib/access/interactionVisibility";
import { updateEntrySchema } from "@/server/entries/schema";
import { executeWithColumnFallback } from "@/server/db/compat";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { resolvePersistedEntryRating } from "@/server/entries/updateValidation";
import { signPhotoUrl } from "@/server/storage/signedUrls";

function isPrimaryGrapeSchemaMissing(message: string) {
  return (
    message.includes("grape_varieties") ||
    message.includes("grape_aliases") ||
    message.includes("entry_primary_grapes")
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
};

type EntryDeleteHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createSupabaseAdminClient: typeof createSupabaseAdminClient;
};

const defaultEntryPutHandlerDependencies: EntryPutHandlerDependencies = {
  createSupabaseServerClient,
  executeWithColumnFallback,
  fetchPrimaryGrapesByEntryId,
};

const defaultEntryDeleteHandlerDependencies: EntryDeleteHandlerDependencies = {
  requireRequestAuth,
  createSupabaseAdminClient,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const needsVisibilityChecks = user.id !== data.user_id;
  const blockedUserIds = needsVisibilityChecks
    ? await getBlockedEitherWayUserIds(supabase, user.id)
    : undefined;
  const acceptedFriendIds = needsVisibilityChecks
    ? await getAcceptedFriendIds(supabase, user.id)
    : undefined;
  const friendsOfFriendsIds =
    needsVisibilityChecks && acceptedFriendIds
      ? await getFriendsOfFriendsIds(supabase, user.id, acceptedFriendIds)
      : undefined;

  try {
    const canView = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: data.user_id,
      entryPrivacy: data.entry_privacy,
      acceptedFriendIds,
      friendsOfFriendsIds,
      blockedUserIds,
    });
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (visibilityError) {
    const message =
      visibilityError instanceof Error
        ? visibilityError.message
        : "Unable to verify entry visibility.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const tastedWithIds = Array.isArray(data.tasted_with_user_ids)
    ? data.tasted_with_user_ids
    : [];
  let tastedWithUsers: { id: string; display_name: string | null; email: string | null }[] = [];

  if (tastedWithIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, first_name, last_name, email")
      .in("id", tastedWithIds);

    const nameMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        {
          display_name: getPublicProfileName(profile),
          email: null,
        },
      ])
    );

    tastedWithUsers = tastedWithIds.map((userId: string) => ({
      id: userId,
      display_name: nameMap.get(userId)?.display_name ?? null,
      email: nameMap.get(userId)?.email ?? null,
    }));
  }

  // If the viewer was tagged, check if they've already added this tasting to their cellar.
  let viewer_log_entry_id: string | null = null;
  const rootEntryIdFromRow =
    typeof (data as { root_entry_id?: unknown }).root_entry_id === "string"
      ? (data as { root_entry_id: string }).root_entry_id
      : null;
  const canonicalEntryId = rootEntryIdFromRow ?? data.id;
  const viewerIsTagged =
    data.user_id !== user.id && tastedWithIds.includes(user.id);

  if (viewerIsTagged && canonicalEntryId) {
    const { data: existingCopy, error: existingError } = await supabase
      .from("wine_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("root_entry_id", canonicalEntryId)
      .maybeSingle();

    if (!existingError && existingCopy?.id) {
      viewer_log_entry_id = existingCopy.id;
    }
  }

  // Reactions: counts, current user's reactions, and reactor display names.
  const reactionCounts: Record<string, number> = {};
  const myReactions: string[] = [];
  const reactionUsers: Record<string, string[]> = {};
  const reactorUserIds = new Set<string>();

  const { data: reactions } = await supabase
    .from("entry_reactions")
    .select("user_id, emoji")
    .eq("entry_id", id);

  (reactions ?? []).forEach((r: { user_id: string; emoji: string }) => {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1;
    reactorUserIds.add(r.user_id);
    if (r.user_id === user.id && !myReactions.includes(r.emoji)) {
      myReactions.push(r.emoji);
    }
    const list = reactionUsers[r.emoji] ?? [];
    if (!list.includes(r.user_id)) list.push(r.user_id);
    reactionUsers[r.emoji] = list;
  });

  // Resolve reactor user IDs to display names.
  const reactorIds = Array.from(reactorUserIds);
  if (reactorIds.length > 0) {
    const { data: reactorProfiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, first_name, last_name, email")
      .in("id", reactorIds);
    const reactorNameMap = new Map(
      (reactorProfiles ?? []).map((profile) => [
        profile.id as string,
        getPublicProfileName(profile),
      ])
    );
    for (const emoji of Object.keys(reactionUsers)) {
      reactionUsers[emoji] = reactionUsers[emoji].map(
        (uid) => reactorNameMap.get(uid) ?? "Unknown"
      );
    }
  }

  // Comment count (best-effort).
  let commentCount = 0;
  const { count: commentCountResult, error: commentCountError } = await supabase
    .from("entry_comments")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", id);
  if (!commentCountError && typeof commentCountResult === "number") {
    commentCount = commentCountResult;
  }

  const interactionAccess = await resolveInteractionAccessForViewer({
    supabase,
    viewerUserId: user.id,
    ownerUserId: data.user_id,
    entryPrivacy: data.entry_privacy,
    reactionPrivacy: data.reaction_privacy,
    commentsPrivacy: data.comments_privacy,
    commentsScope: data.comments_scope,
    acceptedFriendIds,
    friendsOfFriendsIds,
    blockedUserIds,
  });

  const entry = {
    ...data,
    primary_grapes:
      (await fetchPrimaryGrapesByEntryId(supabase, [data.id])).get(data.id) ?? [],
    label_image_url: await signPhotoUrl(data.label_image_path, supabase),
    place_image_url: await signPhotoUrl(data.place_image_path, supabase),
    pairing_image_url: await signPhotoUrl(data.pairing_image_path, supabase),
    tasted_with_users: tastedWithUsers,
    viewer_log_entry_id,
    reaction_counts: reactionCounts,
    my_reactions: myReactions,
    reaction_users: reactionUsers,
    comment_count: commentCount,
    reaction_privacy: interactionAccess.reactionPrivacy,
    comments_privacy: interactionAccess.commentsPrivacy,
    can_react: interactionAccess.canReact,
    can_comment: interactionAccess.canComment,
  };

  return NextResponse.json({ entry });
}

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
    const entryFieldUpdates = { ...normalizedData };
    delete entryFieldUpdates.primary_grape_ids;

    const updates = Object.fromEntries(
      Object.entries(entryFieldUpdates).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(updates).length === 0 && primaryGrapeIds === undefined) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    const { data: targetEntry, error: targetEntryError } = await supabase
      .from("wine_entries")
      .select("id, user_id, rating")
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

    const primaryGrapesByEntryId =
      await resolvedDependencies.fetchPrimaryGrapesByEntryId(supabase, [id]);

    if (!updatedEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({
      entry: {
        ...updatedEntry,
        primary_grapes: primaryGrapesByEntryId.get(id) ?? [],
      },
    });
  };
}

export const PUT = createEntryPutHandler();

export function createEntryDeleteHandler(
  dependencies: Partial<EntryDeleteHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultEntryDeleteHandlerDependencies,
    ...dependencies,
  };

  return async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;

    let auth;
    try {
      auth = await resolvedDependencies.requireRequestAuth(request);
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      const message =
        error instanceof Error ? error.message : "Unable to verify your session.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { supabase, user } = auth;
    let deleteClient = supabase;

    try {
      deleteClient =
        resolvedDependencies.createSupabaseAdminClient() as unknown as typeof supabase;
    } catch {
      // Fall back to the user-scoped client when admin credentials are unavailable.
    }

    const { data: existing, error: fetchError } = await supabase
      .from("wine_entries")
      .select("label_image_path, place_image_path, pairing_image_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const { data: photoRows, error: photoFetchError } = await deleteClient
      .from("entry_photos")
      .select("path")
      .eq("entry_id", id);

    if (photoFetchError) {
      return NextResponse.json({ error: photoFetchError.message }, { status: 500 });
    }

    const paths = Array.from(
      new Set([
        existing.label_image_path,
        existing.place_image_path,
        existing.pairing_image_path,
        ...(photoRows ?? []).map((photo) => photo.path),
      ].filter((p): p is string => Boolean(p && p !== "pending")))
    );

    const { error } = await deleteClient
      .from("wine_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (paths.length > 0) {
      await deleteClient.storage.from("wine-photos").remove(paths);
    }

    return NextResponse.json({ success: true });
  };
}

export const DELETE = createEntryDeleteHandler();
