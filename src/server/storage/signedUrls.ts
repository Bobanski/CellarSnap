import { authenticatedPhotoUrl, isValidPhotoPath } from "@/lib/storage/photoDelivery";
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

/** Authorization/existence only: adopted clients never mint Storage signatures. */
async function requestPhotoUrls(
  paths: Iterable<string | null | undefined>,
  supabase: SignedUrlSupabaseClient,
  options?: SignPhotoUrlOptions
) {
  const unique = [...new Set([...paths].filter((path): path is string =>
    Boolean(path) && (!(options?.treatPendingAsNull ?? true) || path !== 'pending')
  ))];
  const result = new Map<string, string | null>(unique.map(path => [path, null]));
  const valid = unique.filter(isValidPhotoPath);
  for (let offset = 0; offset < valid.length; offset += 100) {
    const batch = valid.slice(offset, offset + 100);
    const { data, error } = await supabase.rpc('readable_wine_photo_paths', { object_names: batch });
    // Fail closed without a legacy-signing fallback if the RPC is unavailable.
    if (error || !Array.isArray(data)) continue;
    const requested = new Set(batch);
    for (const path of data) {
      if (typeof path === 'string' && requested.has(path)) result.set(path, authenticatedPhotoUrl(path));
    }
  }
  return result;
}

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

  if (bucket === DEFAULT_PHOTO_BUCKET) {
    return (await requestPhotoUrls([path], supabase, options)).get(path) ?? null;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function signPhotoUrls(
  paths: Iterable<string | null | undefined>,
  supabase: SignedUrlSupabaseClient,
  options?: SignPhotoUrlOptions
) {
  const bucket = options?.bucket ?? DEFAULT_PHOTO_BUCKET;
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  if (bucket === DEFAULT_PHOTO_BUCKET) {
    return requestPhotoUrls(paths, supabase, options);
  }
  const result = await signPhotoPaths(paths, {
    signBatch: (batch) => supabase.storage.from(bucket).createSignedUrls(batch, ttlSeconds),
    signOne: (path) => signPhotoUrl(path, supabase, options),
  }, options);
  return result;
}
