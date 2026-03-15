import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertSommelierAdminUser, SommelierAdminError } from "@/server/sommelier/admin";
import {
  extractDocumentTextFromFile,
  ingestKnowledgeDocument,
} from "@/server/sommelier/ingest";
import { toSommelierSchemaErrorMessage } from "@/server/sommelier/schema";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";

const textBodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1),
  contentType: z.enum(["markdown", "text"]).optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
});

type SommelierUploadDocumentHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createAdminClient: typeof createSupabaseAdminClient;
  assertSommelierAdminUser: typeof assertSommelierAdminUser;
  extractDocumentTextFromFile: typeof extractDocumentTextFromFile;
  ingestKnowledgeDocument: typeof ingestKnowledgeDocument;
};

const defaultDependencies: SommelierUploadDocumentHandlerDependencies = {
  requireRequestAuth,
  createAdminClient: createSupabaseAdminClient,
  assertSommelierAdminUser,
  extractDocumentTextFromFile,
  ingestKnowledgeDocument,
};

export function createSommelierUploadDocumentHandler(
  dependencies: Partial<SommelierUploadDocumentHandlerDependencies> = {}
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
        const { data, error } = await resolvedDependencies
          .createAdminClient()
          .from("knowledge_documents")
          .select(
            "id, title, source_url, source_filename, content_type, ingest_status, chunk_count, last_ingested_at, created_at"
          )
          .order("created_at", { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        return NextResponse.json({ documents: data ?? [] });
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

      const contentTypeHeader = request.headers.get("content-type") ?? "";

      try {
        if (contentTypeHeader.includes("application/json")) {
          const body = await request.json();
          const parsed = textBodySchema.safeParse(body);
          if (!parsed.success) {
            return NextResponse.json(
              { error: "Provide title and content to ingest a knowledge document." },
              { status: 400 }
            );
          }

          const summary = await resolvedDependencies.ingestKnowledgeDocument({
            title: parsed.data.title,
            content: parsed.data.content,
            contentType: parsed.data.contentType ?? "markdown",
            sourceUrl: parsed.data.sourceUrl || null,
            uploadedBy: auth.user.id,
            supabase: resolvedDependencies.createAdminClient(),
          });
          return NextResponse.json({ summary });
        }

        const formData = await request.formData();
        const uploaded = formData.get("file") ?? formData.get("document");
        if (!(uploaded instanceof File)) {
          return NextResponse.json(
            { error: "Upload a .md, .txt, or .pdf file with field 'file' or 'document'." },
            { status: 400 }
          );
        }

        const extracted = await resolvedDependencies.extractDocumentTextFromFile(uploaded);
        if (!extracted.content.trim()) {
          return NextResponse.json(
            { error: "The uploaded document did not contain extractable text." },
            { status: 400 }
          );
        }

        const title =
          (formData.get("title")?.toString().trim() || uploaded.name.replace(/\.[^.]+$/, "")) ??
          uploaded.name;
        const sourceUrl = formData.get("source_url")?.toString().trim() || null;
        const summary = await resolvedDependencies.ingestKnowledgeDocument({
          title,
          content: extracted.content,
          contentType: extracted.contentType,
          sourceUrl,
          sourceFilename: uploaded.name,
          uploadedBy: auth.user.id,
          supabase: resolvedDependencies.createAdminClient(),
        });

        return NextResponse.json({ summary });
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
