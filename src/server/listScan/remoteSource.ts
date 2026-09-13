import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import ipaddr from "ipaddr.js";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
export const REMOTE_MENU_LIMITS = { text: 400_000, image: 24 * 1024 * 1024, pdf: 32 * 1024 * 1024 };
type Address = { address: string; family: number };
type RemoteSource = { url: URL; contentType: string; bytes: Uint8Array<ArrayBuffer> };
type Dependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  request: (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ReturnType<typeof httpRequest>;
};

export function isPublicMenuAddress(address: string) {
  if (!isIP(address)) return false;
  const parsed = ipaddr.process(address);
  // Reject transition, mapped-private, reserved, local, multicast and metadata ranges.
  if (parsed.range() !== "unicast" || parsed.toString() === "168.63.129.16") return false;
  return parsed.kind() === "ipv4" || parsed.match(ipaddr.parseCIDR("2000::/3"));
}

export function parseMenuUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http and https URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard web ports are supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host.includes(".") && !isIP(host) || /(^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host)) {
    throw new Error("That URL must use a public website address.");
  }
  if (isIP(host) && !isPublicMenuAddress(host)) throw new Error("That URL must use a public website address.");
  return url;
}

function byteLimit(maximum: number) {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength;
      callback(size > maximum ? new Error("That URL is too large. Upload the menu file instead.") : null, chunk);
    },
  });
}

async function boundedBody(response: IncomingMessage, url: URL, signal: AbortSignal): Promise<RemoteSource> {
  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  const maximum = contentType.includes("application/pdf") || url.pathname.toLowerCase().endsWith(".pdf")
    ? REMOTE_MENU_LIMITS.pdf : contentType.startsWith("image/") ? REMOTE_MENU_LIMITS.image : REMOTE_MENU_LIMITS.text;
  const contentLength = Number(response.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maximum) {
    response.destroy();
    throw new Error("That URL is too large. Upload the menu file instead.");
  }
  const encoding = String(response.headers["content-encoding"] ?? "identity").trim().toLowerCase();
  const decoder = encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null;
  if (!decoder && encoding !== "identity" && encoding !== "") {
    response.destroy();
    throw new Error("That URL uses an unsupported content encoding.");
  }
  const chunks: Buffer[] = [];
  const sink = new Transform({ transform(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); } });
  // Bound both transfer and decompressed bytes, and keep the deadline through EOF.
  const streams: (Readable | Transform)[] = [response, byteLimit(maximum)];
  if (decoder) streams.push(decoder);
  streams.push(byteLimit(maximum), sink);
  await pipeline(streams, { signal });
  const bytes = new Uint8Array(Buffer.concat(chunks));
  return { url, contentType, bytes };
}

/** Injectable only for isolated socket/DNS fixtures; production uses the defaults below. */
export function createRemoteMenuFetcher(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
    request: (url, options, callback) => (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options, callback),
    ...overrides,
  };
  return async (value: string, { timeoutMs = 20_000, maxRedirects = 5 } = {}): Promise<RemoteSource> => {
    const controller = new AbortController();
    const timeoutError = new Error("That URL took too long to download. Please try again or upload the menu.");
    let rejectDeadline: (error: Error) => void = () => {};
    const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
    const timer = setTimeout(() => { controller.abort(); rejectDeadline(timeoutError); }, timeoutMs);
    const fetchSource = async () => {
      let url = parseMenuUrl(value);
      for (let redirects = 0; ; redirects++) {
        controller.signal.throwIfAborted();
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await dependencies.resolve(hostname);
        controller.signal.throwIfAborted();
        if (!addresses.length || addresses.some(({ address }) => !isPublicMenuAddress(address))) {
          throw new Error("That URL must use a public website address.");
        }
        const chosen = addresses.find(({ family }) => family === 4) ?? addresses[0];
        const response = await new Promise<IncomingMessage>((resolve, reject) => {
          const request = dependencies.request(url, {
            method: "GET", agent: false, family: chosen.family,
            // The HTTP socket receives only the validated address. No second DNS lookup.
            // Original hostname remains in Host and TLS certificate/SNI validation.
            lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
            signal: controller.signal, maxHeaderSize: 16 * 1024,
            headers: { "User-Agent": "CellarSnap/1.0 (+wine-list-scan)", Accept: "text/html,application/pdf,image/*;q=0.9,text/plain;q=0.8", "Accept-Encoding": "gzip, deflate, br" },
          }, resolve);
          request.on("error", reject);
          request.end();
        });
        if (REDIRECTS.has(response.statusCode ?? 0)) {
          const location = response.headers.location;
          response.destroy();
          if (!location || redirects >= maxRedirects) throw new Error("That URL redirected too many times or has an invalid redirect.");
          // Validate URL syntax, credentials, port and address on every hop.
          url = parseMenuUrl(new URL(location, url).toString());
          continue;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          response.destroy();
          throw new Error("Unable to fetch that URL right now.");
        }
        return boundedBody(response, url, controller.signal);
      }
    };
    try { return await Promise.race([fetchSource(), deadline]); }
    catch (error) {
      if (controller.signal.aborted) throw timeoutError;
      throw error;
    } finally { clearTimeout(timer); controller.abort(); }
  };
}

export const fetchRemoteMenu = createRemoteMenuFetcher();
