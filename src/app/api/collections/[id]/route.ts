import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { getCollectionDetail } from "@/server/collections/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { id } = await params;

  try {
    const detail = await getCollectionDetail({
      supabase: auth.supabase,
      userId: auth.user.id,
      collectionId: id,
    });
    return NextResponse.json(detail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load collection.";
    const status = message === "Collection not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
