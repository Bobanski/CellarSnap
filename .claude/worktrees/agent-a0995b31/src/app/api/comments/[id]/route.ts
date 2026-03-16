import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  executeSelectWithFallback,
  executeWithColumnFallback,
} from "@/server/db/compat";

type CommentRow = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  deleted_at?: string | null;
};

async function loadCommentById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  commentId: string
): Promise<CommentRow | null> {
  const commentSelectResult = await executeSelectWithFallback({
    attempts: [
      {
        select: "id, entry_id, user_id, parent_comment_id, body, deleted_at",
        missingColumns: ["deleted_at"] as const,
        includesDeletedAt: true,
      },
      {
        select: "id, entry_id, user_id, parent_comment_id, body",
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
        .eq("id", commentId)
        .maybeSingle();
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (commentSelectResult.error) {
    throw new Error(commentSelectResult.error.message);
  }

  if (!commentSelectResult.data) {
    return null;
  }

  return commentSelectResult.usedAttempt?.includesDeletedAt
    ? (commentSelectResult.data as unknown as CommentRow)
    : {
        ...(commentSelectResult.data as unknown as Omit<CommentRow, "deleted_at">),
        deleted_at: null,
      };
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: commentId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!commentId) {
    return NextResponse.json({ error: "Comment ID is required." }, { status: 400 });
  }

  let comment: CommentRow | null = null;
  try {
    comment = await loadCommentById(supabase, commentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load comment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  if (comment.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Replies are always hard-deleted because we only allow one reply level.
  if (comment.parent_comment_id) {
    const { error } = await supabase
      .from("entry_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: true, soft_deleted: false });
  }

  const { data: replies, error: repliesError } = await supabase
    .from("entry_comments")
    .select("id, user_id")
    .eq("parent_comment_id", commentId);

  if (repliesError) {
    return NextResponse.json({ error: repliesError.message }, { status: 500 });
  }

  const hasOtherUsersReplies = (replies ?? []).some(
    (reply) => reply.user_id !== user.id
  );

  // Keep thread open when others have replied; anonymize the root comment.
  if (hasOtherUsersReplies) {
    if (comment.deleted_at || comment.body.trim() === "[deleted]") {
      return NextResponse.json({ ok: true, deleted: true, soft_deleted: true });
    }

    const nowIso = new Date().toISOString();
    const updateResult = await executeWithColumnFallback({
      initialPayload: { body: "[deleted]", deleted_at: nowIso },
      removableColumns: ["deleted_at"] as const,
      maxAttempts: 2,
      attempt: async (payload) => {
        const response = await supabase
          .from("entry_comments")
          .update(payload)
          .eq("id", commentId)
          .eq("user_id", user.id);
        return {
          data: null,
          error: response.error,
        };
      },
    });

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: true, soft_deleted: true });
  }

  const { error: deleteError } = await supabase
    .from("entry_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: true, soft_deleted: false });
}
