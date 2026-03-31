import { z } from "zod";
import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { listEntryCollectionsByEntryIds } from "@/server/collections/service";

const byEntrySchema = z.object({
  entryIds: z.array(z.string().uuid()).max(250),
});

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = byEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid entry selection." }, { status: 400 });
  }

  try {
    const memberships = await listEntryCollectionsByEntryIds({
      supabase: auth.supabase,
      userId: auth.user.id,
      entryIds: parsed.data.entryIds,
    });
    return NextResponse.json({ memberships });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load entry collections.",
      },
      { status: 500 }
    );
  }
}
