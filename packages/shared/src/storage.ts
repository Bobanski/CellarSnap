type SignedPath = { path?: string | null; signedUrl: string; error?: string | null };

export type PhotoPathSigner = {
  signBatch: (paths: string[]) => PromiseLike<{
    data: SignedPath[] | null;
    error: unknown;
  }>;
  signOne: (path: string) => PromiseLike<string | null>;
};

/** Shared web/native batching; keep authorization and TTL in each client adapter. */
export async function signPhotoPaths(
  paths: Iterable<string | null | undefined>,
  signer: PhotoPathSigner,
  options?: { treatPendingAsNull?: boolean }
): Promise<Map<string, string | null>> {
  const uniquePaths = Array.from(new Set(Array.from(paths).filter(
    (path): path is string => Boolean(path) &&
      (!(options?.treatPendingAsNull ?? true) || path !== "pending")
  )));
  const result = new Map<string, string | null>(uniquePaths.map((path) => [path, null]));

  // Bound request payloads and fallback concurrency for long photo libraries.
  for (let offset = 0; offset < uniquePaths.length; offset += 100) {
    const batch = uniquePaths.slice(offset, offset + 100);
    const { data, error } = await signer.signBatch(batch);
    if (!error && data) {
      const requested = new Set(batch);
      for (const item of data) {
        if (item.path && requested.has(item.path)) {
          result.set(item.path, item.error ? null : item.signedUrl || null);
        }
      }
    } else {
      // Preserve per-object best effort if the bulk endpoint rejects a batch.
      await Promise.all(batch.map(async (path) => {
        result.set(path, await signer.signOne(path));
      }));
    }
  }
  return result;
}
