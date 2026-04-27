import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { streamSommelierChat, chatWithSommelier } from "@/server/sommelier/chat";
import {
  appendSommelierMessages,
  ensureSommelierConversation,
} from "@/server/sommelier/conversations";
import { toSommelierSchemaErrorMessage } from "@/server/sommelier/schema";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { AUDIENCE_MODES, type AudienceMode } from "@shared";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(24),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
});

type SommelierChatHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createAdminClient: typeof createSupabaseAdminClient;
  chatWithSommelier: typeof chatWithSommelier;
  streamSommelierChat: typeof streamSommelierChat;
  ensureSommelierConversation: typeof ensureSommelierConversation;
  appendSommelierMessages: typeof appendSommelierMessages;
};

const defaultDependencies: SommelierChatHandlerDependencies = {
  requireRequestAuth,
  createAdminClient: createSupabaseAdminClient,
  chatWithSommelier,
  streamSommelierChat,
  ensureSommelierConversation,
  appendSommelierMessages,
};

export function createSommelierChatHandler(
  dependencies: Partial<SommelierChatHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  return async function POST(request: Request) {
    let auth;
    try {
      auth = await resolvedDependencies.requireRequestAuth(request);
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      throw error;
    }

    // Beta gate removed (PR #62 follow-up). Imports kept referenced via
    // `void` so linters don't flag them — easy to re-enable later.
    void createPrivateBetaFeatureDeniedResponse;
    void userHasPrivateBetaFeatureAccess;

    const rateLimit = applyRateLimit({
      request,
      routeKey: "sommelier-chat",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      userId: auth.user.id,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many sommelier messages in a short time. Please wait a bit and try again.",
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide a messages array with user and assistant turns." },
        { status: 400 }
      );
    }

    // Explicit validation: ensure messages array is not empty (schema requires min(1))
    if (parsed.data.messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array cannot be empty." },
        { status: 400 }
      );
    }

    const headers = rateLimitHeaders(rateLimit);

    let audienceMode: AudienceMode = "explorer";
    try {
      const { data: modeRow } = await auth.supabase
        .from("profiles")
        .select("audience_mode")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (
        typeof modeRow?.audience_mode === "string" &&
        (AUDIENCE_MODES as readonly string[]).includes(modeRow.audience_mode)
      ) {
        audienceMode = modeRow.audience_mode as AudienceMode;
      }
    } catch {
      // Fall back to explorer if the column doesn't exist yet.
    }

    try {
      const adminSupabase = resolvedDependencies.createAdminClient();
      const latestUserMessage =
        [...parsed.data.messages].reverse().find((message) => message.role === "user")
          ?.content ?? null;
      const conversationId = await resolvedDependencies.ensureSommelierConversation({
        supabase: adminSupabase,
        userId: auth.user.id,
        conversationId: parsed.data.conversationId,
        titleSeed: latestUserMessage,
      });
      const latestMessage = parsed.data.messages[parsed.data.messages.length - 1];

      if (latestMessage?.role === "user") {
        await resolvedDependencies.appendSommelierMessages({
          supabase: adminSupabase,
          conversationId,
          messages: [latestMessage],
        });
      }

      if (parsed.data.stream) {
        const stream = await resolvedDependencies.streamSommelierChat({
          userId: auth.user.id,
          messages: parsed.data.messages,
          requestSupabase: auth.supabase,
          adminSupabase,
          audienceMode,
          onComplete: async ({ answer }) => {
            await resolvedDependencies.appendSommelierMessages({
              supabase: adminSupabase,
              conversationId,
              messages: [
                {
                  role: "assistant",
                  content: answer,
                },
              ],
            });
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            ...headers,
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Sommelier-Conversation-Id": conversationId,
          },
        });
      }

      const result = await resolvedDependencies.chatWithSommelier({
        userId: auth.user.id,
        messages: parsed.data.messages,
        requestSupabase: auth.supabase,
        adminSupabase,
        audienceMode,
      });

      return NextResponse.json(
        {
          answer: result.answer,
          conversationId,
        },
        { headers }
      );
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        return NextResponse.json(
          { error: error.message || "OpenAI request failed" },
          { status: 502, headers }
        );
      }

      const message =
        error instanceof Error
          ? toSommelierSchemaErrorMessage(error)
          : "Pocket Sommelier is temporarily unavailable.";
      return NextResponse.json({ error: message }, { status: 503, headers });
    }
  };
}
