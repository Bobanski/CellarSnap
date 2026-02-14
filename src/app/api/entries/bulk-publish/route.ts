import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  entry_ids: z.array(z.string().uuid()).min(1).max(250),
});

function isMissingFeedVisibilityColumn(message: string) {
  return (
    message.includes("is_feed_visible") ||
    message.includes("column") ||
    message.includes("schema")
  );
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
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

  const updateAttempt = await supabase
    .from("wine_entries")
    .update({ is_feed_visible: true })
    .in("id", entryIds)
    .eq("user_id", user.id)
    .select("id");

  if (updateAttempt.error) {
    const message = updateAttempt.error.message ?? "Update failed";
    if (isMissingFeedVisibilityColumn(message)) {
      // Backwards-compatible: if the column doesn't exist yet, treat this as a no-op.
      return NextResponse.json({ success: true, updated_ids: [] });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updatedIds = (updateAttempt.data ?? [])
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return NextResponse.json({ success: true, updated_ids: updatedIds });
}

