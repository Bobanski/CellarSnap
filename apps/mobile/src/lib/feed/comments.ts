import { supabase } from "@/src/lib/supabase";

type MobileSupabaseClient = typeof supabase;

type CommentRow = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  deleted_at?: string | null;
};

export type FeedReply = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
};

export type FeedComment = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: null;
  author_name: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
  replies: FeedReply[];
};

function serializeComment(
  row: CommentRow,
  authorNameById: Map<string, string>
): Omit<FeedReply, "parent_comment_id"> & { parent_comment_id: string | null } {
  const isDeleted = Boolean(row.deleted_at) || row.body.trim() === "[deleted]";
  return {
    id: row.id,
    entry_id: row.entry_id,
    user_id: row.user_id,
    parent_comment_id: row.parent_comment_id,
    body: isDeleted ? "[deleted]" : row.body,
    created_at: row.created_at,
    author_name: isDeleted ? null : authorNameById.get(row.user_id) ?? "Unknown",
    is_deleted: isDeleted,
  };
}

export async function fetchFeedComments({
  entryId,
  supabaseClient = supabase,
}: {
  entryId: string;
  supabaseClient?: MobileSupabaseClient;
}) {
  const withDeletedAt = await supabaseClient
    .from("entry_comments")
    .select("id, entry_id, user_id, parent_comment_id, body, created_at, deleted_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });

  let rows: CommentRow[] = [];

  if (!withDeletedAt.error) {
    rows = (withDeletedAt.data ?? []) as CommentRow[];
  } else if (withDeletedAt.error.message.includes("deleted_at")) {
    const fallback = await supabaseClient
      .from("entry_comments")
      .select("id, entry_id, user_id, parent_comment_id, body, created_at")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (fallback.error) {
      return {
        comments: [] as FeedComment[],
        errorMessage: fallback.error.message,
      };
    }

    rows = ((fallback.data ?? []) as Omit<CommentRow, "deleted_at">[]).map((row) => ({
      ...row,
      deleted_at: null,
    }));
  } else {
    return {
      comments: [] as FeedComment[],
      errorMessage: withDeletedAt.error.message,
    };
  }

  const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const authorNameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("id, display_name, email")
      .in("id", authorIds);
    (profiles ?? []).forEach((profile) => {
      authorNameById.set(
        profile.id,
        profile.display_name ?? profile.email ?? "Unknown"
      );
    });
  }

  const topLevelRows = rows.filter((row) => row.parent_comment_id === null);
  const repliesByParentId = new Map<string, CommentRow[]>();
  rows
    .filter((row) => row.parent_comment_id !== null)
    .forEach((reply) => {
      const parentId = reply.parent_comment_id as string;
      const list = repliesByParentId.get(parentId) ?? [];
      list.push(reply);
      repliesByParentId.set(parentId, list);
    });

  const comments = topLevelRows.map((row) => {
    const serialized = serializeComment(row, authorNameById);
    const replies = (repliesByParentId.get(row.id) ?? []).map((reply) => {
      const replySerialized = serializeComment(reply, authorNameById);
      return {
        ...replySerialized,
        parent_comment_id: replySerialized.parent_comment_id,
      } as FeedReply;
    });

    return {
      ...serialized,
      parent_comment_id: null,
      replies,
    } as FeedComment;
  });

  return {
    comments,
    errorMessage: null as string | null,
  };
}

export function countComments(comments: FeedComment[] | undefined, fallback: number) {
  if (!comments) {
    return fallback;
  }
  return comments.reduce((total, comment) => total + 1 + comment.replies.length, 0);
}
