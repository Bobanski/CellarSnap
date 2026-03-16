import {
  isMissingDbFunctionError,
  type SupabaseErrorLike,
} from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FriendTransitionAction =
  | "request"
  | "accept"
  | "decline"
  | "remove";

export type FriendTransitionStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "none";

export type FriendTransitionResult = {
  status: FriendTransitionStatus;
  requestId: string | null;
  changed: boolean;
};

type TransitionSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type TransitionRpcRow = {
  status?: string | null;
  request_id?: string | null;
  changed?: boolean | null;
};

const APPLY_FRIEND_TRANSITION_FUNCTION = "apply_friend_transition";
const APPLY_FRIEND_TRANSITION_MIGRATION = "036_apply_friend_transition.sql";

export class FriendTransitionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "FRIEND_TRANSITION_FAILED") {
    super(message);
    this.name = "FriendTransitionError";
    this.status = status;
    this.code = code;
  }
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

function mapTransitionError(error: SupabaseErrorLike) {
  if (isMissingDbFunctionError(error, APPLY_FRIEND_TRANSITION_FUNCTION)) {
    return new FriendTransitionError(
      `Database schema is out of date. Apply migration \`${APPLY_FRIEND_TRANSITION_MIGRATION}\` and retry.`,
      503,
      "SCHEMA_OUTDATED"
    );
  }

  const message = error.message ?? "Unknown Supabase error.";
  const code = error.code ?? "";

  if (message.includes("FRIEND_TRANSITION_UNAUTHORIZED") || code === "42501") {
    return new FriendTransitionError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (
    message.includes("FRIEND_TRANSITION_TARGET_REQUIRED") ||
    message.includes("FRIEND_TRANSITION_SELF_NOT_ALLOWED") ||
    message.includes("FRIEND_TRANSITION_INVALID_ACTION") ||
    code === "22023"
  ) {
    if (message.includes("FRIEND_TRANSITION_TARGET_REQUIRED")) {
      return new FriendTransitionError(
        "Target user is required.",
        400,
        "INVALID_REQUEST"
      );
    }

    if (message.includes("FRIEND_TRANSITION_SELF_NOT_ALLOWED")) {
      return new FriendTransitionError(
        "Cannot friend yourself.",
        400,
        "INVALID_REQUEST"
      );
    }

    return new FriendTransitionError(
      "Invalid friendship transition request.",
      400,
      "INVALID_REQUEST"
    );
  }

  if (message.includes("FRIEND_TRANSITION_NOT_FOUND") || code === "P0002") {
    return new FriendTransitionError("Request not found.", 404, "NOT_FOUND");
  }

  if (message.includes("FRIEND_TRANSITION_CONFLICT") || code === "23514") {
    const detail = error.details?.trim();
    return new FriendTransitionError(
      detail && detail.length > 0 ? detail : "Transition conflict.",
      409,
      "CONFLICT"
    );
  }

  return new FriendTransitionError(message, 500, "FRIEND_TRANSITION_FAILED");
}

function normalizeTransitionStatus(raw: string | null | undefined) {
  if (
    raw === "pending" ||
    raw === "accepted" ||
    raw === "declined" ||
    raw === "none"
  ) {
    return raw;
  }
  return null;
}

function firstRpcRow(data: unknown): TransitionRpcRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as TransitionRpcRow) : null;
  }

  if (data && typeof data === "object") {
    return data as TransitionRpcRow;
  }

  return null;
}

export async function applyFriendTransition(
  supabase: TransitionSupabaseClient,
  targetUserId: string,
  action: FriendTransitionAction
): Promise<FriendTransitionResult> {
  const { data, error } = await supabase.rpc(APPLY_FRIEND_TRANSITION_FUNCTION, {
    target_user_id: targetUserId,
    action,
  });

  if (error) {
    throw mapTransitionError(asErrorLike(error));
  }

  const row = firstRpcRow(data);
  const status = normalizeTransitionStatus(row?.status ?? null);

  if (!row || !status) {
    throw new FriendTransitionError(
      "Unexpected transition response from database.",
      500,
      "BAD_RESPONSE"
    );
  }

  return {
    status,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    changed: Boolean(row.changed),
  };
}
