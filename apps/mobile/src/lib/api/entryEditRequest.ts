import { ownerEntryEditReceiptSchema, ownerEntryEditSchema, type OwnerEntryEdit } from '../../../../../packages/shared/src/ownerEntryEdit';

export const EDIT_RETRY_MESSAGE = 'Unable to confirm the save. Your changes are still here; please retry.';
export const EDIT_CONFLICT_MESSAGE = 'This entry changed elsewhere. Close the editor and refresh before saving again.';
type Dependencies = {
  getBaseUrl: () => string | null;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};
export function createEntryEditor(deps: Dependencies) {
  return async (entryId: string, viewerUserId: string, edit: OwnerEntryEdit, signal?: AbortSignal): Promise<string | null> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      const fail = () => reject(new Error('Save cancelled'));
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener('abort', fail, { once: true });
      timer = setTimeout(abort, deps.timeoutMs ?? 15_000);
    });
    try {
      return await Promise.race([cancelled, (async () => {
        const base = deps.getBaseUrl()?.replace(/\/$/, '');
        if (!base || !ownerEntryEditSchema.safeParse(edit).success) return EDIT_RETRY_MESSAGE;
        const token = await deps.getAccessToken();
        if (controller.signal.aborted) return EDIT_RETRY_MESSAGE;
        if (!token) return 'Session expired. Sign in again before saving.';
        const response = await (deps.fetch ?? fetch)(`${base}/api/entries/${encodeURIComponent(entryId)}/details`, {
          method: 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(edit),
        });
        if (controller.signal.aborted) return EDIT_RETRY_MESSAGE;
        if (response.status === 409) return EDIT_CONFLICT_MESSAGE;
        if (response.status === 401) return 'Session expired. Sign in again before saving.';
        if (!response.ok) return EDIT_RETRY_MESSAGE;
        const receipt = ownerEntryEditReceiptSchema.safeParse(await response.json());
        if (controller.signal.aborted || !receipt.success || receipt.data.entry_id !== entryId || receipt.data.viewer_user_id !== viewerUserId) return EDIT_RETRY_MESSAGE;
        return null;
      })()]);
    } catch { return EDIT_RETRY_MESSAGE; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
