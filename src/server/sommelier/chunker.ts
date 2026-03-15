import type { ChunkRecord } from "@/server/sommelier/types";

const WORDS_PER_TOKEN_APPROX = 0.75;

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function estimateTokens(value: string) {
  const words = value.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_TOKEN_APPROX));
}

function getOverlapText(value: string, overlapTokens: number) {
  if (overlapTokens <= 0) {
    return "";
  }

  const words = value.split(/\s+/).filter(Boolean);
  const overlapWords = Math.max(1, Math.round(overlapTokens * WORDS_PER_TOKEN_APPROX));
  return words.slice(-overlapWords).join(" ");
}

function splitOversizedUnit(unit: string, maxTokens: number) {
  if (estimateTokens(unit) <= maxTokens) {
    return [unit];
  }

  const sentences = unit
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    const words = unit.split(/\s+/).filter(Boolean);
    const chunkWords = Math.max(1, Math.round(maxTokens * WORDS_PER_TOKEN_APPROX));
    const chunks: string[] = [];

    for (let index = 0; index < words.length; index += chunkWords) {
      chunks.push(words.slice(index, index + chunkWords).join(" "));
    }

    return chunks;
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && estimateTokens(candidate) > maxTokens) {
      chunks.push(current);
      current = sentence;
      continue;
    }
    current = candidate;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildChunks(
  units: string[],
  {
    maxTokens,
    overlapTokens,
  }: {
    maxTokens: number;
    overlapTokens: number;
  }
) {
  const chunks: ChunkRecord[] = [];
  let current = "";

  const pushCurrent = () => {
    const normalized = normalizeWhitespace(current);
    if (!normalized) {
      return;
    }

    chunks.push({
      chunkIndex: chunks.length,
      content: normalized,
      approxTokens: estimateTokens(normalized),
    });
  };

  for (const unit of units) {
    const normalizedUnit = normalizeWhitespace(unit);
    if (!normalizedUnit) {
      continue;
    }

    const candidate = current ? `${current}\n\n${normalizedUnit}` : normalizedUnit;
    if (current && estimateTokens(candidate) > maxTokens) {
      const previousChunk = normalizeWhitespace(current);
      pushCurrent();
      const overlap = getOverlapText(previousChunk, overlapTokens);
      current = overlap ? `${overlap}\n\n${normalizedUnit}` : normalizedUnit;
      continue;
    }

    current = candidate;
  }

  if (current) {
    pushCurrent();
  }

  return chunks;
}

export function chunkText(
  text: string,
  maxTokens = 500,
  overlapTokens = 50
): ChunkRecord[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const paragraphUnits = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitOversizedUnit(paragraph, maxTokens));

  return buildChunks(paragraphUnits, { maxTokens, overlapTokens });
}

type MarkdownSection = {
  heading: string | null;
  body: string;
};

function splitMarkdownSections(markdown: string) {
  const lines = normalizeWhitespace(markdown).split("\n");
  const sections: MarkdownSection[] = [];
  let heading: string | null = null;
  let body: string[] = [];

  const pushSection = () => {
    const content = body.join("\n").trim();
    if (!content && !heading) {
      return;
    }
    sections.push({
      heading,
      body: content,
    });
  };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line.trim())) {
      pushSection();
      heading = line.trim();
      body = [];
      continue;
    }
    body.push(line);
  }

  pushSection();
  return sections;
}

export function chunkMarkdown(
  markdown: string,
  maxTokens = 500,
  overlapTokens = 50
): ChunkRecord[] {
  const sections = splitMarkdownSections(markdown);
  const chunks: ChunkRecord[] = [];

  for (const section of sections) {
    const content = section.heading
      ? `${section.heading}\n${section.body}`.trim()
      : section.body.trim();
    const sectionChunks = chunkText(content, maxTokens, overlapTokens).map((chunk) => ({
      ...chunk,
      chunkIndex: chunks.length + chunk.chunkIndex,
      heading: section.heading,
    }));
    chunks.push(...sectionChunks);
  }

  return chunks;
}

export function estimateChunkTokens(text: string) {
  return estimateTokens(text);
}
