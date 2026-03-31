import { z } from "zod";
import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { addEntryToCollections } from "@/server/collections/service";

const addCollectionItemsSchema = z.object({
  entryId: z.string().uuid(),
  collectionIds: z.array(z.string().uuid()).max(50),
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

  const parsed = addCollectionItemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid collection request." }, { status: 400 });
  }

  try {
    const result = await addEntryToCollections({
      supabase: auth.supabase,
      userId: auth.user.id,
      entryId: parsed.data.entryId,
      collectionIds: parsed.data.collectionIds,
    });
    return NextResponse.json({
      added_collection_ids: result.addedCollectionIds,
      already_saved_collection_ids: result.alreadySavedCollectionIds,
      memberships: result.memberships,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save to collections.";
    const status =
      message === "Entry unavailable." ||
      message === "One or more selected collections are unavailable."
        ? 404
        : message === "You can only save posts that are visible to you."
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
