import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GrapeOption = {
  id: string;
  name: string;
};

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function grapeScore({
  name,
  lowerQuery,
  normalizedQuery,
}: {
  name: string;
  lowerQuery: string;
  normalizedQuery: string;
}) {
  const lowerName = name.toLowerCase();
  const normalizedName = normalizeQuery(name);

  if (lowerName === lowerQuery || normalizedName === normalizedQuery) {
    return 0;
  }

  if (
    lowerName.startsWith(lowerQuery) ||
    normalizedName.startsWith(normalizedQuery)
  ) {
    return 1;
  }

  if (lowerName.includes(lowerQuery) || normalizedName.includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  if (query.length === 0) {
    return NextResponse.json({ grapes: [] });
  }

  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return NextResponse.json({ grapes: [] });
  }

  const { data: byName, error: byNameError } = await supabase
    .from("grape_varieties")
    .select("id, name")
    .ilike("name", `%${query}%`)
    .order("name", { ascending: true })
    .limit(limit);

  if (byNameError) {
    if (byNameError.message.includes("grape_varieties")) {
      return NextResponse.json(
        {
          error:
            "Primary grape metadata is not available yet. Run supabase/sql/019_entry_classification_and_primary_grapes.sql and try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: byNameError.message }, { status: 500 });
  }

  const { data: aliasRows, error: aliasError } = await supabase
    .from("grape_aliases")
    .select("variety_id")
    .ilike("alias_normalized", `%${normalizedQuery}%`)
    .limit(limit);

  if (aliasError) {
    if (aliasError.message.includes("grape_aliases")) {
      return NextResponse.json(
        {
          error:
            "Primary grape metadata is not available yet. Run supabase/sql/019_entry_classification_and_primary_grapes.sql and try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: aliasError.message }, { status: 500 });
  }

  const map = new Map<string, GrapeOption>();
  (byName ?? []).forEach((row) => {
    map.set(row.id, { id: row.id, name: row.name });
  });

  const aliasVarietyIds = Array.from(
    new Set((aliasRows ?? []).map((row) => row.variety_id))
  );

  if (aliasVarietyIds.length > 0) {
    const { data: aliasVarieties, error: aliasVarietiesError } = await supabase
      .from("grape_varieties")
      .select("id, name")
      .in("id", aliasVarietyIds)
      .order("name", { ascending: true })
      .limit(limit);

    if (aliasVarietiesError) {
      return NextResponse.json(
        { error: aliasVarietiesError.message },
        { status: 500 }
      );
    }

    (aliasVarieties ?? []).forEach((row) => {
      map.set(row.id, { id: row.id, name: row.name });
    });
  }

  const lowerQuery = query.toLowerCase();
  const grapes = Array.from(map.values())
    .sort((a, b) => {
      const scoreDelta =
        grapeScore({
          name: a.name,
          lowerQuery,
          normalizedQuery,
        }) -
        grapeScore({
          name: b.name,
          lowerQuery,
          normalizedQuery,
        });

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);

  return NextResponse.json({ grapes });
}
