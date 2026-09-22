/** Bump when recipients or the disclosed uses materially change. */
export const AI_CONSENT_VERSION = "2026-09-22";
export const AI_CONSENT_KEY = "ai_data_sharing";
export type AiConsent = { version: string; granted: boolean; updatedAt: string };
export const AI_CONSENT_TITLE = "Your choice about AI";
export const AI_CONSENT_PARAGRAPHS = [
  "With your permission, Cluster shares selected photos, wine-list images or PDFs, wine details, tasting notes, ratings, taste-survey answers and sommelier messages with OpenAI, Anthropic and Google Cloud Vision to scan labels and lists, answer questions and personalize recommendations.",
  "This includes relevant private entries and tasting history for personalized AI features and searchable AI summaries. These providers receive only the content needed for the feature; they do not receive your password. Avoid including sensitive or other people's personal information.",
  "AI is optional. You can log wines manually, browse your cellar and use social features without it. Change this account-wide choice at any time in Privacy & AI. Turning it off stops new AI processing; it cannot recall content already sent or a request already underway.",
] as const;
export function readAiConsent(metadata: unknown): AiConsent | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value: unknown = (metadata as Record<string, unknown>)[AI_CONSENT_KEY];
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return record.version === AI_CONSENT_VERSION && typeof record.granted === "boolean" &&
    typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt))
    ? { version: record.version, granted: record.granted, updatedAt: record.updatedAt } : null;
}
export function hasAiConsent(metadata: unknown): boolean {
  return readAiConsent(metadata)?.granted === true;
}

/** Authenticated endpoints that send user-supplied content/history to AI. GETs are read-only. */
export const AI_PROCESSING_PATHS = [
  "/api/label-autofill", "/api/lineup-autofill", "/api/photo-context", "/api/bottle-count",
  "/api/cellar/map-columns", "/api/list-scan/parse", "/api/list-scan/recommendation-notes",
  "/api/palate/distill", "/api/sommelier/chat", "/api/sommelier/identify-bottle",
  "/api/sommelier/ingest", "/api/sommelier/upload-document",
] as const;
export function requiresAiConsent(request: { method: string; url: string }): boolean {
  const path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "").toLowerCase();
  return request.method.toUpperCase() === "POST" && AI_PROCESSING_PATHS.some(value => value === path);
}
