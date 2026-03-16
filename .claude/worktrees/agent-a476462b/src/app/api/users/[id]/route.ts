import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFriendRelationship } from "@/lib/friends/relationship";
import { executeSelectWithFallback } from "@/server/db/compat";
import { signPhotoUrl } from "@/server/storage/signedUrls";

type ProfileSelectAttempt = {
  select: string;
  includesNames: boolean;
  includesAvatar: boolean;
};

const PROFILE_SELECT_ATTEMPTS: ProfileSelectAttempt[] = [
  {
    select: "id, display_name, first_name, last_name, avatar_path",
    includesNames: true,
    includesAvatar: true,
  },
  {
    select: "id, display_name, first_name, last_name",
    includesNames: true,
    includesAvatar: false,
  },
  {
    select: "id, display_name, avatar_path",
    includesNames: false,
    includesAvatar: true,
  },
  {
    select: "id, display_name",
    includesNames: false,
    includesAvatar: false,
  },
];

type SelectedProfile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
};

async function selectProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string
): Promise<SelectedProfile | null> {
  const selectResult = await executeSelectWithFallback({
    attempts: PROFILE_SELECT_ATTEMPTS.map((attempt) => ({
      ...attempt,
      missingColumns: ["first_name", "last_name", "avatar_path"] as const,
    })),
    getFallbackColumns: (attempt) => attempt.missingColumns,
    attempt: async (attempt) => {
      const response = (await supabase
        .from("public_profiles")
        .select(attempt.select)
        .eq("id", id)
        .single()) as unknown as {
        data: Record<string, unknown> | null;
        error: { message: string } | null;
      };
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (selectResult.error || !selectResult.data || !selectResult.usedAttempt) {
    return null;
  }

  const data = selectResult.data;
  const attempt = selectResult.usedAttempt;
  return {
    id: typeof data.id === "string" ? data.id : id,
    display_name: typeof data.display_name === "string" ? data.display_name : null,
    first_name:
      attempt.includesNames && typeof data.first_name === "string"
        ? data.first_name
        : null,
    last_name:
      attempt.includesNames && typeof data.last_name === "string"
        ? data.last_name
        : null,
    avatar_path:
      attempt.includesAvatar && typeof data.avatar_path === "string"
        ? data.avatar_path
        : null,
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const profileData = await selectProfile(supabase, id);
  if (!profileData) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let avatar_url: string | null = null;
  const avatarPath = profileData.avatar_path ?? null;
  if (avatarPath) {
    avatar_url = await signPhotoUrl(avatarPath, supabase);
  }

  let relationship;
  try {
    relationship = await getFriendRelationship(supabase, user.id, id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load relationship";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const canViewNames = relationship.friends || user.id === id;

  return NextResponse.json({
    profile: {
      id: profileData.id,
      display_name: profileData.display_name ?? null,
      first_name: canViewNames ? profileData.first_name ?? null : null,
      last_name: canViewNames ? profileData.last_name ?? null : null,
      avatar_url,
      following: relationship.following,
      follows_you: relationship.follows_you,
      friends: relationship.friends,
      friend_status: relationship.status,
      outgoing_request_id: relationship.outgoing_request_id,
      incoming_request_id: relationship.incoming_request_id,
      friend_request_id: relationship.friend_request_id,
    },
  });
}
