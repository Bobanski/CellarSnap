import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CommentRow = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  deleted_at?: string | null;
};

function isMissingColumn(message: string, column: string) {
  return message.includes(column) || message.includes("column");
}

async function loadCommentById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  commentId: string
): Promise<CommentRow | null> {
  const withDeletedAt = await supabase
    .from("entry_comments")
    .select("id, entry_id, user_id, parent_comment_id, body, deleted_at")
    .eq("id", commentId)
    .maybeSingle();

  if (!withDeletedAt.error) {
    return (withDeletedAt.data as CommentRow | null) ?? null;
  }

  if (isMissingColumn(withDeletedAt.error.message, "deleted_at")) {
    const fallback = await supabase
      .from("entry_comments")
      .select("id, entry_id, user_id, parent_comment_id, body")
      .eq("id", commentId)
      .maybeSingle();

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    if (!fallback.data) {
      return null;
    }

    return {
      ...(fallback.data as Omit<CommentRow, "deleted_at">),
      deleted_at: null,
    };
  }

  throw new Error(withDeletedAt.error.message);
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
    const withDeletedAt = await supabase
      .from("entry_comments")
      .update({ body: "[deleted]", deleted_at: nowIso })
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (!withDeletedAt.error) {
      return NextResponse.json({ ok: true, deleted: true, soft_deleted: true });
    }

    if (isMissingColumn(withDeletedAt.error.message, "deleted_at")) {
      const fallback = await supabase
        .from("entry_comments")
        .update({ body: "[deleted]" })
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (!fallback.error) {
        return NextResponse.json({ ok: true, deleted: true, soft_deleted: true });
      }

      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({ error: withDeletedAt.error.message }, { status: 500 });
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
