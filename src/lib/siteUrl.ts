import "server-only";

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function ensureAbsoluteUrl(url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

export function getConfiguredPublicSiteUrl() {
  const configured =
    process.env.PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  return normalizeUrl(ensureAbsoluteUrl(configured));
}

export function getPublicSiteUrlFromRequest(request: Request) {
  const configured =
    process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return normalizeUrl(ensureAbsoluteUrl(configured));
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const protocol =
      forwardedProto ??
      (forwardedHost.includes("localhost") || forwardedHost.includes("127.0.0.1")
        ? "http"
        : "https");
    return normalizeUrl(`${protocol}://${forwardedHost}`);
  }

  return normalizeUrl(new URL(request.url).origin);
}
