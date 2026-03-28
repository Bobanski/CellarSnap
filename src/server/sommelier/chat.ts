import OpenAI from "openai";
import type { ResponseInput, ResponseStreamEvent } from "openai/resources/responses/responses";
import { assembleContext } from "@/server/sommelier/retrieval";
import type {
  AssembledSommelierContext,
  SommelierMessage,
  SommelierSource,
} from "@/server/sommelier/types";

type ResponsesClient = OpenAI;

export const SOMMELIER_MODEL = "gpt-5-mini";
export const SOMMELIER_MAX_OUTPUT_TOKENS = 220;

export const SOMMELIER_SYSTEM_PROMPT = [
  "You are CellarSnap's pocket sommelier: a knowledgeable, approachable wine expert.",
  "You have persistent access to the user's full tasting history and cellar - it is retrieved automatically and included in your context when relevant. You are not limited to this session's messages. Never say you only know wines shared in this session or that you lack access to the user's history.",
  "Use the user's tasting history and the supplied wine knowledge context when it is relevant.",
  "Be conversational, concise, and specific about wines, grapes, regions, and pairings.",
  "Default to 2 to 4 short sentences or 3 brief bullets, and stay under about 80 words unless the user asks for more depth.",
  "Format replies for readability with light markdown: use short paragraphs, a few bullets when helpful, and occasional bold emphasis for the main takeaway, wine names, or key recommendation.",
  "Lead with the recommendation or takeaway, then give only the strongest supporting facts.",
  "When recommending wines, connect the recommendation back to the user's observed preferences when possible.",
  "Personalize naturally by referencing wines, grapes, producers, or regions they have liked when helpful.",
  "Do not explain the retrieval process, source documents, or backend context unless the user explicitly asks.",
  "If the retrieved context does not contain enough information to answer confidently, say something like 'Based on what I can see in your cellar...' or 'I don't see enough entries matching that to give a confident answer' rather than claiming you have no access to history.",
  "Prefer practical guidance over generic textbook exposition.",
].join(" ");

const APPROX_WORDS_PER_TOKEN = 0.75;
const MAX_CONTEXT_TOKENS = 5000;
const MAX_HISTORY_TOKENS = 1800;

function createOpenAiClient(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey });
}

function estimateTokens(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / APPROX_WORDS_PER_TOKEN));
}

function truncateTextToApproxTokens(value: string, maxTokens: number) {
  const normalized = value.trim();
  if (!normalized || estimateTokens(normalized) <= maxTokens) {
    return normalized;
  }

  const paragraphs = normalized.split(/\n\s*\n+/);
  const kept: string[] = [];
  let usedTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);
    if (kept.length > 0 && usedTokens + paragraphTokens > maxTokens) {
      break;
    }
    kept.push(paragraph);
    usedTokens += paragraphTokens;
  }

  if (kept.length === 0) {
    const words = normalized.split(/\s+/).filter(Boolean);
    const maxWords = Math.max(1, Math.floor(maxTokens * APPROX_WORDS_PER_TOKEN));
    return `${words.slice(0, maxWords).join(" ")}\n\n[Context trimmed for length.]`;
  }

  return `${kept.join("\n\n")}\n\n[Context trimmed for length.]`;
}

function normalizeMessages(messages: SommelierMessage[]) {
  const normalized = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);

  const kept: typeof normalized = [];
  let usedTokens = 0;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index];
    const messageTokens = estimateTokens(message.content);
    if (kept.length > 0 && usedTokens + messageTokens > MAX_HISTORY_TOKENS) {
      break;
    }
    kept.unshift(message);
    usedTokens += messageTokens;
  }

  return kept;
}

