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

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, email, default_entry_privacy, privacy_confirmed_at, created_at"
    )
    .eq("id", user.id)
    .single();

  if (
    error &&
    (error.message.includes("default_entry_privacy") ||
      error.message.includes("privacy_confirmed_at"))
  ) {
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
      privacy_confirmed_at: null,
    };
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    profile = data;
  }

  return NextResponse.json({ profile });
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
  if (parsed.data.confirm_privacy_onboarding) {
    updates.privacy_confirmed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("id, display_name, email, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-read with privacy columns if they exist.
  const full = await supabase
    .from("profiles")
    .select("default_entry_privacy, privacy_confirmed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (
    full.error &&
    !full.error.message.includes("default_entry_privacy") &&
    !full.error.message.includes("privacy_confirmed_at")
  ) {
    return NextResponse.json({ error: full.error.message }, { status: 500 });
  }

  const profile = {
    ...data,
    default_entry_privacy: full.data?.default_entry_privacy ?? null,
    privacy_confirmed_at: full.data?.privacy_confirmed_at ?? null,
  };

  return NextResponse.json({ profile });
}
