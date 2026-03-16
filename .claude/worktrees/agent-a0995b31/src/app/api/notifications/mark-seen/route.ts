import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("wine_notifications")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("seen_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: requestsError } = await supabase
    .from("friend_requests")
    .update({ seen_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .is("seen_at", null);

  if (requestsError) {
    return NextResponse.json({ error: requestsError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
