import { authenticatedPhotoUrl, isValidPhotoPath, signPhotoPaths } from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";

type MobileSupabaseClient = typeof supabase;

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const DEFAULT_PHOTO_BUCKET = "wine-photos";

type SignPhotoUrlOptions = {
  supabaseClient?: MobileSupabaseClient;
  bucket?: string;
  ttlSeconds?: number;
  treatPendingAsNull?: boolean;
};

export async function signPhotoUrl(
  path: string | null | undefined,
  options?: SignPhotoUrlOptions
) {
  const treatPendingAsNull = options?.treatPendingAsNull ?? true;
  if (!path) {
    return null;
  }
  if (treatPendingAsNull && path === "pending") {
    return null;
  }

  const supabaseClient = options?.supabaseClient ?? supabase;
  const bucket = options?.bucket ?? DEFAULT_PHOTO_BUCKET;
  if (bucket === DEFAULT_PHOTO_BUCKET) return isValidPhotoPath(path) ? authenticatedPhotoUrl(path) : null;
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function signPhotoUrls(
  paths: Iterable<string | null | undefined>,
  options?: SignPhotoUrlOptions
) {
  const supabaseClient = options?.supabaseClient ?? supabase;
  const bucket = options?.bucket ?? DEFAULT_PHOTO_BUCKET;
  if (bucket === DEFAULT_PHOTO_BUCKET) {
    return new Map(Array.from(new Set(paths)).filter((path): path is string => typeof path === "string" && isValidPhotoPath(path))
      .map(path => [path, authenticatedPhotoUrl(path)]));
  }
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  return signPhotoPaths(paths, {
    signBatch: (batch) => supabaseClient.storage.from(bucket).createSignedUrls(batch, ttlSeconds),
    signOne: (path) => signPhotoUrl(path, options),
  }, options);
}
