import OpenAI from "openai";

const NOTES_SUMMARY_TIMEOUT_MS = 3000;
const NOTES_SUMMARY_MAX_CHARS = 140;
const NOTES_FOR_MODEL_MAX_CHARS = 1200;
const NOTES_SUMMARY_MIN_WORDS = 11;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getWordCount(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return 0;
  }

  return normalized.split(" ").length;
}

function truncateWithEllipsis(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  const trimmed = value.slice(0, maxChars).trimEnd().replace(/[.,;:!?-]+$/, "");
  return `${trimmed}...`;
}

function sanitizeSummary(value: string) {
  let summary = normalizeWhitespace(value);
  if (!summary) {
    return null;
  }

  summary = summary
    .replace(/^summary:\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (!summary) {
    return null;
  }

  return truncateWithEllipsis(summary, NOTES_SUMMARY_MAX_CHARS);
}

function buildFallbackSummary(notes: string) {
  const normalized = normalizeWhitespace(notes);
  if (!normalized) {
    return null;
  }
  const firstSentence = normalized.split(/[.!?](?:\s|$)/)[0]?.trim() ?? normalized;
  const base = firstSentence.length > 0 ? firstSentence : normalized;
  return truncateWithEllipsis(base, NOTES_SUMMARY_MAX_CHARS);
}

export async function generateAiNotesSummary({
  notes,
  safetyIdentifier,
}: {
  notes: string;
  safetyIdentifier: string;
}): Promise<string | null> {
  const normalizedNotes = normalizeWhitespace(notes);
  if (!normalizedNotes) {
    return null;
  }

  if (getWordCount(normalizedNotes) < NOTES_SUMMARY_MIN_WORDS) {
    return null;
  }

  const fallback = buildFallbackSummary(normalizedNotes);
  if (!process.env.OPENAI_API_KEY) {
    return fallback;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTES_SUMMARY_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        max_output_tokens: 70,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Summarize these wine tasting notes as one very short caption. " +
                  "Return plain text only, no quotes, no labels, no hashtags, maximum 14 words.\n\n" +
                  `Notes: ${truncateWithEllipsis(normalizedNotes, NOTES_FOR_MODEL_MAX_CHARS)}`,
              },
            ],
          },
        ],
        safety_identifier: safetyIdentifier,
      },
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";
    return sanitizeSummary(outputText) ?? fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
