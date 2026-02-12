import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFriendRelationship } from "@/lib/friends/relationship";

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

function hasMissingProfileColumns(message: string) {
  return (
    message.includes("first_name") ||
    message.includes("last_name") ||
    message.includes("avatar_path")
  );
}

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
  for (const attempt of PROFILE_SELECT_ATTEMPTS) {
    const response = (await supabase
      .from("profiles")
      .select(attempt.select)
      .eq("id", id)
      .single()) as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };
    const { data, error } = response;

    if (!error && data) {
      return {
        id: typeof data.id === "string" ? data.id : id,
        display_name:
          typeof data.display_name === "string" ? data.display_name : null,
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

    if (error && hasMissingProfileColumns(error.message)) {
      continue;
    }

    return null;
  }

  return null;
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
    const { data: urlData } = await supabase.storage
      .from("wine-photos")
      .createSignedUrl(avatarPath, 60 * 60);
    avatar_url = urlData?.signedUrl ?? null;
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
