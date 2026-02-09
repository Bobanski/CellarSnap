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

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH, USERNAME_MIN_LENGTH_MESSAGE)
    .max(USERNAME_MAX_LENGTH, USERNAME_MAX_LENGTH_MESSAGE)
    .refine(
      (value) => !USERNAME_DISALLOWED_PATTERN.test(value),
      USERNAME_FORMAT_MESSAGE
    ),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Username required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("is_username_available", {
    username: parsed.data.username,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ available: Boolean(data) });
}
