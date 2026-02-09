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
}).refine(
  (value) =>
    value.display_name !== undefined ||
    value.default_entry_privacy !== undefined,
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

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, default_entry_privacy")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
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

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("id, display_name, email, default_entry_privacy")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