function buildResponseInput(messages: SommelierMessage[], context: AssembledSommelierContext) {
  const contextPrefix = "Context for this reply:\n";
  const contextSuffix =
    "\n\nWhen the user asks for a recommendation, prefer answers that fit their logged preferences and favorites.";
  const reservedContextTokens = estimateTokens(contextPrefix) + estimateTokens(contextSuffix);
  const trimmedContext = truncateTextToApproxTokens(
    context.contextText,
    Math.max(400, MAX_CONTEXT_TOKENS - reservedContextTokens)
  );

  return [
    {
      role: "system" as const,
      content: [{ type: "input_text" as const, text: SOMMELIER_SYSTEM_PROMPT }],
    },
    {
      role: "system" as const,
      content: [
        {
          type: "input_text" as const,
          text: `${contextPrefix}${trimmedContext}${contextSuffix}`,
        },
      ],
    },
    ...normalizeMessages(messages).map((message) => ({
      role: message.role,
      content: [
        {
          type: message.role === "assistant" ? ("output_text" as const) : ("input_text" as const),
          text: message.content,
        },
      ],
    })),
  ];
}

export async function chatWithSommelier(
  params: {
    userId: string;
    messages: SommelierMessage[];
    requestSupabase: Parameters<typeof assembleContext>[2]["requestSupabase"];
    adminSupabase?: Parameters<typeof assembleContext>[2]["adminSupabase"];
    createClient?: () => ResponsesClient;
  }
): Promise<{
  answer: string;
  context: AssembledSommelierContext;
}> {
  const context = await assembleContext(
    params.messages[params.messages.length - 1]?.content ?? "",
    params.userId,
    {
      requestSupabase: params.requestSupabase,
      adminSupabase: params.adminSupabase,
    }
  );
  const client = params.createClient ?? createOpenAiClient;
  const response = await client().responses.create({
    model: SOMMELIER_MODEL,
    reasoning: { effort: "minimal" },
    max_output_tokens: SOMMELIER_MAX_OUTPUT_TOKENS,
    input: buildResponseInput(params.messages, context) as ResponseInput,
  });

  // Explicit validation: ensure output_text field exists and is a string
  if (!("output_text" in response)) {
    throw new Error(
      `Unexpected OpenAI Responses API format. Expected 'output_text' field. ` +
      `Got: ${JSON.stringify(Object.keys(response)).slice(0, 200)}`
    );
  }

  if (typeof response.output_text !== "string") {
    throw new Error(
      `Invalid 'output_text' type. Expected string, got ${typeof response.output_text}`
    );
  }

  const answer = response.output_text.trim();

  return {
    answer,
    context,
  };
}

function encodeSse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function streamSommelierChat(
  params: {
    userId: string;
    messages: SommelierMessage[];
    requestSupabase: Parameters<typeof assembleContext>[2]["requestSupabase"];
    adminSupabase?: Parameters<typeof assembleContext>[2]["adminSupabase"];
    createClient?: () => ResponsesClient;
    onComplete?: (payload: {
      answer: string;
      sources: SommelierSource[];
      context: AssembledSommelierContext;
    }) => Promise<void> | void;
  }
) {
  const context = await assembleContext(
    params.messages[params.messages.length - 1]?.content ?? "",
    params.userId,
    {
      requestSupabase: params.requestSupabase,
      adminSupabase: params.adminSupabase,
    }
  );
  const client = params.createClient ?? createOpenAiClient;
  const stream = client().responses.stream({
    model: SOMMELIER_MODEL,
    reasoning: { effort: "minimal" },
    max_output_tokens: SOMMELIER_MAX_OUTPUT_TOKENS,
    input: buildResponseInput(params.messages, context) as ResponseInput,
  });
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let accumulated = "";

      try {
        for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
          if (event.type === "response.output_text.delta" && event.delta) {
            accumulated += event.delta;
            controller.enqueue(encoder.encode(encodeSse("delta", { text: event.delta })));
          }
        }

        controller.enqueue(
          encoder.encode(
            encodeSse("done", {
              text: accumulated.trim(),
            })
          )
        );
        await params.onComplete?.({
          answer: accumulated.trim(),
          sources: context.sources,
          context,
        });
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeSse("error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Pocket Sommelier failed to finish the response.",
            })
          )
        );
        controller.close();
      } finally {
        stream.abort();
      }
    },
  });
}

export const __sommelierTestUtils = {
  buildResponseInput,
};
