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
  const uniquePaths = new Set<string>();
  for (const path of paths) {
    if (!path) {
      continue;
    }
    if ((options?.treatPendingAsNull ?? true) && path === "pending") {
      continue;
    }
    uniquePaths.add(path);
  }

  const signedUrlByPath = new Map<string, string | null>();
  const pathList = Array.from(uniquePaths);

  if (pathList.length === 0) {
    return signedUrlByPath;
  }

  const bucket = options?.bucket ?? DEFAULT_PHOTO_BUCKET;
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const storageBucket = supabase.storage.from(bucket);

  const { data, error } = await storageBucket.createSignedUrls(
    pathList,
    ttlSeconds
  );

  if (!error && data) {
    data.forEach((item) => {
      if (item.path) {
        signedUrlByPath.set(item.path, item.error ? null : item.signedUrl);
      }
    });

    pathList.forEach((path) => {
      if (!signedUrlByPath.has(path)) {
        signedUrlByPath.set(path, null);
      }
    });

    return signedUrlByPath;
  }

  await Promise.all(
    pathList.map(async (path) => {
      signedUrlByPath.set(path, await signPhotoUrl(path, supabase, options));
    })
  );

  return signedUrlByPath;
}
