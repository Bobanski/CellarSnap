import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { id } = await params;

  const { data: requestRow, error: fetchError } = await supabase
    .from("friend_requests")
    .select("id, recipient_id, status")
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

  const { data: updated, error } = await supabase
    .from("friend_requests")
    .update({
      status: "declined",
      responded_at: new Date().toISOString(),
      seen_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Request could not be declined." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    status: updated.status,
    request_id: updated.id,
  });
}
