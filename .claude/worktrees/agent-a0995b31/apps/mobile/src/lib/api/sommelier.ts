import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

export type MobileSommelierSource = {
  id: string;
  kind: string;
  label: string;
  excerpt: string;
};

export type MobileSommelierMessage = {
  role: "user" | "assistant";
  content: string;
};

type SommelierChatResponse = {
  answer?: string;
  conversationId?: string;
  sources?: MobileSommelierSource[];
  error?: string;
};

export async function sendSommelierChat(params: {
  messages: MobileSommelierMessage[];
  conversationId?: string | null;
}) {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      errorMessage: "Set EXPO_PUBLIC_WEB_API_BASE_URL to use Pocket Sommelier on mobile.",
    };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false as const,
      errorMessage: "Session expired. Sign in again and try.",
    };
  }

  let response: Response;
  try {
    const payload = {
      messages: params.messages,
      stream: false,
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    };

    response = await fetch(`${baseUrl}/api/sommelier/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false as const,
      errorMessage: "Unable to reach Pocket Sommelier right now.",
    };
  }

  const payload = (await response.json().catch(() => null)) as SommelierChatResponse | null;
  if (!response.ok) {
    return {
      ok: false as const,
      errorMessage: payload?.error ?? "Pocket Sommelier is temporarily unavailable.",
    };
  }

  return {
    ok: true as const,
    answer: payload?.answer ?? "",
    conversationId: payload?.conversationId ?? null,
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
  };
}
