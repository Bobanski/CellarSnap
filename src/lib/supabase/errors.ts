export type SupabaseErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function isMissingDbTableError(error: SupabaseErrorLike, table: string) {
  const code = error.code ?? "";
  const message = normalize(error.message);
  const needle = normalize(table);

  // Supabase/PostgREST can surface either SQLSTATEs or PostgREST codes depending
  // on the path (e.g. relation missing vs schema cache missing).
  if (code === "42P01" && message.includes(needle)) return true; // undefined_table
  if (code === "PGRST205" && message.includes(needle)) return true; // missing relation in schema cache

  // Fallback for environments that drop the code but keep the message.
  if (message.includes("does not exist") && message.includes(needle)) return true;
  if (message.includes("schema cache") && message.includes(needle)) return true;

  return false;
}

export function isMissingDbFunctionError(
  error: SupabaseErrorLike,
  functionName: string
) {
  const code = error.code ?? "";
  const message = normalize(error.message);
  const needle = normalize(functionName);

  if (code === "42883" && message.includes(needle)) return true; // undefined_function
  if (code === "PGRST202" && message.includes(needle)) return true; // missing function in schema cache

  if (message.includes("does not exist") && message.includes(needle)) return true;
  if (message.includes("schema cache") && message.includes(needle)) return true;

  return false;
}

export function isMissingDbColumnError(error: SupabaseErrorLike, column: string) {
  const code = error.code ?? "";
  const message = normalize(error.message);
  const needle = normalize(column);

  if (code === "42703" && message.includes(needle)) return true; // undefined_column

  if (message.includes("column") && message.includes("does not exist") && message.includes(needle)) {
    return true;
  }

  return false;
}

