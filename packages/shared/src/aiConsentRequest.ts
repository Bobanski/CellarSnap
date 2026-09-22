import { AI_CONSENT_KEY, AI_CONSENT_VERSION, readAiConsent, type AiConsent } from "./aiConsent";

/** One bounded transport for cookie web and cookie-free bearer mobile. */
export async function requestAiConsent(options: {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
  granted?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AiConsent | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async () => {
    const token = options.getToken ? await options.getToken() : null;
    if (controller.signal.aborted) throw new Error("Your AI choice request timed out. Please try again.");
    if (options.getToken && !token) throw new Error("Sign in again to manage AI sharing.");
    const response = await (options.fetchImpl ?? fetch)(`${options.baseUrl}/api/privacy/ai-consent`, {
      method: options.granted === undefined ? "GET" : "PUT",
      credentials: options.getToken ? "omit" : "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: options.granted === undefined ? undefined : JSON.stringify({ granted: options.granted, version: AI_CONSENT_VERSION }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Unable to update AI sharing. Please try again.");
    if (!body || !("consent" in body)) throw new Error("Unable to read your AI choice. Please try again.");
    const consent = readAiConsent({ [AI_CONSENT_KEY]: body.consent });
    if (body.consent !== null && !consent || options.granted !== undefined && consent?.granted !== options.granted) {
      throw new Error("Your AI choice was not confirmed. Please try again.");
    }
    return consent;
  };
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error("Your AI choice request timed out. Please try again."));
      }, options.timeoutMs ?? 15000); }),
    ]);
  } finally { clearTimeout(timer); }
}
