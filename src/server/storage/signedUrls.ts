import { authenticatedPhotoUrl, isValidPhotoPath, usesCookiePhotoDelivery } from "@/lib/storage/photoDelivery";
import { signPhotoPaths } from "@shared/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const DEFAULT_PHOTO_BUCKET = "wine-photos";

type SignedUrlSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type SignPhotoUrlOptions = {
  bucket?: string;
  ttlSeconds?: number;
  treatPendingAsNull?: boolean;
};

export async function signPhotoUrl(
  path: string | null | undefined,
  supabase: SignedUrlSupabaseClient,
  options?: SignPhotoUrlOptions
) {
  const bucket = options?.bucket ?? DEFAULT_PHOTO_BUCKET;
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const treatPendingAsNull = options?.treatPendingAsNull ?? true;

  if (!path) {
    return null;
  }

  if (treatPendingAsNull && path === "pending") {
    return null;
  }

  if (path !== "pending" && !isValidPhotoPath(path)) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);

  if (error) {
    return null;
  }

  return bucket === DEFAULT_PHOTO_BUCKET && usesCookiePhotoDelivery(supabase)
    ? authenticatedPhotoUrl(path) : data.signedUrl;
}

export async function signPhotoUrls(
  paths: Iterable<string | null | undefined>,
  supabase: SignedUrlSupabaseClient,
  options?: SignPhotoUrlOptions
) {
  const bucket = options?.bucket ?? DEFAULT_PHOTO_BUCKET;
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  // Preserve batched existence/permission checks and null placeholders. Any
  // capabilities created here stay server-side for cookie-web responses.
  const result = await signPhotoPaths(paths, {
    signBatch: (batch) => supabase.storage.from(bucket).createSignedUrls(batch, ttlSeconds),
    signOne: (path) => signPhotoUrl(path, supabase, options),
  }, options);
  if (bucket === DEFAULT_PHOTO_BUCKET && usesCookiePhotoDelivery(supabase)) {
    for (const [path, url] of result) result.set(path, url && isValidPhotoPath(path) ? authenticatedPhotoUrl(path) : null);
  }
  return result;
}
