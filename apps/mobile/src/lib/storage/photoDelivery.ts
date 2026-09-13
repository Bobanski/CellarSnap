import { fetchAuthorizedPhoto, resolveAuthenticatedPhotoUrl } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

export function requestPhotoUrl(uri: string) {
  const base = getWebApiBaseUrl();
  const storage = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return base && storage ? resolveAuthenticatedPhotoUrl(uri, base, storage) : null;
}

export function originalPhotoUri(uri: string) {
  const resolved = requestPhotoUrl(uri);
  if (!resolved) return uri;
  const url = new URL(resolved);
  url.searchParams.set("variant", "original");
  return url.toString();
}

export function isProtectedPhotoUri(uri: string) {
  if (uri.startsWith("/api/photos/image?") || requestPhotoUrl(uri) !== null) return true;
  try {
    const candidate = new URL(uri);
    const storage = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
    // Even malformed/unsupported legacy capabilities must fail closed rather
    // than fall through to Image or the device-local XHR reader.
    return candidate.origin === storage.origin && candidate.pathname.startsWith("/storage/v1/") && candidate.pathname.includes("/wine-photos/");
  } catch { return false; }
}

/** An in-memory data URL works in RN Image, Expo web and the crop manipulator.
 * It is never stored on disk or shared between sessions/components. */
export async function loadPhotoDataUrl(uri: string, signal?: AbortSignal) {
  const url = requestPhotoUrl(uri);
  if (!url) throw new Error("Photo delivery is unavailable.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const token = await getAccessTokenForApi();
    if (!token || controller.signal.aborted) throw new Error("Photo unavailable. Please retry.");
    const blob = await fetchAuthorizedPhoto(url, token, controller.signal);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      const abortRead = () => { reader.abort(); reject(new Error("Photo load canceled.")); };
      const finish = () => controller.signal.removeEventListener("abort", abortRead);
      reader.onload = () => {
        finish();
        if (!controller.signal.aborted && typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Photo unavailable. Please retry."));
      };
      reader.onerror = () => { finish(); reject(new Error("Photo unavailable. Please retry.")); };
      reader.onabort = finish;
      controller.signal.addEventListener("abort", abortRead, { once: true });
      if (controller.signal.aborted) { abortRead(); return; }
      reader.readAsDataURL(blob);
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
