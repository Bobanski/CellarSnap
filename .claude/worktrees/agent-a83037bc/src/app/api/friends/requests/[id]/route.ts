import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyFriendTransition,
  FriendTransitionError,
} from "@/server/friends/transition";

function looksLikeRlsDeleteError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("permission denied")
  );
}

function transitionErrorResponse(error: unknown) {
  if (error instanceof FriendTransitionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error ? error.message : "Unable to process request.";
  if (looksLikeRlsDeleteError(message)) {
    return NextResponse.json(
      {
        error:
          "Friend removal is temporarily unavailable. Please try again later. (FRIEND_REQUEST_DELETE_UNAVAILABLE)",
        code: "FRIEND_REQUEST_DELETE_UNAVAILABLE",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * DELETE /api/friends/requests/[id]
 *
 * Allows either party to delete a friend request.
 * Works for both:
 *   - cancelling an outgoing pending request (requester deletes)
 *   - unfriending / removing an accepted friendship (either side deletes)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the request exists and the user is a party to it
  const { data: request, error: fetchError } = await supabase
    .from("friend_requests")
    .select("id, requester_id, recipient_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (request.requester_id !== user.id && request.recipient_id !== user.id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (request.status === "pending" || request.status === "accepted") {
    const targetUserId =
      request.requester_id === user.id ? request.recipient_id : request.requester_id;

    try {
      await applyFriendTransition(supabase, targetUserId, "remove");
    } catch (error) {
      return transitionErrorResponse(error);
    }

    return NextResponse.json({
      success: true,
      request_id: request.id,
      status: request.status,
    });
  }

  const { error: deleteError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (looksLikeRlsDeleteError(deleteError.message)) {
      return NextResponse.json(
        {
          error:
            "Friend removal is temporarily unavailable. Please try again later. (FRIEND_REQUEST_DELETE_UNAVAILABLE)",
          code: "FRIEND_REQUEST_DELETE_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    request_id: request.id,
    status: request.status,
  });
}
