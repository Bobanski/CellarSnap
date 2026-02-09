import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  identifier: z.string().trim().min(1),
  mode: z.enum(["auto", "username"]).optional(),
});

const emailSchema = z.string().email();

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
    return NextResponse.json({ error: "Identifier required." }, { status: 400 });
  }

  const identifier = parsed.data.identifier;
  const mode = parsed.data.mode ?? "auto";

  if (mode === "auto") {
    const parsedEmail = emailSchema.safeParse(identifier);
    if (parsedEmail.success) {
      return NextResponse.json({ email: parsedEmail.data });
    }
  }

  const { data, error } = await supabase.rpc("get_email_for_username", {
    username: identifier,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "No account matches that email or username." },
      { status: 404 }
    );
  }

  return NextResponse.json({ email: data });
}
