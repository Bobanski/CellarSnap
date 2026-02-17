import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canUserViewEntry, type EntryPrivacy } from "@/lib/access/entryVisibility";

const ALLOWED_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: entryId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json(
      { error: "Invalid emoji. Use one of: 🍷, 🔥, ❤️, 👀, 🤝" },
      { status: 400 }
    );
  }

  const { data: entry, error: entryError } = await supabase
    .from("wine_entries")
    .select("id, user_id, entry_privacy, reaction_privacy")
    .eq("id", entryId)
    .maybeSingle();

  const legacyEntry =
    entryError &&
    (entryError.message.includes("reaction_privacy") || entryError.message.includes("column"))
      ? await supabase
          .from("wine_entries")
          .select("id, user_id, entry_privacy")
          .eq("id", entryId)
          .maybeSingle()
      : null;

  const entryData = legacyEntry?.data ?? entry;
  const effectiveEntryError = legacyEntry?.error ?? entryError;

  if (effectiveEntryError || !entryData) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const reactionPrivacyRaw = (
    entryData as { reaction_privacy?: string | null; entry_privacy?: string | null }
  ).reaction_privacy;
  const reactionPrivacy: EntryPrivacy =
    reactionPrivacyRaw === "public" ||
    reactionPrivacyRaw === "friends_of_friends" ||
    reactionPrivacyRaw === "friends" ||
    reactionPrivacyRaw === "private"
      ? reactionPrivacyRaw
      : (entryData as { entry_privacy?: EntryPrivacy }).entry_privacy;

  try {
    const canViewEntry = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: entryData.user_id,
      entryPrivacy: (entryData as { entry_privacy?: EntryPrivacy }).entry_privacy,
    });
    if (!canViewEntry) {
      return NextResponse.json({ error: "You cannot react to this entry." }, { status: 403 });
    }

    const canReact = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: entryData.user_id,
      entryPrivacy: reactionPrivacy,
    });
    if (!canReact) {
      return NextResponse.json({ error: "You cannot react to this entry." }, { status: 403 });
    }
  } catch (visibilityError) {
    const message =
      visibilityError instanceof Error
        ? visibilityError.message
        : "Unable to verify entry visibility.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("entry_reactions").insert({
    entry_id: entryId,
    user_id: user.id,
    emoji,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Already reacted with this emoji." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, emoji });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: entryId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const emoji = url.searchParams.get("emoji")?.trim() ?? "";
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json(
      { error: "Invalid emoji. Use one of: 🍷, 🔥, ❤️, 👀, 🤝" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("entry_reactions")
    .delete()
    .eq("entry_id", entryId)
    .eq("user_id", user.id)
    .eq("emoji", emoji);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
