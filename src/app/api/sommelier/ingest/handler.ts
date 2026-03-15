import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertSommelierAdminUser, SommelierAdminError } from "@/server/sommelier/admin";
import {
  ingestStructuredWineKnowledge,
  reingestKnowledgeDocument,
} from "@/server/sommelier/ingest";
import { toSommelierSchemaErrorMessage } from "@/server/sommelier/schema";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";

const requestSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("structured"),
  }),
  z.object({
    scope: z.literal("document"),
    documentId: z.string().uuid(),
  }),
]);

type SommelierIngestHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createAdminClient: typeof createSupabaseAdminClient;
  assertSommelierAdminUser: typeof assertSommelierAdminUser;
  ingestStructuredWineKnowledge: typeof ingestStructuredWineKnowledge;
  reingestKnowledgeDocument: typeof reingestKnowledgeDocument;
};

const defaultDependencies: SommelierIngestHandlerDependencies = {
  requireRequestAuth,
  createAdminClient: createSupabaseAdminClient,
  assertSommelierAdminUser,
  ingestStructuredWineKnowledge,
  reingestKnowledgeDocument,
};

async function loadAdminSummary(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const [
    documentCountResult,
    wineChunkCountResult,
    generalChunkCountResult,
    recentDocumentsResult,
  ] = await Promise.all([
    supabase.from("knowledge_documents").select("id", { count: "exact", head: true }),
    supabase.from("wine_knowledge_chunks").select("id", { count: "exact", head: true }),
    supabase
      .from("general_knowledge_chunks")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("knowledge_documents")
      .select(
        "id, title, content_type, ingest_status, chunk_count, last_ingested_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  return {
    documentCount: documentCountResult.count ?? 0,
    wineKnowledgeChunkCount: wineChunkCountResult.count ?? 0,
    generalKnowledgeChunkCount: generalChunkCountResult.count ?? 0,
    recentDocuments: recentDocumentsResult.data ?? [],
  };
}

export function createSommelierIngestHandler(
  dependencies: Partial<SommelierIngestHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  return {
    GET: async (request: Request) => {
      let auth;
      try {
        auth = await resolvedDependencies.requireRequestAuth(request);
        resolvedDependencies.assertSommelierAdminUser(auth.user.id);
      } catch (error) {
        if (error instanceof RequestAuthError) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (error instanceof SommelierAdminError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }

      try {
        const summary = await loadAdminSummary(resolvedDependencies.createAdminClient());
        return NextResponse.json(summary);
      } catch (error) {
        return NextResponse.json(
          {
            error: toSommelierSchemaErrorMessage(error),
          },
          { status: 503 }
        );
      }
    },
    POST: async (request: Request) => {
      let auth;
      try {
        auth = await resolvedDependencies.requireRequestAuth(request);
        resolvedDependencies.assertSommelierAdminUser(auth.user.id);
      } catch (error) {
        if (error instanceof RequestAuthError) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (error instanceof SommelierAdminError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
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
          { error: "Provide scope='structured' or scope='document' with a documentId." },
          { status: 400 }
        );
      }

      try {
        const supabase = resolvedDependencies.createAdminClient();

        if (parsed.data.scope === "structured") {
          const summary = await resolvedDependencies.ingestStructuredWineKnowledge({
            supabase,
          });
          return NextResponse.json({ scope: "structured", summary });
        }

        const summary = await resolvedDependencies.reingestKnowledgeDocument(
          parsed.data.documentId,
          {
            supabase,
          }
        );
        return NextResponse.json({ scope: "document", summary });
      } catch (error) {
        return NextResponse.json(
          {
            error: toSommelierSchemaErrorMessage(error),
          },
          { status: 503 }
        );
      }
    },
  };
}
