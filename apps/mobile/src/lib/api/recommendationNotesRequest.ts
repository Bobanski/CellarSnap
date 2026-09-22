import type { ListScanParsedWine } from '../../../../../packages/shared/src/listScan';
import { isRecord } from './projectedRead';

type Dependencies = {
  getBaseUrl: () => string | null;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};
type NotesResult =
  | { ok: true; notes: Record<string, string> }
  | { ok: false; errorMessage: string };

/** Optional notes never block recommendations; each retry obtains the current session. */
export function createRecommendationNotesRequester(dependencies: Dependencies) {
  return async (items: ListScanParsedWine[], signal?: AbortSignal): Promise<NotesResult> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const failure = (errorMessage = 'Recommendation notes are unavailable. Please try again.'): NotesResult =>
      ({ ok: false, errorMessage });
    try {
      const base = dependencies.getBaseUrl();
      if (!base || signal?.aborted) return failure();
      if (items.length === 0) return { ok: true, notes: {} };
      const deadline = new Promise<never>((_resolve, reject) => {
        cancel = () => { controller.abort(); reject(new Error('cancelled')); };
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(cancel, dependencies.timeoutMs ?? 20_000);
      });
      return await Promise.race([deadline, (async (): Promise<NotesResult> => {
        const token = await dependencies.getAccessToken();
        if (controller.signal.aborted) return failure();
        if (!token) return failure('Please sign in again to load recommendation notes.');
        const response = await (dependencies.fetch ?? fetch)(`${base}/api/list-scan/recommendation-notes`, {
          method: 'POST', credentials: 'omit', cache: 'no-store',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }), signal: controller.signal,
        });
        if (!response.ok) return failure(response.status === 401
          ? 'Please sign in again to load recommendation notes.' : undefined);
        const body: unknown = await response.json();
        if (controller.signal.aborted || !isRecord(body) || !Array.isArray(body.notes)) return failure();
        const requested = new Set(items.map(item => item.id));
        const notes: Record<string, string> = {};
        for (const entry of body.notes) {
          if (!isRecord(entry) || typeof entry.id !== 'string' || !requested.has(entry.id) ||
            (entry.note !== null && typeof entry.note !== 'string')) return failure();
          if (typeof entry.note === 'string' && entry.note.trim()) notes[entry.id] = entry.note.trim();
        }
        return { ok: true, notes };
      })()]);
    } catch {
      return failure();
    } finally {
      clearTimeout(timer);
      if (cancel) signal?.removeEventListener('abort', cancel);
    }
  };
}
