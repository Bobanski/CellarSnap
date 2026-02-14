import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FriendRequestPayload = {
  recipient_id?: string;
};

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
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds)
      : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  const incoming = (requests ?? [])
    .filter((request) => request.recipient_id === user.id)
    .map((request) => ({
      id: request.id,
      requester: {
        id: request.requester_id,
        display_name: profileMap.get(request.requester_id)?.display_name ?? null,
        email: profileMap.get(request.requester_id)?.email ?? null,
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

  if (recipientId === user.id) {
    return NextResponse.json({ error: "Cannot friend yourself." }, { status: 400 });
  }

  const { data: reverseRows, error: reverseError } = await supabase
    .from("friend_requests")
    .select("id, status, created_at")
    .eq("requester_id", recipientId)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (reverseError) {
    return NextResponse.json({ error: reverseError.message }, { status: 500 });
  }

  const reverseAccepted = (reverseRows ?? []).find((row) => row.status === "accepted");
  const reversePending = (reverseRows ?? []).find((row) => row.status === "pending");
  const reverse = reverseAccepted ?? reversePending ?? null;

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
      .eq("recipient_id", recipientId)
      .in("status", ["pending", "accepted"]);

    if (cleanupOutgoingError) {
      return NextResponse.json(
        { error: cleanupOutgoingError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "accepted", request_id: reverse.id });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("friend_requests")
    .select("id, status, created_at")
    .eq("requester_id", user.id)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingAccepted = (existingRows ?? []).find((row) => row.status === "accepted");
  const existingPending = (existingRows ?? []).find((row) => row.status === "pending");
  const existingDeclined = (existingRows ?? []).find((row) => row.status === "declined");
  const existing = existingAccepted ?? existingPending ?? existingDeclined ?? null;

  if (existing) {
    if (existing.status === "declined") {
      // Requesters can't update declined rows under our default RLS policy.
      // Delete any declined request(s) for this pair and recreate a fresh pending one.
      const { error: deleteDeclinedError } = await supabase
        .from("friend_requests")
        .delete()
        .eq("requester_id", user.id)
        .eq("recipient_id", recipientId)
        .eq("status", "declined");

      if (deleteDeclinedError) {
        return NextResponse.json(
          { error: deleteDeclinedError.message },
          { status: 500 }
        );
      }

      const recreatedId = crypto.randomUUID();
      const { error: recreateError } = await supabase
        .from("friend_requests")
        .insert({
          id: recreatedId,
          requester_id: user.id,
          recipient_id: recipientId,
          status: "pending",
        });

      if (recreateError) {
        return NextResponse.json({ error: recreateError.message }, { status: 500 });
      }

      return NextResponse.json({
        status: "pending",
        request_id: recreatedId,
      });
    }

    return NextResponse.json({ status: existing.status, request_id: existing.id });
  }

  const createdId = crypto.randomUUID();
  const { error: insertError } = await supabase
    .from("friend_requests")
    .insert({
      id: createdId,
      requester_id: user.id,
      recipient_id: recipientId,
      status: "pending",
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "pending",
    request_id: createdId,
  });
}
