import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isMissingDbColumnError,
  isMissingDbFunctionError,
  isMissingDbTableError,
  type SupabaseErrorLike,
} from "@/lib/supabase/errors";

export const MINIMUM_SCHEMA_MIGRATION = "036_apply_friend_transition.sql";

type SchemaHealthCategory =
  | "entry_photo_context"
  | "interaction_privacy_comments"
  | "blocks_reports"
  | "post_save_survey";

type SchemaCheckStatus = "ok" | "missing" | "error";

type SchemaCheckResult = {
  key: string;
  status: SchemaCheckStatus;
  detail: string | null;
};

type RequiredColumnCheck = {
  category: SchemaHealthCategory;
  table: string;
  column: string;
};

type RequiredFunctionCheck = {
  category: SchemaHealthCategory;
  functionName: string;
  args: Record<string, unknown>;
};

type AdminSupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

export type SchemaHealthReport = {
  ok: boolean;
  minimum_schema_migration: string;
  checked_at: string;
  categories: Record<SchemaHealthCategory, SchemaCheckResult[]>;
};

const DUMMY_USER_ID = "00000000-0000-0000-0000-000000000000";

const REQUIRED_COLUMNS: RequiredColumnCheck[] = [
  { category: "entry_photo_context", table: "entry_photos", column: "type" },
  { category: "entry_photo_context", table: "entry_photos", column: "position" },
  { category: "entry_photo_context", table: "wine_entries", column: "location_place_id" },
  {
    category: "interaction_privacy_comments",
    table: "wine_entries",
    column: "reaction_privacy",
  },
  {
    category: "interaction_privacy_comments",
    table: "wine_entries",
    column: "comments_privacy",
  },
  {
    category: "interaction_privacy_comments",
    table: "wine_entries",
    column: "comments_scope",
  },
  {
    category: "interaction_privacy_comments",
    table: "profiles",
    column: "default_reaction_privacy",
  },
  {
    category: "interaction_privacy_comments",
    table: "profiles",
    column: "default_comments_privacy",
  },
  {
    category: "interaction_privacy_comments",
    table: "entry_comments",
    column: "deleted_at",
  },
  {
    category: "interaction_privacy_comments",
    table: "entry_reactions",
    column: "emoji",
  },
  { category: "blocks_reports", table: "user_blocks", column: "blocker_id" },
  { category: "blocks_reports", table: "user_blocks", column: "blocked_id" },
  { category: "blocks_reports", table: "content_reports", column: "target_type" },
  { category: "blocks_reports", table: "content_reports", column: "target_user_id" },
  {
    category: "post_save_survey",
    table: "wine_entries",
    column: "survey_how_was_it",
  },
  {
    category: "post_save_survey",
    table: "wine_entries",
    column: "survey_expectation_match",
  },
  {
    category: "post_save_survey",
    table: "wine_entries",
    column: "survey_drink_again",
  },
];

const REQUIRED_FUNCTIONS: RequiredFunctionCheck[] = [
  {
    category: "interaction_privacy_comments",
    functionName: "can_view_entry",
    args: {
      viewer_id: DUMMY_USER_ID,
      owner_id: DUMMY_USER_ID,
      privacy: "public",
    },
  },
  {
    category: "interaction_privacy_comments",
    functionName: "are_friends",
    args: {
      user_a: DUMMY_USER_ID,
      user_b: DUMMY_USER_ID,
    },
  },
  {
    category: "blocks_reports",
    functionName: "is_user_blocked",
    args: {
      viewer_id: DUMMY_USER_ID,
      target_id: DUMMY_USER_ID,
    },
  },
];

function makeCategoryBuckets(): Record<SchemaHealthCategory, SchemaCheckResult[]> {
  return {
    entry_photo_context: [],
    interaction_privacy_comments: [],
    blocks_reports: [],
    post_save_survey: [],
  };
}

function asErrorLike(value: unknown): SupabaseErrorLike {
  if (value && typeof value === "object" && "message" in value) {
    const candidate = value as {
      message: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    return {
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Unknown Supabase error.",
      code: typeof candidate.code === "string" ? candidate.code : null,
      details: typeof candidate.details === "string" ? candidate.details : null,
      hint: typeof candidate.hint === "string" ? candidate.hint : null,
    };
  }

  return {
    message: value instanceof Error ? value.message : "Unknown Supabase error.",
    code: null,
    details: null,
    hint: null,
  };
}

async function checkColumn({
  supabase,
  table,
  column,
}: {
  supabase: AdminSupabaseClient;
  table: string;
  column: string;
}): Promise<SchemaCheckResult> {
  const key = `${table}.${column}`;
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) {
    return {
      key,
      status: "ok",
      detail: null,
    };
  }

  if (isMissingDbTableError(error, table) || isMissingDbColumnError(error, column)) {
    return {
      key,
      status: "missing",
      detail: error.message,
    };
  }

  return {
    key,
    status: "error",
    detail: error.message,
  };
}

async function checkFunction({
  supabase,
  functionName,
  args,
}: {
  supabase: AdminSupabaseClient;
  functionName: string;
  args: Record<string, unknown>;
}): Promise<SchemaCheckResult> {
  const { error } = await supabase.rpc(functionName, args);
  if (!error) {
    return {
      key: functionName,
      status: "ok",
      detail: null,
    };
  }

  if (isMissingDbFunctionError(error, functionName)) {
    return {
      key: functionName,
      status: "missing",
      detail: error.message,
    };
  }

  return {
    key: functionName,
    status: "error",
    detail: error.message,
  };
}

export async function runSchemaHealthChecks(): Promise<SchemaHealthReport> {
  const supabase = createSupabaseAdminClient();
  const categories = makeCategoryBuckets();

  const columnResults = await Promise.all(
    REQUIRED_COLUMNS.map(async (item) => ({
      category: item.category,
      result: await checkColumn({
        supabase,
        table: item.table,
        column: item.column,
      }),
    }))
  );

  const functionResults = await Promise.all(
    REQUIRED_FUNCTIONS.map(async (item) => ({
      category: item.category,
      result: await checkFunction({
        supabase,
        functionName: item.functionName,
        args: item.args,
      }),
    }))
  );

  for (const item of [...columnResults, ...functionResults]) {
    categories[item.category].push(item.result);
  }

  const report: SchemaHealthReport = {
    ok: Object.values(categories)
      .flat()
      .every((result) => result.status === "ok"),
    minimum_schema_migration: MINIMUM_SCHEMA_MIGRATION,
    checked_at: new Date().toISOString(),
    categories,
  };

  return report;
}

export function toSchemaHealthErrorMessage(error: unknown) {
  const normalized = asErrorLike(error);
  return normalized.message;
}
