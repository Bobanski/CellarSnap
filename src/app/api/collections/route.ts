import { z } from "zod";
import { MAX_COLLECTION_NAME_LENGTH } from "@shared";
import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import {
  createOrFindUserCollection,
  listUserCollections,
} from "@/server/collections/service";

const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(MAX_COLLECTION_NAME_LENGTH),
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

  try {
    const collections = await listUserCollections({
      supabase: auth.supabase,
      userId: auth.user.id,
    });
    return NextResponse.json({ collections });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load collections.",
      },
      { status: 500 }
    );
  }
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Collection name is required." },
      { status: 400 }
    );
  }

  try {
    const result = await createOrFindUserCollection({
      supabase: auth.supabase,
      userId: auth.user.id,
      name: parsed.data.name,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create collection.",
      },
      { status: 500 }
    );
  }
}
