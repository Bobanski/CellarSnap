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
const NAME_MAX_LENGTH = 80;

const nullableNameSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return value;
  },
  z
    .string()
    .max(NAME_MAX_LENGTH, `Must be ${NAME_MAX_LENGTH} characters or fewer.`)
    .nullable()
    .optional()
);

const updateProfileSchema = z
  .object({
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
    first_name: nullableNameSchema,
    last_name: nullableNameSchema,
    default_entry_privacy: privacyLevelSchema.optional(),
    confirm_privacy_onboarding: z.literal(true).optional(),
  })
  .refine(
    (value) =>
      value.display_name !== undefined ||
      value.first_name !== undefined ||
      value.last_name !== undefined ||
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

function hasMissingNameColumns(message: string) {
  return message.includes("first_name") || message.includes("last_name");
}

function hasMissingAvatarColumn(message: string) {
  return message.includes("avatar_path");
}

function hasMissingKnownProfileColumns(message: string) {
  return (
    hasMissingPrivacyColumns(message) ||
    hasMissingNameColumns(message) ||
    hasMissingAvatarColumn(message)
  );
}

type ProfileSelectAttempt = {
  select: string;
  includesPrivacy: boolean;
  includesNames: boolean;
  includesAvatar: boolean;
};

const PROFILE_SELECT_ATTEMPTS: ProfileSelectAttempt[] = [
  {
    select:
      "id, display_name, first_name, last_name, email, default_entry_privacy, privacy_confirmed_at, created_at, avatar_path",
    includesPrivacy: true,
    includesNames: true,
    includesAvatar: true,
  },
  {
    select:
      "id, display_name, first_name, last_name, email, default_entry_privacy, privacy_confirmed_at, created_at",
    includesPrivacy: true,
    includesNames: true,
    includesAvatar: false,
  },
  {
    select:
      "id, display_name, first_name, last_name, email, created_at, avatar_path",
    includesPrivacy: false,
    includesNames: true,
    includesAvatar: true,
  },
  {
    select: "id, display_name, first_name, last_name, email, created_at",
    includesPrivacy: false,
    includesNames: true,
    includesAvatar: false,
  },
  {
    select:
      "id, display_name, email, default_entry_privacy, privacy_confirmed_at, created_at, avatar_path",
    includesPrivacy: true,
    includesNames: false,
    includesAvatar: true,
  },
  {
    select:
      "id, display_name, email, default_entry_privacy, privacy_confirmed_at, created_at",
    includesPrivacy: true,
    includesNames: false,
    includesAvatar: false,
  },
  {
    select: "id, display_name, email, created_at, avatar_path",
    includesPrivacy: false,
    includesNames: false,
    includesAvatar: true,
  },
  {
    select: "id, display_name, email, created_at",
    includesPrivacy: false,
    includesNames: false,
    includesAvatar: false,
  },
];

async function selectProfileRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<{
  data: Record<string, unknown> | null;
  attempt: ProfileSelectAttempt | null;
  error: string | null;
}> {
  for (const attempt of PROFILE_SELECT_ATTEMPTS) {
    const response = (await supabase
      .from("profiles")
      .select(attempt.select)
      .eq("id", userId)
      .single()) as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };
    const { data, error } = response;

    if (!error && data) {
      return {
        data,
        attempt,
        error: null,
      };
    }

    if (error && hasMissingKnownProfileColumns(error.message)) {
      continue;
    }

    return {
      data: null,
      attempt: null,
      error: error?.message ?? "Unable to load profile.",
    };
  }

  return {
    data: null,
    attempt: null,
    error: "Unable to load profile.",
  };
}

function normalizeProfileRow(
  row: Record<string, unknown>,
  attempt: ProfileSelectAttempt
) {
  const normalized: Record<string, unknown> = { ...row };
  if (!attempt.includesPrivacy) {
    normalized.default_entry_privacy = "public";
    normalized.privacy_confirmed_at =
      typeof row.created_at === "string" ? row.created_at : null;
  }
  if (!attempt.includesNames) {
    normalized.first_name = null;
    normalized.last_name = null;
  }
  return normalized;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const selected = await selectProfileRow(supabase, user.id);
  if (!selected.data || !selected.attempt) {
    return NextResponse.json(
      { error: selected.error ?? "Unable to load profile." },
      { status: 500 }
    );
  }

  const profile = normalizeProfileRow(selected.data, selected.attempt);

  let avatarPath =
    typeof profile.avatar_path === "string" ? profile.avatar_path : null;
  if (!selected.attempt.includesAvatar || avatarPath == null) {
    const { data: avatarRow, error: avatarError } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    if (avatarError && !hasMissingAvatarColumn(avatarError.message)) {
      return NextResponse.json({ error: avatarError.message }, { status: 500 });
    }

    avatarPath =
      typeof avatarRow?.avatar_path === "string" ? avatarRow.avatar_path : null;
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const message =
      flattened.formErrors[0] ??
      flattened.fieldErrors.display_name?.[0] ??
      flattened.fieldErrors.first_name?.[0] ??
      flattened.fieldErrors.last_name?.[0] ??
      flattened.fieldErrors.default_entry_privacy?.[0] ??
      flattened.fieldErrors.confirm_privacy_onboarding?.[0] ??
      "Invalid profile update.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const confirmedPrivacyAt = parsed.data.confirm_privacy_onboarding
    ? new Date().toISOString()
    : null;

  const updates: Record<string, string | null> = {};

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

  if (parsed.data.first_name !== undefined) {
    updates.first_name = parsed.data.first_name;
  }

  if (parsed.data.last_name !== undefined) {
    updates.last_name = parsed.data.last_name;
  }

  if (parsed.data.default_entry_privacy !== undefined) {
    updates.default_entry_privacy = parsed.data.default_entry_privacy;
  }

  if (confirmedPrivacyAt) {
    updates.privacy_confirmed_at = confirmedPrivacyAt;
  }

  const updatesToApply: Record<string, string | null> = { ...updates };
  while (Object.keys(updatesToApply).length > 0) {
    const updateResult = await supabase
      .from("profiles")
      .update(updatesToApply)
      .eq("id", user.id)
      .select("id")
      .single();

    if (!updateResult.error) {
      break;
    }

    const message = updateResult.error.message;
    let removedUnsupportedColumn = false;

    if (hasMissingPrivacyColumns(message)) {
      if ("default_entry_privacy" in updatesToApply) {
        delete updatesToApply.default_entry_privacy;
        removedUnsupportedColumn = true;
      }
      if ("privacy_confirmed_at" in updatesToApply) {
        delete updatesToApply.privacy_confirmed_at;
        removedUnsupportedColumn = true;
      }
    }

    if (hasMissingNameColumns(message)) {
      if ("first_name" in updatesToApply) {
        delete updatesToApply.first_name;
        removedUnsupportedColumn = true;
      }
      if ("last_name" in updatesToApply) {
        delete updatesToApply.last_name;
        removedUnsupportedColumn = true;
      }
    }

    if (!removedUnsupportedColumn) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const selected = await selectProfileRow(supabase, user.id);
  if (!selected.data || !selected.attempt) {
    return NextResponse.json(
      { error: selected.error ?? "Unable to update profile." },
      { status: 500 }
    );
  }

  const profile = normalizeProfileRow(selected.data, selected.attempt);
  return NextResponse.json({ profile });
}
