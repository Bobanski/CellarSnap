import type { FeedScope, MobileFeedEntry } from './feedTypes';

type FeedRequest = { viewerUserId: string; scope: FeedScope; cursor: string | null; limit: number };
type FeedResult = { entries: MobileFeedEntry[]; nextCursor: string | null; hasMore: boolean; errorMessage: string | null };
type Dependencies = {
  getBaseUrl: () => string | null;
  getAccessToken: () => Promise<string | null>;
  photoHeaders: Record<string, string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const failure = (errorMessage: string): FeedResult => ({ entries: [], nextCursor: null, hasMore: false, errorMessage });

function isProjectedRating(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.rating === null && (row.public_rating_label === null ||
    ['Loved it', 'Really liked it', 'Liked it', 'Tried it'].includes(row.public_rating_label as string));
}

export function createFeedPageFetcher(dependencies: Dependencies) {
  return async ({ viewerUserId, scope, cursor, limit }: FeedRequest): Promise<FeedResult> => {
    const base = dependencies.getBaseUrl();
    if (!base) return failure('Feed unavailable. Please try again.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 20_000);
    try {
      const token = await dependencies.getAccessToken();
      if (!token) return failure('Please sign in again to load your feed.');
      const search = new URLSearchParams({ scope, limit: String(limit) });
      if (cursor) search.set('cursor_v2', cursor);
      const response = await (dependencies.fetch ?? fetch)(`${base}/api/feed?${search}`, {
        headers: { ...dependencies.photoHeaders, Authorization: `Bearer ${token}` },
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) return failure(response.status === 401
        ? 'Please sign in again to load your feed.' : 'Unable to load feed. Please try again.');
      const body = await response.json();
      // A session change or incompatible/raw response must never become feed state.
      if (body.viewer_user_id !== viewerUserId || !Array.isArray(body.entries) ||
        typeof body.has_more !== 'boolean' ||
        !(body.next_cursor_v2 === null || typeof body.next_cursor_v2 === 'string') ||
        (body.has_more && !body.next_cursor_v2) ||
        !body.entries.every((entry: MobileFeedEntry) => entry && typeof entry.id === 'string' &&
          isProjectedRating(entry) && Array.isArray(entry.photo_gallery) &&
          Array.isArray(entry.group_slides) && entry.group_slides.every(isProjectedRating))) {
        return failure('Unable to load feed. Please refresh and try again.');
      }
      return { entries: body.entries, nextCursor: body.next_cursor_v2, hasMore: body.has_more, errorMessage: null };
    } catch {
      return failure(controller.signal.aborted
        ? 'Feed took too long to load. Please try again.' : 'Unable to load feed. Please try again.');
    } finally {
      clearTimeout(timeout);
    }
  };
}
