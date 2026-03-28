import { NextResponse } from "next/server";
import { z } from "zod";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { getFriendRelationshipPayload } from "@/server/friends/relationshipPayload";
import {
  applyFriendTransition,
  FriendTransitionError,
} from "@/server/friends/transition";

async function getTargetUserId(paramsPromise: Promise<{ id: string }>) {
  const { id } = await paramsPromise;
  const parsed = z.string().uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}

function transitionErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof FriendTransitionError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(
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

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getFriendRelationshipPayload(supabase, user.id, targetUserId)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load relationship";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "Cannot send a friend request to yourself." },
      { status: 400 }
    );
  }

  const { data: targetUser, error: targetUserError } = await supabase
    .from("public_profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetUserError) {
    return NextResponse.json({ error: targetUserError.message }, { status: 500 });
  }

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await applyFriendTransition(supabase, targetUserId, "request");
    return NextResponse.json(
      await getFriendRelationshipPayload(supabase, user.id, targetUserId)
    );
  } catch (error) {
    return transitionErrorResponse(error, "Unable to update relationship.");
  }
}

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

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  try {
    await applyFriendTransition(supabase, targetUserId, "remove");
    return NextResponse.json(
      await getFriendRelationshipPayload(supabase, user.id, targetUserId)
    );
  } catch (error) {
    return transitionErrorResponse(error, "Unable to remove relationship.");
  }
}
