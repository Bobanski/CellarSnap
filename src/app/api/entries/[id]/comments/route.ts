import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canUserViewEntry, type EntryPrivacy } from "@/lib/access/entryVisibility";

type EntryRow = {
  id: string;
  user_id: string;
  entry_privacy: EntryPrivacy;
  comments_privacy?: EntryPrivacy;
  comments_scope?: string | null;
};

type CommentRow = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  deleted_at?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_path?: string | null;
};

const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(1000, "Comment cannot exceed 1000 characters."),
  parent_comment_id: z.string().uuid().nullable().optional(),
});

function normalizePrivacy(
  value: unknown,
  fallback: "public" | "friends_of_friends" | "friends" | "private"
): "public" | "friends_of_friends" | "friends" | "private" {
  if (
    value === "public" ||
    value === "friends_of_friends" ||
    value === "friends" ||
    value === "private"
  ) {
    return value;
  }
  return fallback;
}

function resolveCommentsPrivacy(entry: EntryRow): EntryPrivacy {
  const entryPrivacy = normalizePrivacy(entry.entry_privacy, "public");
  if (
    entry.comments_privacy === "public" ||
    entry.comments_privacy === "friends_of_friends" ||
    entry.comments_privacy === "friends" ||
    entry.comments_privacy === "private"
  ) {
    return entry.comments_privacy;
  }

  const legacyScope = entry.comments_scope === "friends" ? "friends" : "viewers";
  if (legacyScope === "friends" && entryPrivacy !== "private") {
    return "friends";
  }

  return entryPrivacy;
}

async function getEntryWithCommentSettings(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  entryId: string
): Promise<EntryRow | null> {
  const selectAttempts = [
    "id, user_id, entry_privacy, comments_privacy, comments_scope",
    "id, user_id, entry_privacy, comments_scope",
    "id, user_id, entry_privacy",
  ];

  for (const select of selectAttempts) {
    const response = await supabase
      .from("wine_entries")
      .select(select)
      .eq("id", entryId)
      .maybeSingle();

    if (!response.error) {
      return response.data as EntryRow | null;
    }

    const missingCommentsPrivacy = response.error.message.includes("comments_privacy");
    const missingCommentsScope = response.error.message.includes("comments_scope");

    if ((missingCommentsPrivacy || missingCommentsScope) && select !== "id, user_id, entry_privacy") {
      continue;
    }

    throw new Error(response.error.message);
  }

  return null;
}

async function canUserAccessComments({
  supabase,
  viewerUserId,
  entry,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  viewerUserId: string;
  entry: EntryRow;
}) {
  const canViewEntry = await canUserViewEntry({
    supabase,
    viewerUserId,
    ownerUserId: entry.user_id,
    entryPrivacy: entry.entry_privacy,
  });

  if (!canViewEntry) {
    return false;
  }

  return canUserViewEntry({
    supabase,
    viewerUserId,
    ownerUserId: entry.user_id,
    entryPrivacy: resolveCommentsPrivacy(entry),
  });
}

function isMissingEntryCommentsRelation(message: string) {
  return (
    message.includes("entry_comments") ||
    message.includes("relation") ||
    message.includes("column")
  );
}

