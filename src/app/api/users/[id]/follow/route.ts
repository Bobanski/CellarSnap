import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFriendRelationship } from "@/lib/friends/relationship";

async function getTargetUserId(paramsPromise: Promise<{ id: string }>) {
  const { id } = await paramsPromise;
  const parsed = z.string().uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}

async function getRelationshipPayload(
  currentUserId: string,
  targetUserId: string
) {
  const supabase = await createSupabaseServerClient();
  const relationship = await getFriendRelationship(
    supabase,
    currentUserId,
    targetUserId
  );

  return {
    following: relationship.following,
    follows_you: relationship.follows_you,
    friends: relationship.friends,
    friend_status: relationship.status,
    outgoing_request_id: relationship.outgoing_request_id,
    incoming_request_id: relationship.incoming_request_id,
    friend_request_id: relationship.friend_request_id,
  };
}

export async function GET(
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

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getRelationshipPayload(user.id, targetUserId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load relationship";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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

  const { data: targetUser } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { data: reverse, error: reverseError } = await supabase
    .from("friend_requests")
    .select("id, status")
    .eq("requester_id", targetUserId)
    .eq("recipient_id", user.id)
    .maybeSingle();

  if (reverseError) {
    return NextResponse.json({ error: reverseError.message }, { status: 500 });
  }

  if (reverse && (reverse.status === "pending" || reverse.status === "accepted")) {
    if (reverse.status === "pending") {
      const { error: acceptError } = await supabase
        .from("friend_requests")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
          seen_at: new Date().toISOString(),
        })
        .eq("id", reverse.id)
        .eq("status", "pending")
        .eq("recipient_id", user.id);

      if (acceptError) {
        return NextResponse.json({ error: acceptError.message }, { status: 500 });
      }
    }

    const { error: cleanupOutgoingError } = await supabase
      .from("friend_requests")
      .delete()
      .eq("requester_id", user.id)
      .eq("recipient_id", targetUserId)
      .in("status", ["pending", "accepted"]);

    if (cleanupOutgoingError) {
      return NextResponse.json(
        { error: cleanupOutgoingError.message },
        { status: 500 }
      );
    }
  } else {
    const { data: existing, error: existingError } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("requester_id", user.id)
      .eq("recipient_id", targetUserId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      const { error: insertError } = await supabase.from("friend_requests").insert({
        requester_id: user.id,
        recipient_id: targetUserId,
        status: "pending",
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    } else {
      const { error: reviveError } = await supabase
        .from("friend_requests")
        .update({
          status: "pending",
          responded_at: null,
          seen_at: null,
        })
        .eq("id", existing.id)
        .eq("requester_id", user.id)
        .eq("status", "declined");

      if (reviveError) {
        return NextResponse.json({ error: reviveError.message }, { status: 500 });
      }
    }
  }

  try {
    return NextResponse.json(await getRelationshipPayload(user.id, targetUserId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load relationship";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  const [{ error: outgoingError }, { error: incomingError }] = await Promise.all([
    supabase
      .from("friend_requests")
      .delete()
      .eq("requester_id", user.id)
      .eq("recipient_id", targetUserId)
      .in("status", ["pending", "accepted"]),
    supabase
      .from("friend_requests")
      .delete()
      .eq("requester_id", targetUserId)
      .eq("recipient_id", user.id)
      .in("status", ["pending", "accepted"]),
  ]);

  if (outgoingError || incomingError) {
    return NextResponse.json(
      { error: outgoingError?.message ?? incomingError?.message ?? "Unable to remove relationship." },
      { status: 500 }
    );
  }

  try {
    return NextResponse.json(await getRelationshipPayload(user.id, targetUserId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load relationship";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
