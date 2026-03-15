import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isMissingDbFunctionError,
  isMissingDbTableError,
  type SupabaseErrorLike,
} from "@/lib/supabase/errors";

const SOMMELIER_TABLES = [
  "knowledge_documents",
  "wine_knowledge_chunks",
  "general_knowledge_chunks",
  "sommelier_conversations",
  "sommelier_messages",
] as const;

const SOMMELIER_FUNCTIONS = [
  "match_wine_knowledge",
  "match_general_knowledge",
] as const;

export type SommelierSchemaHealth = {
  ok: boolean;
  checked_at: string;
  missing: string[];
};

export function isSommelierSchemaMissingError(error: SupabaseErrorLike) {
  return (
    SOMMELIER_TABLES.some((table) => isMissingDbTableError(error, table)) ||
    SOMMELIER_FUNCTIONS.some((fn) => isMissingDbFunctionError(error, fn))
  );
}

export function toSommelierSchemaErrorMessage(error: unknown) {
  const fallback =
    "Pocket Sommelier schema is missing. Apply migration 053_pocket_sommelier.sql before using this feature.";

  if (!error || typeof error !== "object" || !("message" in error)) {
    return fallback;
  }

  const candidate = error as SupabaseErrorLike;
  return isSommelierSchemaMissingError(candidate)
    ? fallback
    : candidate.message || fallback;
}

export async function runSommelierSchemaHealthChecks(
  supabase = createSupabaseAdminClient()
): Promise<SommelierSchemaHealth> {
  const missing: string[] = [];

  for (const table of SOMMELIER_TABLES) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error) {
      if (isMissingDbTableError(error, table)) {
        missing.push(table);
        continue;
      }
      throw error;
    }
  }

  for (const fn of SOMMELIER_FUNCTIONS) {
    const { error } = await supabase.rpc(fn, {
      query_embedding: Array(1536).fill(0),
      match_count: 1,
      match_threshold: 0.72,
    });

    if (error) {
      if (isMissingDbFunctionError(error, fn)) {
        missing.push(fn);
        continue;
      }
      if (
        typeof error.message === "string" &&
        error.message.toLowerCase().includes("different vector dimensions")
      ) {
        continue;
      }
      throw error;
    }
  }

  return {
    ok: missing.length === 0,
    checked_at: new Date().toISOString(),
    missing,
  };
}
