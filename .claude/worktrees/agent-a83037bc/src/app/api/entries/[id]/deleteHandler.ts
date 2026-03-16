import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { invalidateUserScoreCache } from "@/server/algorithm/scoreCache";
import { refreshRecentUserScoreCache } from "@/server/algorithm/cacheRefresh";

function isMissingGroupedPostSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("entry_group") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("does not exist")
  );
}

type EntryDeleteHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createSupabaseAdminClient: typeof createSupabaseAdminClient;
};

const defaultEntryDeleteHandlerDependencies: EntryDeleteHandlerDependencies = {
  requireRequestAuth,
  createSupabaseAdminClient,
};

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
      .select("id, label_image_path, place_image_path, pairing_image_path, entry_group_id")
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
      ].filter((path): path is string => Boolean(path && path !== "pending")))
    );

    const existingEntryGroupId =
      typeof existing.entry_group_id === "string" && existing.entry_group_id.length > 0
        ? existing.entry_group_id
        : null;

    if (existingEntryGroupId) {
      const { data: currentGroup, error: currentGroupError } = await supabase
        .from("entry_groups")
        .select("id, anchor_entry_id")
        .eq("id", existingEntryGroupId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (currentGroupError && !isMissingGroupedPostSchemaError(currentGroupError.message)) {
        return NextResponse.json({ error: currentGroupError.message }, { status: 500 });
      }

      const groupExists = Boolean(currentGroup?.id);
      const isAnchor = currentGroup?.anchor_entry_id === id;

      if (groupExists && isAnchor) {
        const { data: remainingEntries, error: remainingEntriesError } = await supabase
          .from("wine_entries")
          .select("id")
          .eq("entry_group_id", existingEntryGroupId)
          .eq("user_id", user.id)
          .neq("id", id)
          .order("created_at", { ascending: true });

        if (remainingEntriesError) {
          return NextResponse.json(
            { error: remainingEntriesError.message },
            { status: 500 }
          );
        }

        const nextAnchorId = remainingEntries?.[0]?.id ?? null;
        if (nextAnchorId) {
          const siblingIds = (remainingEntries ?? []).map((entry) => entry.id);
          const hiddenSiblingIds = siblingIds.filter((entryId) => entryId !== nextAnchorId);

          const { error: nextAnchorError } = await supabase
            .from("wine_entries")
            .update({ is_feed_visible: true })
            .eq("id", nextAnchorId)
            .eq("user_id", user.id);

          if (nextAnchorError) {
            return NextResponse.json({ error: nextAnchorError.message }, { status: 500 });
          }

          if (hiddenSiblingIds.length > 0) {
            const { error: siblingHideError } = await supabase
              .from("wine_entries")
              .update({ is_feed_visible: false })
              .in("id", hiddenSiblingIds)
              .eq("user_id", user.id);

            if (siblingHideError) {
              return NextResponse.json(
                { error: siblingHideError.message },
                { status: 500 }
              );
            }
          }

          const { error: anchorUpdateError } = await supabase
            .from("entry_groups")
            .update({
              anchor_entry_id: nextAnchorId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingEntryGroupId)
            .eq("user_id", user.id);

          if (anchorUpdateError) {
            return NextResponse.json(
              { error: anchorUpdateError.message },
              { status: 500 }
            );
          }
        }
      }
    }

    const { error } = await deleteClient
      .from("wine_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existingEntryGroupId) {
      const { count: remainingGroupCount, error: remainingCountError } = await supabase
        .from("wine_entries")
        .select("id", { count: "exact", head: true })
        .eq("entry_group_id", existingEntryGroupId)
        .eq("user_id", user.id);

      if (remainingCountError) {
        return NextResponse.json(
          { error: remainingCountError.message },
          { status: 500 }
        );
      }

      if ((remainingGroupCount ?? 0) === 0) {
        const { error: deleteGroupError } = await supabase
          .from("entry_groups")
          .delete()
          .eq("id", existingEntryGroupId)
          .eq("user_id", user.id);

        if (deleteGroupError && !isMissingGroupedPostSchemaError(deleteGroupError.message)) {
          return NextResponse.json(
            { error: deleteGroupError.message },
            { status: 500 }
          );
        }
      }
    }

    if (paths.length > 0) {
      await deleteClient.storage.from("wine-photos").remove(paths);
    }

    try {
      await invalidateUserScoreCache(supabase, user.id);
      await refreshRecentUserScoreCache(supabase, user.id);
    } catch {
      // Cache refresh is best-effort and should not block entry deletion.
    }

    return NextResponse.json({ success: true });
  };
}
