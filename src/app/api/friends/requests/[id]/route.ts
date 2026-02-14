import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function looksLikeRlsDeleteError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("permission denied")
  );
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

  if (
    request.requester_id !== user.id &&
    request.recipient_id !== user.id
  ) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let deleteError: { message: string } | null = null;
  if (request.status === "pending" || request.status === "accepted") {
    const [forwardDelete, reverseDelete] = await Promise.all([
      supabase
        .from("friend_requests")
        .delete()
        .eq("requester_id", request.requester_id)
        .eq("recipient_id", request.recipient_id)
        .in("status", ["pending", "accepted"]),
      supabase
        .from("friend_requests")
        .delete()
        .eq("requester_id", request.recipient_id)
        .eq("recipient_id", request.requester_id)
        .in("status", ["pending", "accepted"]),
    ]);
    deleteError = forwardDelete.error ?? reverseDelete.error;
  } else {
    const singleDelete = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", id);
    deleteError = singleDelete.error;
  }

  if (deleteError) {
    if (looksLikeRlsDeleteError(deleteError.message)) {
      return NextResponse.json(
        {
          error:
            "Friend removal/cancel requires delete permissions on friend_requests. Run the Supabase migration `supabase/sql/010_friend_cancel_unfriend.sql` to add the delete policy, then retry.",
        },
        { status: 403 }
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
