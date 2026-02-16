import { NextResponse } from "next/server";
import { z } from "zod";
import { canUserViewEntry } from "@/lib/access/entryVisibility";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ShareRow = {
  id: string;
  expires_at: string | null;
};

const createShareSchema = z.object({
  postId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

function isSharesSchemaUnavailable(message: string) {
  return (
    message.includes("post_shares") ||
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("schema")
  );
}

function isShareActive(share: ShareRow) {
  if (!share.expires_at) {
    return true;
  }

  const expiresAtMs = Date.parse(share.expires_at);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = createShareSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const expiresAt = payload.data.expiresAt ?? null;
  if (expiresAt) {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return NextResponse.json(
        { error: "expiresAt must be a future timestamp." },
        { status: 400 }
      );
    }
  }

  const { data: targetPost, error: postError } = await supabase
    .from("wine_entries")
    .select("id, user_id, entry_privacy")
    .eq("id", payload.data.postId)
    .maybeSingle();

  if (postError) {
    return NextResponse.json({ error: postError.message }, { status: 500 });
  }

  if (!targetPost) {
    return NextResponse.json(
      { error: "Entry not found." },
      { status: 404 }
    );
  }

  try {
    const canView = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: targetPost.user_id,
      entryPrivacy: targetPost.entry_privacy,
    });
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (visibilityError) {
    const message =
      visibilityError instanceof Error
        ? visibilityError.message
        : "Unable to verify entry visibility.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("post_shares")
    .select("id, expires_at")
    .eq("post_id", payload.data.postId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (existingError) {
    if (isSharesSchemaUnavailable(existingError.message)) {
      return NextResponse.json(
        {
          error:
            "Post sharing is temporarily unavailable. Please try again later. (SHARE_LINKS_UNAVAILABLE)",
          code: "SHARE_LINKS_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingActiveShare = (existingRows as ShareRow[] | null)?.find(isShareActive);

  let shareId = existingActiveShare?.id ?? null;

  if (!shareId) {
    const insertPayload: {
      post_id: string;
      created_by: string;
      mode: "unlisted";
      expires_at?: string | null;
    } = {
      post_id: payload.data.postId,
      created_by: user.id,
      mode: "unlisted",
    };

    if (expiresAt) {
      insertPayload.expires_at = expiresAt;
    }

    const { data: createdShare, error: createError } = await supabase
      .from("post_shares")
      .insert(insertPayload)
      .select("id")
      .single();

    if (createError || !createdShare) {
      if (createError && isSharesSchemaUnavailable(createError.message)) {
        return NextResponse.json(
          {
            error:
              "Post sharing is temporarily unavailable. Please try again later. (SHARE_LINKS_UNAVAILABLE)",
            code: "SHARE_LINKS_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: createError?.message ?? "Unable to create share link." },
        { status: 500 }
      );
    }

    shareId = createdShare.id;
  }

  const siteUrl = getPublicSiteUrlFromRequest(request);
  const url = `${siteUrl}/s/${shareId}`;

  return NextResponse.json({ url });
}
