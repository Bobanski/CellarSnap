/** Bounded, bearer-only reads. Config/session/transport failures never fall back to raw rows. */
export type ProjectedReadDependencies = {
  getBaseUrl: () => string | null;
  getAccessToken: () => Promise<string | null>;
  photoHeaders: Record<string, string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};
export type ProjectedReadResult<T> = { ok: true; payload: T } | { ok: false; errorMessage: string };

export async function readProjected<T>(
  dependencies: ProjectedReadDependencies,
  path: string,
  validate: (body: unknown) => body is T,
): Promise<ProjectedReadResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const failure = (): ProjectedReadResult<T> => ({ ok: false, errorMessage: controller.signal.aborted
    ? 'Loading took too long. Please try again.' : 'Unable to load. Please try again.' });
  try {
    const base = dependencies.getBaseUrl();
    if (!base) return failure();
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, dependencies.timeoutMs ?? 20_000);
    });
    return await Promise.race([deadline, (async (): Promise<ProjectedReadResult<T>> => {
      const token = await dependencies.getAccessToken();
      if (controller.signal.aborted) return failure();
      if (!token) return { ok: false, errorMessage: 'Please sign in again.' };
      const response = await (dependencies.fetch ?? fetch)(`${base}${path}`, {
        headers: { ...dependencies.photoHeaders, Authorization: `Bearer ${token}` },
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) return response.status === 401
        ? { ok: false, errorMessage: 'Please sign in again.' } : failure();
      const body: unknown = await response.json();
      return !controller.signal.aborted && validate(body) ? { ok: true, payload: body } : failure();
    })()]);
  } catch {
    return failure();
  } finally {
    clearTimeout(timer);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isPublicRatingLabel(value: unknown): boolean {
  return value === null || ['Loved it', 'Really liked it', 'Liked it', 'Tried it'].includes(value as string);
}
export function isOwnerRating(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100);
}
export function hasProjectedSlides(row: Record<string, unknown>): boolean {
  return row.group_slides === undefined || (Array.isArray(row.group_slides) && row.group_slides.every(slide =>
    isRecord(slide) && slide.rating === null && isPublicRatingLabel(slide.public_rating_label)));
}
