import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeSelectWithFallback } from "@/server/db/compat";

function sanitizeUserSearch(search: string) {
  // Prevent PostgREST `.or()` filter syntax issues.
  return search.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

function buildTokenAndFilter(tokens: string[], fields: string[]) {
  const cleaned = tokens.map((token) => token.trim()).filter(Boolean).slice(0, 4);
  if (cleaned.length <= 1) return null;

  const tokenOr = (token: string) => {
    const pattern = `%${token}%`;
    return `or(${fields.map((field) => `${field}.ilike.${pattern}`).join(",")})`;
  };

  return `and(${cleaned.map(tokenOr).join(",")})`;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = sanitizeUserSearch(searchParams.get("search")?.trim() ?? "");

  const buildProfileQuery = (includeNameColumns: boolean) => {
    const query = supabase
      .from("public_profiles")
      .select("id, display_name")
      .neq("id", user.id)
      .order("display_name", { ascending: true });

    if (!search) {
      return query;
    }

    const pattern = `%${search}%`;
    const tokens = search.split(" ").filter(Boolean);
    const searchableFields = includeNameColumns
      ? ["display_name", "first_name", "last_name"]
      : ["display_name"];
    const tokenAndFilter = buildTokenAndFilter(tokens, searchableFields);
    const filters = includeNameColumns
      ? [
          `display_name.ilike.${pattern}`,
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          tokenAndFilter,
        ]
      : [`display_name.ilike.${pattern}`, tokenAndFilter];

    return query.or(filters.filter(Boolean).join(",")).limit(25);
  };

  let data: { id: string; display_name: string | null }[] | null;
  let error: { message: string } | null;

  if (search) {
    const searchResult = await executeSelectWithFallback({
      attempts: [
        { includeNameColumns: true, missingColumns: ["first_name", "last_name"] as const },
        { includeNameColumns: false, missingColumns: [] as const },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      attempt: async (attempt) => {
        const response = await buildProfileQuery(attempt.includeNameColumns);
        return {
          data: response.data,
          error: response.error,
        };
      },
    });
    data = searchResult.data;
    error = searchResult.error;
  } else {
    const response = await buildProfileQuery(false);
    data = response.data;
    error = response.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = data ?? [];
  const userIds = users.map((candidate) => candidate.id);

  if (userIds.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const [{ data: outgoingRows, error: outgoingError }, { data: incomingRows, error: incomingError }] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("id, recipient_id, status")
      .eq("requester_id", user.id)
      .in("recipient_id", userIds)
      .in("status", ["pending", "accepted"]),
    supabase
      .from("friend_requests")
      .select("id, requester_id, status")
      .eq("recipient_id", user.id)
      .in("requester_id", userIds)
      .in("status", ["pending", "accepted"]),
  ]);

  if (outgoingError || incomingError) {
    return NextResponse.json(
      { error: outgoingError?.message ?? incomingError?.message ?? "Unable to load relationships." },
      { status: 500 }
    );
  }

  const outgoingById = new Map(
    (outgoingRows ?? []).map((row) => [row.recipient_id, row])
  );
  const incomingById = new Map(
    (incomingRows ?? []).map((row) => [row.requester_id, row])
  );

  return NextResponse.json({
    users: users.map((candidate) => {
      const outgoing = outgoingById.get(candidate.id);
      const incoming = incomingById.get(candidate.id);

      const outgoingPending = outgoing?.status === "pending";
      const incomingPending = incoming?.status === "pending";
      const outgoingAccepted = outgoing?.status === "accepted";
      const incomingAccepted = incoming?.status === "accepted";
      const friends = outgoingAccepted || incomingAccepted;

      const friendStatus = friends
        ? "friends"
        : outgoingPending
          ? "request_sent"
          : incomingPending
            ? "request_received"
            : "none";

      const following = friends || outgoingPending;
      const follows_you = friends || incomingPending;

      return {
        ...candidate,
        following,
        follows_you,
        friends,
        friend_status: friendStatus,
        outgoing_request_id: outgoingPending ? outgoing?.id ?? null : null,
        incoming_request_id: incomingPending ? incoming?.id ?? null : null,
        friend_request_id: outgoingAccepted
          ? outgoing?.id ?? null
          : incomingAccepted
            ? incoming?.id ?? null
            : null,
      };
    }),
  });
}
