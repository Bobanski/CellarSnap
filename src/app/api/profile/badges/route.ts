import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BadgeConfig = {
  id: string;
  name: string;
  symbol: string;
  threshold: number;
  /** Supabase OR filter string applied to wine_entries */
  orFilter?: string;
  /** Single ilike filter: [column, pattern] */
  ilike?: [string, string];
};

const BADGE_DEFINITIONS: BadgeConfig[] = [
  {
    id: "burgundy_bitch",
    name: "Burgundy Bitch",
    symbol: "👑",
    threshold: 10,
    orFilter: "region.ilike.%burgundy%,region.ilike.%bourgogne%",
  },
  {
    id: "california_king",
    name: "California King",
    symbol: "☀️",
    threshold: 10,
    ilike: ["region", "%california%"],
  },
  {
    id: "bordeaux_hoe",
    name: "Bordeaux Hoe",
    symbol: "🏰",
    threshold: 10,
    ilike: ["region", "%bordeaux%"],
  },
  {
    id: "rioja_renegade",
    name: "Rioja Renegade",
    symbol: "🤠",
    threshold: 10,
    orFilter: "region.ilike.%rioja%,appellation.ilike.%rioja%",
  },
  {
    id: "sangiovese_savage",
    name: "Sangiovese Savage",
    symbol: "🐺",
    threshold: 10,
    orFilter: "region.ilike.%chianti%,appellation.ilike.%chianti%",
  },
  {
    id: "rhone_rider",
    name: "Rhone Rider",
    symbol: "🏇",
    threshold: 10,
    orFilter: "region.ilike.%rhone%,region.ilike.%rhône%",
  },
  {
    id: "margaux_monarch",
    name: "Margaux Monarch",
    symbol: "👸",
    threshold: 10,
    ilike: ["appellation", "%margaux%"],
  },
  {
    id: "chianti_connoisseur",
    name: "Chianti Connoisseur",
    symbol: "🍷",
    threshold: 10,
    orFilter: "region.ilike.%chianti%,appellation.ilike.%chianti%",
  },
  {
    id: "mosel_maniac",
    name: "Mosel Maniac",
    symbol: "🌊",
    threshold: 10,
    ilike: ["region", "%mosel%"],
  },
  {
    id: "champagne_champion",
    name: "Champagne Champion",
    symbol: "🥂",
    threshold: 10,
    ilike: ["region", "%champagne%"],
  },
];

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const badges = await Promise.all(
    BADGE_DEFINITIONS.map(async (badge) => {
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
