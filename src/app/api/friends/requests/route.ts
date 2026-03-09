import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signPhotoUrls } from "@/server/storage/signedUrls";
import {
  applyFriendTransition,
  FriendTransitionError,
} from "@/server/friends/transition";

type FriendRequestPayload = {
  recipient_id?: string;
};

function transitionErrorResponse(error: unknown) {
  if (error instanceof FriendTransitionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error ? error.message : "Unable to update request.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: requests, error } = await supabase
    .from("friend_requests")
    .select("id, requester_id, recipient_id, status, created_at, seen_at")
    .eq("status", "pending")
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (requests ?? []).flatMap((request) => [
        request.requester_id,
        request.recipient_id,
      ])
    )
  );

  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from("public_profiles")
          .select("id, display_name, email, avatar_path")
          .in("id", userIds)
      : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  const avatarUrlByPath = await signPhotoUrls(
    (profiles ?? []).map((profile) => profile.avatar_path),
    supabase
  );

  const incoming = (requests ?? [])
    .filter((request) => request.recipient_id === user.id)
    .map((request) => ({
      id: request.id,
      requester: {
        id: request.requester_id,
        display_name: profileMap.get(request.requester_id)?.display_name ?? null,
        email: profileMap.get(request.requester_id)?.email ?? null,
        avatar_url: profileMap.get(request.requester_id)?.avatar_path
          ? avatarUrlByPath.get(profileMap.get(request.requester_id)?.avatar_path ?? "") ??
            null
          : null,
      },
      created_at: request.created_at,
      seen_at: request.seen_at,
    }));

  const outgoing = (requests ?? [])
    .filter((request) => request.requester_id === user.id)
    .map((request) => ({
      id: request.id,
      recipient: {
        id: request.recipient_id,
        display_name: profileMap.get(request.recipient_id)?.display_name ?? null,
        email: profileMap.get(request.recipient_id)?.email ?? null,
        avatar_url: profileMap.get(request.recipient_id)?.avatar_path
          ? avatarUrlByPath.get(profileMap.get(request.recipient_id)?.avatar_path ?? "") ??
            null
          : null,
      },
      created_at: request.created_at,
    }));

  return NextResponse.json({ incoming, outgoing });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as FriendRequestPayload;
  const recipientId =
    typeof body.recipient_id === "string" ? body.recipient_id : "";

  if (!recipientId) {
    return NextResponse.json({ error: "Recipient required." }, { status: 400 });
  }

  const parsedRecipientId = z.string().uuid().safeParse(recipientId);
  if (!parsedRecipientId.success) {
    return NextResponse.json(
      { error: "Recipient must be a valid user ID." },
      { status: 400 }
    );
  }

  if (parsedRecipientId.data === user.id) {
    return NextResponse.json({ error: "Cannot friend yourself." }, { status: 400 });
  }

  try {
    const transition = await applyFriendTransition(
      supabase,
      parsedRecipientId.data,
      "request"
    );
    if (transition.status !== "pending" && transition.status !== "accepted") {
      return NextResponse.json(
        { error: "Unexpected friend request transition response." },
        { status: 500 }
      );
    }

    if (!transition.requestId) {
      return NextResponse.json(
        { error: "Unexpected missing request identifier." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: transition.status,
      request_id: transition.requestId,
    });
  } catch (error) {
    return transitionErrorResponse(error);
  }
}
