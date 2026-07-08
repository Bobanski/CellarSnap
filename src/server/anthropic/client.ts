/**
 * Minimal Anthropic Messages API client (fetch-based, no SDK dependency).
 *
 * Exposes a single forced-tool-call helper: the model must respond by calling
 * the given tool, so the reply is always schema-validated JSON. The system
 * prompt is cached (5-minute ephemeral cache) — callers that reuse the same
 * system text across requests only pay for it once per cache window.
 *
 * Schema-authoring note: models fill tool arguments in schema property order.
 * Any schema with a free-text `reasoning` field must list it BEFORE the
 * decision fields, or the model commits to an answer without reasoning —
 * measured at ~11 accuracy points on the somm eval (scripts/somm-eval).
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AnthropicToolCallParams = {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs?: number;
  maxRetries?: number;
};

export type AnthropicToolCallResult<T> = {
  input: T;
  latencyMs: number;
  usage: { input_tokens?: number; output_tokens?: number } | null;
};

export class AnthropicApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "AnthropicApiError";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
}

export async function anthropicToolCall<T = Record<string, unknown>>(
  params: AnthropicToolCallParams
): Promise<AnthropicToolCallResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicApiError("ANTHROPIC_API_KEY is not configured", null, false);
  }

  const {
    model,
    system,
    user,
    toolName,
    toolDescription,
    inputSchema,
    maxTokens,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = params;

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    tools: [{ name: toolName, description: toolDescription, input_schema: inputSchema }],
    tool_choice: { type: "tool", name: toolName },
  });

  const started = Date.now();
  let lastError: AnthropicApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        lastError = new AnthropicApiError(
          `Anthropic API ${response.status}: ${detail}`,
          response.status,
          isRetryableStatus(response.status)
        );
        if (!lastError.retryable) throw lastError;
        continue;
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; input?: unknown }>;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const toolUse = data.content?.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.input == null) {
        throw new AnthropicApiError(
          `Anthropic response contained no tool_use block (stop_reason: ${data.stop_reason ?? "unknown"})`,
          null,
          false
        );
      }
      return {
        input: toolUse.input as T,
        latencyMs: Date.now() - started,
        usage: data.usage ?? null,
      };
    } catch (error) {
      if (error instanceof AnthropicApiError) {
        lastError = error;
        if (!error.retryable) throw error;
        continue;
      }
      // AbortError / network errors are retryable
      lastError = new AnthropicApiError(
        `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
        null,
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new AnthropicApiError("Anthropic request failed", null, false);
}
