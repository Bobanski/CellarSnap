import { z } from "zod";
import { MAX_COLLECTION_NAME_LENGTH } from "@shared";
import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import {
  deleteUserCollection,
  getCollectionDetail,
  updateUserCollectionName,
} from "@/server/collections/service";

const updateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(MAX_COLLECTION_NAME_LENGTH),
});

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

export async function PATCH(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Collection name is required.",
      },
      { status: 400 }
    );
  }

  const { id } = await params;

  try {
    const collection = await updateUserCollectionName({
      supabase: auth.supabase,
      userId: auth.user.id,
      collectionId: id,
      name: parsed.data.name,
    });
    return NextResponse.json({ collection });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update collection.";
    const status =
      message === "Collection not found."
        ? 404
        : message === "You already have a collection with that name."
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
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
    const result = await deleteUserCollection({
      supabase: auth.supabase,
      userId: auth.user.id,
      collectionId: id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete collection.";
    const status = message === "Collection not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
