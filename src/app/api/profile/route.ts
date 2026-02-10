import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  USERNAME_DISALLOWED_PATTERN,
} from "@/lib/validation/username";

const privacyLevelSchema = z.enum(["public", "friends", "private"]);

const updateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH, USERNAME_MIN_LENGTH_MESSAGE)
    .max(USERNAME_MAX_LENGTH, USERNAME_MAX_LENGTH_MESSAGE)
    .refine(
      (value) => !USERNAME_DISALLOWED_PATTERN.test(value),
      USERNAME_FORMAT_MESSAGE
    )
    .optional(),
  default_entry_privacy: privacyLevelSchema.optional(),
  confirm_privacy_onboarding: z.literal(true).optional(),
}).refine(
  (value) =>
    value.display_name !== undefined ||
    value.default_entry_privacy !== undefined ||
    value.confirm_privacy_onboarding !== undefined,
  { message: "No profile updates provided." }
);

function hasMissingPrivacyColumns(message: string) {
  return (
    message.includes("default_entry_privacy") ||
    message.includes("privacy_confirmed_at")
  );
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try fetching with privacy columns; fall back if columns were not added yet.
  let profile: Record<string, unknown> | null = null;

  const selectWithAvatar =
    "id, display_name, email, default_entry_privacy, privacy_confirmed_at, created_at, avatar_path";
  const { data, error } = await supabase
    .from("profiles")
    .select(selectWithAvatar)
    .eq("id", user.id)
    .single();

  if (error && hasMissingPrivacyColumns(error.message)) {
    const fallback = await supabase
      .from("profiles")
      .select("id, display_name, email, created_at")
      .eq("id", user.id)
      .single();

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    profile = {
      ...fallback.data,
      default_entry_privacy: "public",
      privacy_confirmed_at: fallback.data?.created_at ?? null,
    };
  } else if (error && error.message.includes("avatar_path")) {
    // avatar_path column may not exist yet (migration not run)
    const fallback = await supabase
      .from("profiles")
      .select("id, display_name, email, default_entry_privacy, privacy_confirmed_at, created_at")
      .eq("id", user.id)
      .single();
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    profile = fallback.data;
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    profile = data;
  }

  // Resolve avatar: use profile.avatar_path if present, else fetch explicitly (avoids fallback stripping it)
  let avatarPath = profile?.avatar_path as string | null | undefined;
  if (avatarPath == null) {
    const { data: row } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle();
    avatarPath = row?.avatar_path ?? null;
  }
  let avatar_url: string | null = null;
  if (avatarPath) {
    const { data: urlData } = await supabase.storage
      .from("wine-photos")
      .createSignedUrl(avatarPath, 60 * 60);
    avatar_url = urlData?.signedUrl ?? null;
  }

  return NextResponse.json(
    { profile: { ...profile, avatar_path: avatarPath, avatar_url } },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    }
  );
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const message =
      flattened.formErrors[0] ??
      flattened.fieldErrors.display_name?.[0] ??
      flattened.fieldErrors.default_entry_privacy?.[0] ??
      flattened.fieldErrors.confirm_privacy_onboarding?.[0] ??
      "Invalid profile update.";
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }

  const confirmedPrivacyAt = parsed.data.confirm_privacy_onboarding
    ? new Date().toISOString()
    : null;

  const updates: Record<string, string> = {};
  if (parsed.data.display_name !== undefined) {
    const { data: exists } = await supabase
      .from("profiles")
      .select("id")
      .ilike("display_name", parsed.data.display_name)
      .neq("id", user.id)
      .maybeSingle();

    if (exists) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 400 }
      );
    }

    updates.display_name = parsed.data.display_name;
  }
  if (parsed.data.default_entry_privacy !== undefined) {
    updates.default_entry_privacy = parsed.data.default_entry_privacy;
  }
  if (confirmedPrivacyAt) {
    updates.privacy_confirmed_at = confirmedPrivacyAt;
  }

  let profileData:
    | {
        id: string;
        display_name: string | null;
        email: string | null;
        created_at: string;
      }
    | null = null;
  let missingPrivacyColumns = false;

  const initialUpdate = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("id, display_name, email, created_at")
    .single();

  if (initialUpdate.error && hasMissingPrivacyColumns(initialUpdate.error.message)) {
    missingPrivacyColumns = true;

    const fallbackUpdates: Record<string, string> = {};
    if (updates.display_name !== undefined) {
      fallbackUpdates.display_name = updates.display_name;
    }

    if (Object.keys(fallbackUpdates).length > 0) {
      const fallbackUpdate = await supabase
        .from("profiles")
        .update(fallbackUpdates)
        .eq("id", user.id)
        .select("id, display_name, email, created_at")
        .single();

      if (fallbackUpdate.error) {
        return NextResponse.json({ error: fallbackUpdate.error.message }, { status: 500 });
      }
      profileData = fallbackUpdate.data;
    } else {
      const fallbackProfile = await supabase
        .from("profiles")
        .select("id, display_name, email, created_at")
        .eq("id", user.id)
        .single();

      if (fallbackProfile.error) {
        return NextResponse.json({ error: fallbackProfile.error.message }, { status: 500 });
      }
      profileData = fallbackProfile.data;
    }
  } else if (initialUpdate.error) {
    return NextResponse.json({ error: initialUpdate.error.message }, { status: 500 });
  } else {
    profileData = initialUpdate.data;
  }

  if (!profileData) {
    return NextResponse.json({ error: "Unable to update profile." }, { status: 500 });
  }

  if (missingPrivacyColumns) {
    return NextResponse.json({
      profile: {
        ...profileData,
        default_entry_privacy: parsed.data.default_entry_privacy ?? "public",
        privacy_confirmed_at: confirmedPrivacyAt ?? profileData.created_at ?? null,
      },
    });
  }

  // Re-read with privacy columns if they exist.
  const full = await supabase
    .from("profiles")
    .select("default_entry_privacy, privacy_confirmed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (full.error && !hasMissingPrivacyColumns(full.error.message)) {
    return NextResponse.json({ error: full.error.message }, { status: 500 });
  }

  const profile = {
    ...profileData,
    default_entry_privacy: full.data?.default_entry_privacy ?? null,
    privacy_confirmed_at: full.data?.privacy_confirmed_at ?? null,
  };

  return NextResponse.json({ profile });
}
