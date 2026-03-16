import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { entryGroupModeSchema } from "@/server/entries/schema";

const entryGroupSlideSchema = z.object({
  entry_id: z.string().uuid().nullable().optional(),
  photo_type: z.enum([
    "label",
    "place",
    "people",
    "pairing",
    "lineup",
    "other_bottles",
  ]),
  path: z.string().min(1),
});

const payloadSchema = z.object({
  anchor_entry_id: z.string().uuid(),
  entry_ids: z.array(z.string().uuid()).min(1).max(250),
  mode: entryGroupModeSchema,
  title: z.string().trim().min(1).max(120),
  slides: z.array(entryGroupSlideSchema).min(1).max(250),
});

function isMissingGroupedPostSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("entry_group") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("does not exist")
  );
}

export function createBulkGroupHandler(
  dependencies: {
    createSupabaseServerClient?: typeof createSupabaseServerClient;
    requireRequestAuth?: typeof requireRequestAuth;
  } = {}
) {
  const createClient =
    dependencies.createSupabaseServerClient ?? createSupabaseServerClient;
  const authenticateRequest =
    dependencies.requireRequestAuth ??
    (!dependencies.createSupabaseServerClient ? requireRequestAuth : null);

  return async function POST(request: Request) {
    let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    let user: Awaited<ReturnType<typeof requireRequestAuth>>["user"] | null | undefined;

    if (authenticateRequest) {
      try {
        const auth = await authenticateRequest(request);
        supabase = auth.supabase;
        user = auth.user;
      } catch (error) {
        if (error instanceof RequestAuthError) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        throw error;
      }
    } else {
      supabase = await createClient();
      const {
        data: { user: cookieUser },
      } = await supabase.auth.getUser();
      user = cookieUser;
    }

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
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const entryIds = Array.from(new Set(parsed.data.entry_ids));
    if (!entryIds.includes(parsed.data.anchor_entry_id)) {
      entryIds.unshift(parsed.data.anchor_entry_id);
    }

    const { data: ownedEntries, error: ownedEntriesError } = await supabase
      .from("wine_entries")
      .select("id")
      .in("id", entryIds)
      .eq("user_id", user.id);

    if (ownedEntriesError) {
      return NextResponse.json({ error: ownedEntriesError.message }, { status: 500 });
    }

    const ownedEntryIds = new Set((ownedEntries ?? []).map((entry) => entry.id));
    const hasAllEntries = entryIds.every((entryId) => ownedEntryIds.has(entryId));
    if (!hasAllEntries) {
      return NextResponse.json(
        { error: "One or more entries were not found." },
        { status: 404 }
      );
    }

    const { data: createdGroup, error: groupCreateError } = await supabase
      .from("entry_groups")
      .insert({
        user_id: user.id,
        mode: parsed.data.mode,
        title: parsed.data.title,
        anchor_entry_id: parsed.data.anchor_entry_id,
      })
      .select("id, mode, title, anchor_entry_id")
      .single();

    if (groupCreateError || !createdGroup) {
      const message = groupCreateError?.message ?? "Unable to create entry group.";
      if (isMissingGroupedPostSchemaError(message)) {
        return NextResponse.json(
          {
            error:
              "Grouped bulk posts are unavailable until `supabase/sql/045_entry_groups.sql` is applied.",
            code: "ENTRY_GROUPS_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { error: updateEntriesError } = await supabase
      .from("wine_entries")
      .update({
        entry_group_id: createdGroup.id,
        is_feed_visible: false,
      })
      .in("id", entryIds)
      .eq("user_id", user.id);

    if (updateEntriesError) {
      await supabase
        .from("entry_groups")
        .delete()
        .eq("id", createdGroup.id)
        .eq("user_id", user.id);
      return NextResponse.json({ error: updateEntriesError.message }, { status: 500 });
    }

    const slideRows = parsed.data.slides.map((slide, index) => ({
      group_id: createdGroup.id,
      entry_id: slide.entry_id ?? null,
      photo_type: slide.photo_type,
      path: slide.path,
      position: index,
    }));

    const { error: slideInsertError } = await supabase
      .from("entry_group_slides")
      .insert(slideRows);

    if (slideInsertError) {
      await supabase
        .from("wine_entries")
        .update({ entry_group_id: null })
        .in("id", entryIds);
      await supabase
        .from("entry_groups")
        .delete()
        .eq("id", createdGroup.id)
        .eq("user_id", user.id);
      return NextResponse.json({ error: slideInsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      group: {
        id: createdGroup.id,
        mode: createdGroup.mode,
        title: createdGroup.title,
        anchor_entry_id: createdGroup.anchor_entry_id,
      },
    });
  };
}
