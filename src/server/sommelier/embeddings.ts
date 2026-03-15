import OpenAI from "openai";

export const SOMMELIER_EMBEDDING_MODEL = "text-embedding-3-small";

type EmbeddingsClient = {
  embeddings: {
    create: (params: {
      model: string;
      input: string | string[];
    }) => Promise<{
      data: Array<{
        embedding: number[];
      }>;
    }>;
  };
};

function createEmbeddingsClient(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey }) as unknown as EmbeddingsClient;
}

export async function generateEmbeddings(
  texts: string[],
  dependencies: {
    createClient?: () => EmbeddingsClient;
    model?: string;
  } = {}
) {
  const normalizedTexts = texts.map((text) => text.trim()).filter(Boolean);
  if (normalizedTexts.length === 0) {
    return [] as number[][];
  }

  const client = dependencies.createClient ?? createEmbeddingsClient;
  const model = dependencies.model ?? SOMMELIER_EMBEDDING_MODEL;
  const response = await client().embeddings.create({
    model,
    input: normalizedTexts,
  });

  return response.data.map((item) => item.embedding);
}

export async function generateEmbedding(
  text: string,
  dependencies: {
    createClient?: () => EmbeddingsClient;
    model?: string;
  } = {}
) {
  const [embedding] = await generateEmbeddings([text], dependencies);
  if (!embedding) {
    throw new Error("Failed to generate embedding.");
  }
  return embedding;
}
