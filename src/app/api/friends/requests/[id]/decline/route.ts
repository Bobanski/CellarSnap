import { NextResponse } from "next/server";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";
import {
  applyFriendTransition,
  FriendTransitionError,
} from "@/server/friends/transition";

function transitionErrorResponse(error: unknown) {
  if (error instanceof FriendTransitionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error ? error.message : "Request could not be declined.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
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

  if (requestRow.recipient_id !== user.id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (requestRow.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot decline a ${requestRow.status} request.` },
      { status: 409 }
    );
  }

  try {
    const transition = await applyFriendTransition(
      supabase,
      requestRow.requester_id,
      "decline"
    );

    if (transition.status !== "declined") {
      return NextResponse.json(
        { error: "Request could not be declined." },
        { status: 409 }
      );
    }

    if (transition.requestId && transition.requestId !== id) {
      return NextResponse.json(
        { error: "Request state changed unexpectedly." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      status: transition.status,
      request_id: id,
    });
  } catch (error) {
    return transitionErrorResponse(error);
  }
}