async function fetchCommentsForEntry(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  entryId: string
): Promise<CommentRow[]> {
  const withDeletedAt = await supabase
    .from("entry_comments")
    .select("id, entry_id, user_id, parent_comment_id, body, created_at, deleted_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });

  if (!withDeletedAt.error) {
    return (withDeletedAt.data ?? []) as CommentRow[];
  }

  if (withDeletedAt.error.message.includes("deleted_at")) {
    const fallback = await supabase
      .from("entry_comments")
      .select("id, entry_id, user_id, parent_comment_id, body, created_at")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return ((fallback.data ?? []) as Omit<CommentRow, "deleted_at">[]).map(
      (row) => ({ ...row, deleted_at: null })
    );
  }

  throw new Error(withDeletedAt.error.message);
}

async function createAvatarSignedUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  path: string | null | undefined
) {
  if (!path) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from("wine-photos")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function GET(
  _request: Request,
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

  let entry: EntryRow | null = null;
  try {
    entry = await getEntryWithCommentSettings(supabase, entryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  let canComment = false;
  try {
    canComment = await canUserAccessComments({
      supabase,
      viewerUserId: user.id,
      entry,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify comment access.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!canComment) {
    return NextResponse.json(
      { error: "You cannot view comments for this post." },
      { status: 403 }
    );
  }

  let rows: CommentRow[] = [];
  try {
    rows = await fetchCommentsForEntry(supabase, entryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load comments.";
    if (isMissingEntryCommentsRelation(message)) {
      return NextResponse.json({ comments: [], comment_count: 0, can_comment: canComment });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
  let profiles: ProfileRow[] = [];
  if (authorIds.length > 0) {
    const { data: profilesWithAvatar, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_path")
      .in("id", authorIds);

    if (
      profilesError &&
      (profilesError.message.includes("avatar_path") ||
        profilesError.message.includes("column"))
    ) {
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", authorIds);
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      profiles = (fallback ?? []).map((profile) => ({ ...profile, avatar_path: null }));
    } else if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    } else {
      profiles = (profilesWithAvatar ?? []) as ProfileRow[];
    }
  }

  const authorNameById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.display_name ?? profile.email ?? "Unknown",
    ])
  );
  const authorAvatarPathById = new Map(
    profiles
      .filter((profile) => profile.avatar_path)
      .map((profile) => [profile.id, profile.avatar_path as string])
  );
  const signedAvatarUrlByPath = new Map<string, string | null>();
  await Promise.all(
    Array.from(new Set(authorAvatarPathById.values())).map(async (path) => {
      signedAvatarUrlByPath.set(path, await createAvatarSignedUrl(supabase, path));
    })
  );

  const topLevel = rows.filter((row) => row.parent_comment_id === null);
  const repliesByParentId = new Map<string, CommentRow[]>();
  rows
    .filter((row) => row.parent_comment_id !== null)
    .forEach((reply) => {
      const parentId = reply.parent_comment_id!;
      const list = repliesByParentId.get(parentId) ?? [];
      list.push(reply);
      repliesByParentId.set(parentId, list);
    });

  const serializeComment = (row: CommentRow) => {
    const isDeleted = Boolean(row.deleted_at) || row.body.trim() === "[deleted]";

    return {
      id: row.id,
      entry_id: row.entry_id,
      user_id: row.user_id,
      body: isDeleted ? "[deleted]" : row.body,
      created_at: row.created_at,
      author_name: isDeleted ? null : authorNameById.get(row.user_id) ?? "Unknown",
      author_avatar_url: isDeleted
        ? null
        : (() => {
            const avatarPath = authorAvatarPathById.get(row.user_id);
            return avatarPath ? signedAvatarUrlByPath.get(avatarPath) ?? null : null;
          })(),
      is_deleted: isDeleted,
      parent_comment_id: row.parent_comment_id,
    };
  };

  const serialized = topLevel.map((comment) => ({
    ...serializeComment(comment),
    replies: (repliesByParentId.get(comment.id) ?? []).map((reply) =>
      serializeComment(reply)
    ),
  }));

  return NextResponse.json({
    comments: serialized,
    comment_count: rows.length,
    can_comment: canComment,
    comments_privacy: resolveCommentsPrivacy(entry),
  });
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = createCommentSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  let entry: EntryRow | null = null;
  try {
    entry = await getEntryWithCommentSettings(supabase, entryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  let canComment = false;
  try {
    canComment = await canUserAccessComments({
      supabase,
      viewerUserId: user.id,
      entry,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify comment access.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!canComment) {
    return NextResponse.json(
      { error: "You cannot comment on this post." },
      { status: 403 }
    );
  }

  const parentCommentId = payload.data.parent_comment_id ?? null;
  if (parentCommentId) {
    const { data: parent, error: parentError } = await supabase
      .from("entry_comments")
      .select("id, entry_id, parent_comment_id")
      .eq("id", parentCommentId)
      .maybeSingle();

    if (parentError) {
      return NextResponse.json({ error: parentError.message }, { status: 500 });
    }
    if (!parent || parent.entry_id !== entryId) {
      return NextResponse.json({ error: "Parent comment not found." }, { status: 400 });
    }
    if (parent.parent_comment_id !== null) {
      return NextResponse.json(
        { error: "Replies can only be added to top-level comments." },
        { status: 400 }
      );
    }
  }

  const { data: created, error: createError } = await supabase
    .from("entry_comments")
    .insert({
      entry_id: entryId,
      user_id: user.id,
      body: payload.data.body,
      parent_comment_id: parentCommentId,
    })
    .select("id, entry_id, user_id, parent_comment_id, body, created_at")
    .single();

  if (createError || !created) {
    return NextResponse.json(
      { error: createError?.message ?? "Unable to create comment." },
      { status: 500 }
    );
  }

  let profile:
    | {
        display_name: string | null;
        email: string | null;
        avatar_path?: string | null;
      }
    | null = null;
  {
    const { data: withAvatar, error: withAvatarError } = await supabase
      .from("profiles")
      .select("display_name, email, avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    if (
      withAvatarError &&
      (withAvatarError.message.includes("avatar_path") ||
        withAvatarError.message.includes("column"))
    ) {
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle();
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      profile = fallback ? { ...fallback, avatar_path: null } : null;
    } else if (withAvatarError) {
      return NextResponse.json({ error: withAvatarError.message }, { status: 500 });
    } else {
      profile = withAvatar;
    }
  }

  const authorAvatarUrl = await createAvatarSignedUrl(
    supabase,
    profile?.avatar_path ?? null
  );

  return NextResponse.json({
    comment: {
      ...created,
      author_name: profile?.display_name ?? profile?.email ?? "You",
      author_avatar_url: authorAvatarUrl,
      is_deleted: false,
    },
  });
}
