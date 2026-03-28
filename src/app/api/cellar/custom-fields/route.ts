import { NextResponse } from "next/server";
import { z } from "zod";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";

const createFieldSchema = z.object({
  field_name: z.string().min(1).max(100),
  field_type: z.enum(["text", "number", "date"]),
});

export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("cellar_custom_field_defs")
    .select("id, field_name, field_type, position, created_at")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fields: data ?? [] });
}

export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createFieldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { field_name, field_type } = parsed.data;

  // Get max position for this user
  const { data: maxRow } = await supabase
    .from("cellar_custom_field_defs")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("cellar_custom_field_defs")
    .insert({
      user_id: user.id,
      field_name,
      field_type,
      position: nextPosition,
    })
    .select("id, field_name, field_type, position, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A custom field with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ field: data }, { status: 201 });
}
