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

  const { data: reverse, error: reverseError } = await supabase
    .from("friend_requests")
    .select("id, status")
    .eq("requester_id", recipientId)
    .eq("recipient_id", user.id)
    .maybeSingle();

  if (reverseError) {
    return NextResponse.json({ error: reverseError.message }, { status: 500 });
  }

  if (reverse && reverse.status === "pending") {
    const { error: acceptError } = await supabase
      .from("friend_requests")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        seen_at: new Date().toISOString(),
      })
      .eq("id", reverse.id);

    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 500 });
    }

    return NextResponse.json({ status: "accepted", request_id: reverse.id });
  }

  if (reverse && reverse.status === "accepted") {
    return NextResponse.json({ status: "accepted", request_id: reverse.id });
  }

  const { data: existing } = await supabase
    .from("friend_requests")
    .select("id, status")
    .eq("requester_id", user.id)
    .eq("recipient_id", recipientId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "declined") {
      const { data: revived, error: reviveError } = await supabase
        .from("friend_requests")
        .update({
          status: "pending",
          responded_at: null,
          seen_at: null,
        })
        .eq("id", existing.id)
        .eq("requester_id", user.id)
        .select("id, status")
        .single();

      if (reviveError) {
        return NextResponse.json({ error: reviveError.message }, { status: 500 });
      }

      return NextResponse.json({
        status: revived.status,
        request_id: revived.id,
      });
    }

    return NextResponse.json({ status: existing.status, request_id: existing.id });
  }

  const { data: created, error: insertError } = await supabase
    .from("friend_requests")
    .insert({
      requester_id: user.id,
      recipient_id: recipientId,
      status: "pending",
    })
    .select("id, status")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: created.status,
    request_id: created.id,
  });
}
