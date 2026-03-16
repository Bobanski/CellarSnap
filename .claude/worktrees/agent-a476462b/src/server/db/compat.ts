import {
  isAnyMissingDbColumnError,
  isMissingDbColumnError,
  type SupabaseErrorLike,
} from "@/lib/supabase/errors";

export function hasMissingAnyColumn(
  error: SupabaseErrorLike,
  columns: readonly string[]
) {
  return columns.some((column) => isMissingDbColumnError(error, column));
}

export function removeUnsupportedColumnsFromPayload<
  TPayload extends Record<string, unknown>,
>(
  payload: TPayload,
  error: SupabaseErrorLike,
  removableColumns: readonly string[]
) {
  const nextPayload: Record<string, unknown> = { ...payload };
  const removedColumns: string[] = [];

  for (const column of removableColumns) {
    if (column in nextPayload && isMissingDbColumnError(error, column)) {
      delete nextPayload[column];
      removedColumns.push(column);
    }
  }

  return {
    nextPayload: nextPayload as TPayload,
    removedColumns,
  };
}

type ColumnFallbackAttemptResult<TData> = {
  data: TData | null;
  error: SupabaseErrorLike | null;
};

type ExecuteWithColumnFallbackParams<
  TPayload extends Record<string, unknown>,
  TData,
> = {
  initialPayload: TPayload;
  removableColumns: readonly string[];
  maxAttempts: number;
  attempt: (payload: TPayload) => Promise<ColumnFallbackAttemptResult<TData>>;
};

type ExecuteSelectWithFallbackParams<TAttempt, TData> = {
  attempts: readonly TAttempt[];
  attempt: (attempt: TAttempt) => Promise<ColumnFallbackAttemptResult<TData>>;
  getFallbackColumns: (attempt: TAttempt) => readonly string[];
  fallbackOnAnyMissingColumn?: boolean;
};

type SelectFallbackExecutionResult<TAttempt, TData> = {
  data: TData | null;
  error: SupabaseErrorLike | null;
  usedAttempt: TAttempt | null;
};

export async function executeWithColumnFallback<
  TPayload extends Record<string, unknown>,
  TData,
>({
  initialPayload,
  removableColumns,
  maxAttempts,
  attempt,
}: ExecuteWithColumnFallbackParams<TPayload, TData>) {
  let payload = { ...initialPayload } as TPayload;
  const removedColumns: string[] = [];
  const boundedAttempts = Math.max(1, maxAttempts);

  let data: TData | null = null;
  let error: SupabaseErrorLike | null = null;

  for (let attemptIndex = 0; attemptIndex < boundedAttempts; attemptIndex += 1) {
    const result = await attempt(payload);
    data = result.data;
    error = result.error;

    if (!error) {
      break;
    }

    const removal = removeUnsupportedColumnsFromPayload(payload, error, removableColumns);
    if (removal.removedColumns.length === 0) {
      break;
    }

    payload = removal.nextPayload;
    removedColumns.push(...removal.removedColumns);
  }

  return {
    payload,
    data,
    error,
    removedColumns,
  };
}

export async function executeSelectWithFallback<TAttempt, TData>({
  attempts,
  attempt,
  getFallbackColumns,
  fallbackOnAnyMissingColumn = false,
}: ExecuteSelectWithFallbackParams<TAttempt, TData>): Promise<
  SelectFallbackExecutionResult<TAttempt, TData>
> {
  let data: TData | null = null;
  let error: SupabaseErrorLike | null = null;

  for (const currentAttempt of attempts) {
    const result = await attempt(currentAttempt);
    data = result.data;
    error = result.error;

    if (!error) {
      return {
        data,
        error: null,
        usedAttempt: currentAttempt,
      };
    }

    const isKnownMissingColumn = hasMissingAnyColumn(
      error,
      getFallbackColumns(currentAttempt)
    );
    const isAnyMissingColumn = fallbackOnAnyMissingColumn && isAnyMissingDbColumnError(error);
    if (isKnownMissingColumn || isAnyMissingColumn) {
      continue;
    }

    return {
      data,
      error,
      usedAttempt: null,
    };
  }

  return {
    data,
    error,
    usedAttempt: null,
  };
}
