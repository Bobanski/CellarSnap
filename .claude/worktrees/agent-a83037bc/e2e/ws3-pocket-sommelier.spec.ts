import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { createSommelierChatHandler } from "../src/app/api/sommelier/chat/handler";
import { createSommelierIngestHandler } from "../src/app/api/sommelier/ingest/handler";
import { createSommelierUploadDocumentHandler } from "../src/app/api/sommelier/upload-document/handler";
import { __sommelierTestUtils } from "../src/server/sommelier/chat";
import { __sommelierIngestTestUtils } from "../src/server/sommelier/ingest";
import { chunkMarkdown, chunkText } from "../src/server/sommelier/chunker";
import { RequestAuthError } from "../src/server/auth/requestAuth";

function makeUser(id: string, email = `${id}@example.com`): User {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
  } as unknown as User;
}

test.describe("WS3 pocket sommelier", () => {
  test("chunkText and chunkMarkdown produce chunked content", async () => {
    const textChunks = chunkText(
      Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1} with tasting notes.`).join(
        "\n\n"
      ),
      20,
      4
    );
    const markdownChunks = chunkMarkdown(
      "# Burgundy\nChardonnay details.\n\n## Chablis\nMineral and saline notes.\n\n## Cote de Beaune\nTexture and oak.",
      18,
      4
    );

    expect(textChunks.length).toBeGreaterThan(1);
    expect(markdownChunks.length).toBeGreaterThan(1);
    expect(markdownChunks[0]?.heading).toContain("# Burgundy");
  });

  test("chat handler returns JSON payload for non-stream requests", async () => {
    const handler = createSommelierChatHandler({
      requireRequestAuth: async () =>
        ({
          user: makeUser("user-1", "eitansneider1@gmail.com"),
          supabase: {} as never,
          authMode: "bearer",
        }) as never,
      createAdminClient: () => ({}) as never,
      chatWithSommelier: async () => ({
        answer: "Try nebbiolo with braised beef.",
        sources: [
          {
            id: "source-1",
            kind: "wine_knowledge",
            label: "Barolo",
            excerpt: "Structured nebbiolo context",
          },
        ],
        context: {} as never,
      }),
      ensureSommelierConversation: async () => "11111111-1111-4111-8111-111111111111",
      appendSommelierMessages: async () => undefined,
    });

    const response = await handler(
      new Request("http://localhost/api/sommelier/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "What should I drink with beef?" }],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.answer).toContain("nebbiolo");
    expect(payload.conversationId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.sources).toBeUndefined();
  });

  test("chat handler returns event stream payload when stream=true", async () => {
    const handler = createSommelierChatHandler({
      requireRequestAuth: async () =>
        ({
          user: makeUser("user-1", "eitansneider1@gmail.com"),
          supabase: {} as never,
          authMode: "bearer",
        }) as never,
      createAdminClient: () => ({}) as never,
      streamSommelierChat: async () =>
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                'event: meta\ndata: {"sources":[{"id":"s1","kind":"wine_knowledge","label":"Barolo","excerpt":"Nebbiolo context"}]}\n\n'
              )
            );
            controller.enqueue(
              encoder.encode('event: delta\ndata: {"text":"Barolo works well."}\n\n')
            );
            controller.enqueue(
              encoder.encode(
                'event: done\ndata: {"text":"Barolo works well.","sources":[]}\n\n'
              )
            );
            controller.close();
          },
        }),
      ensureSommelierConversation: async () => "22222222-2222-4222-8222-222222222222",
      appendSommelierMessages: async () => undefined,
    });

    const response = await handler(
      new Request("http://localhost/api/sommelier/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Pairing?" }],
          stream: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-sommelier-conversation-id")).toBe(
      "22222222-2222-4222-8222-222222222222"
    );
    const payload = await response.text();
    expect(payload).toContain("event: delta");
    expect(payload).toContain("Barolo works well.");
  });

  test("assistant history is encoded as output_text for Responses API", () => {
    const input = __sommelierTestUtils.buildResponseInput(
      [
        { role: "user", content: "Recommend something from Piedmont." },
        { role: "assistant", content: "Try nebbiolo with truffle pasta." },
        { role: "user", content: "What about white options?" },
      ],
      {
        contextText: "User likes savory, high-acid wines.",
        sources: [],
      }
    );

    const assistantTurn = input.find((message) => message.role === "assistant");
    const userTurns = input.filter((message) => message.role === "user");

    expect(assistantTurn?.content[0]?.type).toBe("output_text");
    expect(userTurns.every((message) => message.content[0]?.type === "input_text")).toBeTruthy();
  });

  test("entry serializer produces natural cellar text for embeddings", () => {
    const content = __sommelierIngestTestUtils.serializeWineEntryRow(
      {
        id: "entry-1",
        user_id: "user-1",
        wine_name: "Pegau Cuvee Reservee",
        producer: "Domaine du Pegau",
        vintage: "1998",
        wine_type: "red",
        country: "France",
        region: "Rhone",
        appellation: "Chateauneuf-du-Pape",
        classification: "AOC",
        rating: 95,
        price_paid: 180,
        price_paid_currency: "usd",
        qpr_level: "good_value",
        notes: "Savory and spicy with a long finish",
        ai_notes_summary: "Layered and resolved with earthy depth.",
        advanced_notes: {
          body: "full",
          acidity: "medium_plus",
          tannin: "medium",
          alcohol: "high",
          sweetness: "dry",
        },
        consumed_at: "2025-01-14T20:15:00.000Z",
      },
      ["Grenache", "Syrah", "Mourvedre"]
    );

    expect(content).toContain("Pegau Cuvee Reservee by Domaine du Pegau 1998 red.");
    expect(content).toContain("Primary grapes: Grenache, Syrah, and Mourvedre.");
    expect(content).toContain("Rating: 95/100.");
    expect(content).toContain("Structure:");
  });

  test("chat handler returns 401 when auth fails", async () => {
    const handler = createSommelierChatHandler({
      requireRequestAuth: async () => {
        throw new RequestAuthError("Unauthorized");
      },
    });

    const response = await handler(
      new Request("http://localhost/api/sommelier/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("upload document handler accepts JSON documents for admins", async () => {
    const handler = createSommelierUploadDocumentHandler({
      requireRequestAuth: async () =>
        ({
          user: makeUser("admin-1"),
          supabase: {} as never,
          authMode: "bearer",
        }) as never,
      assertSommelierAdminUser: () => undefined,
      createAdminClient: () => ({}) as never,
      ingestKnowledgeDocument: async () => ({
        documentId: "11111111-1111-4111-8111-111111111111",
        title: "Guide",
        chunkCount: 3,
        contentType: "markdown",
      }),
    });

    const response = await handler.POST(
      new Request("http://localhost/api/sommelier/upload-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Guide",
          content: "# Hello\nWorld",
          contentType: "markdown",
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary.chunkCount).toBe(3);
  });

  test("ingest handler triggers structured ingestion for admins", async () => {
    const handler = createSommelierIngestHandler({
      requireRequestAuth: async () =>
        ({
          user: makeUser("admin-1"),
          supabase: {} as never,
          authMode: "bearer",
        }) as never,
      assertSommelierAdminUser: () => undefined,
      createAdminClient: () => ({
        from(table: string) {
          return {
            select() {
              return table === "knowledge_documents"
                ? Promise.resolve({ data: [], error: null, count: 0 })
                : Promise.resolve({ data: [], error: null, count: 0 });
            },
            order() {
              return {
                limit: async () => ({ data: [], error: null }),
              };
            },
          };
        },
      }) as never,
      ingestStructuredWineKnowledge: async () => [
        { sourceTable: "base_profiles", insertedCount: 10 },
      ],
    });

    const response = await handler.POST(
      new Request("http://localhost/api/sommelier/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "structured" }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary[0]?.sourceTable).toBe("base_profiles");
  });

  test("ingest handler triggers entry embedding ingestion for admins", async () => {
    const handler = createSommelierIngestHandler({
      requireRequestAuth: async () =>
        ({
          user: makeUser("admin-1"),
          supabase: {} as never,
          authMode: "bearer",
        }) as never,
      assertSommelierAdminUser: () => undefined,
      createAdminClient: () => ({}) as never,
      ingestWineEntryEmbeddings: async () => ({
        sourceTable: "wine_entries",
        insertedCount: 12,
      }),
    });

    const response = await handler.POST(
      new Request("http://localhost/api/sommelier/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "entries" }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.scope).toBe("entries");
    expect(payload.summary?.sourceTable).toBe("wine_entries");
  });
});
