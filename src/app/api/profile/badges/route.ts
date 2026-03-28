import { NextResponse } from "next/server";
import { PROFILE_BADGE_DEFINITIONS } from "@shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const badges = await Promise.all(
    PROFILE_BADGE_DEFINITIONS.map(async (badge) => {
      let query = supabase
        .from("wine_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (badge.orFilter) {
        query = query.or(badge.orFilter);
      } else if (badge.ilike) {
        query = query.ilike(badge.ilike[0], badge.ilike[1]);
      }

      const { count } = await query;

      return {
        id: badge.id,
        name: badge.name,
        symbol: badge.symbol,
        threshold: badge.threshold,
        count: count ?? 0,
        earned: (count ?? 0) >= badge.threshold,
      };
    })
  );

  return NextResponse.json({ badges });
}
