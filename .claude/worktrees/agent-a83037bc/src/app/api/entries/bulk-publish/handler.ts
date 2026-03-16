import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  entry_ids: z.array(z.string().uuid()).min(1).max(250),
});

function isMissingFeedVisibilityColumn(message: string) {
  return (
    message.includes("is_feed_visible") ||
    message.includes("entry_group") ||
    message.includes("column") ||
    message.includes("schema")
  );
}

export function createBulkPublishHandler(
  dependencies: {
    createSupabaseServerClient?: typeof createSupabaseServerClient;
  } = {}
) {
  const createClient =
    dependencies.createSupabaseServerClient ?? createSupabaseServerClient;

  return async function POST(request: Request) {
    const supabase = await createClient();
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

    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid entry IDs" }, { status: 400 });
    }

    const entryIds = Array.from(new Set(parsed.data.entry_ids));

    const { data: entries, error: fetchEntriesError } = await supabase
      .from("wine_entries")
      .select("id, entry_group_id")
      .in("id", entryIds)
      .eq("user_id", user.id);

    if (fetchEntriesError) {
      const message = fetchEntriesError.message ?? "Unable to load entries.";
      if (isMissingFeedVisibilityColumn(message)) {
        return NextResponse.json({ success: true, updated_ids: [] });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const groupedEntryRows = (entries ?? []).filter(
      (entry) =>
        typeof entry.entry_group_id === "string" && entry.entry_group_id.length > 0
    );
    const standaloneEntryIds = (entries ?? [])
      .filter(
        (entry) =>
          !(
            typeof entry.entry_group_id === "string" && entry.entry_group_id.length > 0
          )
      )
      .map((entry) => entry.id);
    const groupedEntryIds = groupedEntryRows.map((entry) => entry.id);
    const groupedIds = Array.from(
      new Set(
        groupedEntryRows.map((entry) => entry.entry_group_id).filter(
          (groupId): groupId is string =>
            typeof groupId === "string" && groupId.length > 0
        )
      )
    );

    const updatedIds: string[] = [];

    if (standaloneEntryIds.length > 0) {
      const updateAttempt = await supabase
        .from("wine_entries")
        .update({ is_feed_visible: true })
        .in("id", standaloneEntryIds)
        .eq("user_id", user.id)
        .select("id");

      if (updateAttempt.error) {
        return NextResponse.json({ error: updateAttempt.error.message }, { status: 500 });
      }

      updatedIds.push(
        ...(updateAttempt.data ?? [])
          .map((row) => (row as { id?: unknown }).id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      );
    }

    if (groupedIds.length > 0) {
      const { data: groups, error: fetchGroupsError } = await supabase
        .from("entry_groups")
        .select("id, anchor_entry_id")
        .in("id", groupedIds)
        .eq("user_id", user.id);

      if (fetchGroupsError) {
        return NextResponse.json({ error: fetchGroupsError.message }, { status: 500 });
      }

      if (groupedEntryIds.length > 0) {
        const { error: hideGroupedError } = await supabase
          .from("wine_entries")
          .update({ is_feed_visible: false })
          .in("id", groupedEntryIds)
          .eq("user_id", user.id);

        if (hideGroupedError) {
          return NextResponse.json({ error: hideGroupedError.message }, { status: 500 });
        }
      }

      const anchorEntryIds = Array.from(
        new Set(
          (groups ?? [])
            .map((group) => group.anchor_entry_id)
            .filter(
              (entryId): entryId is string =>
                typeof entryId === "string" && entryId.length > 0
            )
        )
      );

      if (anchorEntryIds.length > 0) {
        const { data: anchorUpdates, error: anchorUpdateError } = await supabase
          .from("wine_entries")
          .update({ is_feed_visible: true })
          .in("id", anchorEntryIds)
          .eq("user_id", user.id)
          .select("id");

        if (anchorUpdateError) {
          return NextResponse.json({ error: anchorUpdateError.message }, { status: 500 });
        }

        updatedIds.push(
          ...(anchorUpdates ?? [])
            .map((row) => (row as { id?: unknown }).id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        );
      }
    }

    return NextResponse.json({ success: true, updated_ids: updatedIds });
  };
}
