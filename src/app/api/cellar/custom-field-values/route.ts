import { NextResponse } from "next/server";
import { z } from "zod";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";

const upsertValueSchema = z.object({
  entry_id: z.string().uuid(),
  field_def_id: z.string().uuid(),
  value: z.string(),
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

  const { supabase } = auth;

  const url = new URL(request.url);
  const entryIdsParam = url.searchParams.get("entry_ids");

  if (!entryIdsParam) {
    return NextResponse.json({ error: "entry_ids query parameter is required" }, { status: 400 });
  }

  const entryIds = entryIdsParam.split(",").filter(Boolean);

  if (entryIds.length === 0) {
    return NextResponse.json({ values: [] });
  }

  // RLS ensures only the user's own entries' values are returned
  const { data, error } = await supabase
    .from("cellar_custom_field_values")
    .select("entry_id, field_def_id, value")
    .in("entry_id", entryIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ values: data ?? [] });
}

export async function PUT(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = upsertValueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { entry_id, field_def_id, value } = parsed.data;

  const { data, error } = await supabase
    .from("cellar_custom_field_values")
    .upsert(
      { entry_id, field_def_id, value },
      { onConflict: "entry_id,field_def_id" }
    )
    .select("entry_id, field_def_id, value")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value: data });
}
