import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  // Verify the request exists and the user is a party to it
  const { data: requestRow, error: fetchError } = await supabase
    .from("friend_requests")
    .select("id, requester_id, recipient_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!requestRow) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (requestRow.requester_id !== user.id && requestRow.recipient_id !== user.id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (requestRow.status === "pending" || requestRow.status === "accepted") {
    const targetUserId =
      requestRow.requester_id === user.id
        ? requestRow.recipient_id
        : requestRow.requester_id;

    try {
      await applyFriendTransition(supabase, targetUserId, "remove");
    } catch (error) {
      return transitionErrorResponse(error);
    }

    return NextResponse.json({
      success: true,
      request_id: requestRow.id,
      status: requestRow.status,
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
    request_id: requestRow.id,
    status: requestRow.status,
  });
}
