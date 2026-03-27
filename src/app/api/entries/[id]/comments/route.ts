import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canUserViewEntry, type EntryPrivacy } from "@/lib/access/entryVisibility";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { executeSelectWithFallback } from "@/server/db/compat";
import { signPhotoUrl, signPhotoUrls } from "@/server/storage/signedUrls";

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
  const entrySettingsResult = await executeSelectWithFallback({
    attempts: [
      {
        select: "id, user_id, entry_privacy, comments_privacy, comments_scope",
        missingColumns: ["comments_privacy", "comments_scope"] as const,
      },
      {
        select: "id, user_id, entry_privacy, comments_scope",
        missingColumns: ["comments_scope"] as const,
      },
      {
        select: "id, user_id, entry_privacy",
        missingColumns: [] as const,
      },
    ],
    getFallbackColumns: (attempt) => attempt.missingColumns,
    fallbackOnAnyMissingColumn: true,
    attempt: async (attempt) => {
      const response = await supabase
        .from("wine_entries")
        .select(attempt.select)
        .eq("id", entryId)
        .maybeSingle();
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (entrySettingsResult.error) {
    throw new Error(entrySettingsResult.error.message);
  }

  return (entrySettingsResult.data as EntryRow | null) ?? null;
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
  const commentsResult = await executeSelectWithFallback({
    attempts: [
      {
        select: "id, entry_id, user_id, parent_comment_id, body, created_at, deleted_at",
        missingColumns: ["deleted_at"] as const,
        includesDeletedAt: true,
      },
      {
        select: "id, entry_id, user_id, parent_comment_id, body, created_at",
        missingColumns: [] as const,
        includesDeletedAt: false,
      },
    ],
    getFallbackColumns: (attempt) => attempt.missingColumns,
    fallbackOnAnyMissingColumn: true,
    attempt: async (attempt) => {
      const response = await supabase
        .from("entry_comments")
        .select(attempt.select)
        .eq("entry_id", entryId)
        .order("created_at", { ascending: true });
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (commentsResult.error) {
    throw new Error(commentsResult.error.message);
  }

  if (commentsResult.usedAttempt?.includesDeletedAt) {
    return (commentsResult.data ?? []) as unknown as CommentRow[];
  }

  return ((commentsResult.data ?? []) as unknown as Omit<CommentRow, "deleted_at">[]).map(
    (row) => ({ ...row, deleted_at: null })
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: entryId } = await params;
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
  const { supabase, user } = auth;

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
    const profilesResult = await executeSelectWithFallback({
      attempts: [
        {
          select: "id, display_name, email, avatar_path",
          missingColumns: ["avatar_path"] as const,
          includesAvatar: true,
        },
        {
          select: "id, display_name, email",
          missingColumns: [] as const,
          includesAvatar: false,
        },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      fallbackOnAnyMissingColumn: true,
      attempt: async (attempt) => {
        const response = await supabase
          .from("public_profiles")
          .select(attempt.select)
          .in("id", authorIds);
        return {
          data: response.data,
          error: response.error,
        };
      },
    });

    if (profilesResult.error) {
      return NextResponse.json({ error: profilesResult.error.message }, { status: 500 });
    }

    const profileRows = (profilesResult.data ?? []) as unknown as ProfileRow[];
    profiles = profilesResult.usedAttempt?.includesAvatar
      ? profileRows
      : profileRows.map((profile) => ({ ...profile, avatar_path: null }));
  }

  const authorNameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, getPublicProfileName(profile)])
  );
  const authorAvatarPathById = new Map(
    profiles
      .filter((profile) => profile.avatar_path)
      .map((profile) => [profile.id, profile.avatar_path as string])
  );
  const signedAvatarUrlByPath = await signPhotoUrls(
    new Set(authorAvatarPathById.values()),
    supabase
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
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
  const { supabase, user } = auth;

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
    const profileResult = await executeSelectWithFallback({
      attempts: [
        {
          select: "display_name, email, avatar_path",
          missingColumns: ["avatar_path"] as const,
          includesAvatar: true,
        },
        {
          select: "display_name, email",
          missingColumns: [] as const,
          includesAvatar: false,
        },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      fallbackOnAnyMissingColumn: true,
      attempt: async (attempt) => {
        const response = await supabase
          .from("profiles")
          .select(attempt.select)
          .eq("id", user.id)
          .maybeSingle();
        return {
          data: response.data,
          error: response.error,
        };
      },
    });

    if (profileResult.error) {
      return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
    }

    const profileRow = profileResult.data as
      | { display_name: string | null; email: string | null; avatar_path?: string | null }
      | null;
    profile = profileResult.usedAttempt?.includesAvatar
      ? profileRow
      : profileRow
        ? { ...profileRow, avatar_path: null }
        : null;
  }

  const authorAvatarUrl = await signPhotoUrl(profile?.avatar_path ?? null, supabase);

  return NextResponse.json({
    comment: {
      ...created,
      author_name: profile?.display_name ?? "You",
      author_avatar_url: authorAvatarUrl,
      is_deleted: false,
    },
  });
}
