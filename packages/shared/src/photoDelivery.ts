export const PHOTO_DELIVERY_HEADER = "X-CellarSnap-Photo-Delivery";
export const PHOTO_DELIVERY_VERSION = "request-v1";
export const MAX_DELIVERED_PHOTO_BYTES = 12 * 1024 * 1024;

export function isValidPhotoPath(path: string) {
  return path.length > 0 && path.length <= 2048 && path !== "pending" &&
    !/[\\\x00-\x1f\x7f]/.test(path) &&
    path.split("/").every(segment => segment && segment !== "." && segment !== "..");
}

export function authenticatedPhotoUrl(path: string, variant: "display" | "original" = "display") {
  return `/api/photos/image?path=${encodeURIComponent(path)}&variant=${variant}`;
}

/** Only these exact configured endpoints may receive the user's bearer token.
 * Legacy Storage URLs are converted to paths; their signatures are discarded. */
export function resolveAuthenticatedPhotoUrl(uri: string, apiBase: string, storageBase: string) {
  try {
    const base = new URL(apiBase);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) return null;
    const candidate = new URL(uri, base);
    if (candidate.username || candidate.password) return null;
    if (candidate.origin === base.origin && candidate.pathname === "/api/photos/image") {
      const path = candidate.searchParams.get("path") ?? "";
      const variant = candidate.searchParams.get("variant") ?? "display";
      return isValidPhotoPath(path) && (variant === "display" || variant === "original")
        ? base.origin + authenticatedPhotoUrl(path, variant) : null;
    }
    if (candidate.origin !== new URL(storageBase).origin) return null;
    const match = /^\/storage\/v1\/(?:object\/(?:sign|authenticated|public)|render\/image\/(?:sign|authenticated|public))\/wine-photos\/(.+)$/.exec(candidate.pathname);
    const path = match ? decodeURIComponent(match[1]) : "";
    return isValidPhotoPath(path) ? base.origin + authenticatedPhotoUrl(path) : null;
  } catch { return null; }
}

/** Caller supplies only a URL returned by resolveAuthenticatedPhotoUrl. No
 * persistent cache, cookie fallback, redirects or unbounded successful body. */
export async function fetchAuthorizedPhoto(url: string, token: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}` }, credentials: "omit",
    cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok || response.redirected || response.headers.get("content-type")?.split(";")[0] !== "image/webp" ||
      Number(response.headers.get("content-length")) > MAX_DELIVERED_PHOTO_BYTES) {
    await response.body?.cancel();
    throw new Error("Photo unavailable. Please retry.");
  }
  // Native fetch does not expose a ReadableStream. The server also bounds its
  // encoded output, and we check the native blob before any image is decoded.
  if (!response.body?.getReader) {
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_DELIVERED_PHOTO_BYTES) throw new Error("Photo unavailable. Please retry.");
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DELIVERED_PHOTO_BYTES) throw new Error("Photo unavailable. Please retry.");
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally { await reader.cancel(); }
  if (!size) throw new Error("Photo unavailable. Please retry.");
  return new Blob(chunks, { type: "image/webp" });
}
