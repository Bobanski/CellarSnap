import { normalizePhone } from "./validation/phone";

export type AuthMode = "email" | "phone";
export type IdentifierMode = "auto" | "username" | "phone" | "email";

export const DEFAULT_AUTH_MODE: AuthMode = "email";

export function getAuthMode(raw: unknown): AuthMode {
  if (raw === "phone" || raw === "email") {
    return raw;
  }
  return DEFAULT_AUTH_MODE;
}

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export type RpcCapableClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<RpcResult> | RpcResult;
};

export type IdentifierResolution = {
  email: string | null;
  phone: string | null;
};

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value || !value.includes("@")) {
    return null;
  }
  return value;
}

async function safeRpc(
  client: RpcCapableClient,
  fn: string,
  args: Record<string, unknown>
) {
  try {
    const result = await client.rpc(fn, args);
    return {
      data: result.data,
      errorMessage: result.error?.message ?? null,
    };
  } catch (error) {
    return {
      data: null,
      errorMessage: error instanceof Error ? error.message : "RPC failed.",
    };
  }
}

export async function resolveSignInIdentifier({
  client,
  identifier,
  mode = "auto",
}: {
  client: RpcCapableClient;
  identifier: string;
  mode?: IdentifierMode;
}): Promise<IdentifierResolution> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) {
    return { email: null, phone: null };
  }

  const normalizedPhone = normalizePhone(normalizedIdentifier);
  const normalizedEmail = normalizeEmail(normalizedIdentifier);
  const resolveByPhone = mode === "phone" || (mode === "auto" && !!normalizedPhone);
  const resolveByEmail =
    mode === "email" || (mode === "auto" && !!normalizedEmail && !normalizedPhone);

  if (resolveByPhone) {
    if (!normalizedPhone) {
      return { email: null, phone: null };
    }

    const { data } = await safeRpc(client, "get_email_for_phone", {
      phone: normalizedPhone,
    });
    return {
      phone: normalizedPhone,
      email: asNullableString(data),
    };
  }

  if (resolveByEmail) {
    if (!normalizedEmail) {
      return { email: null, phone: null };
    }

    const { data } = await safeRpc(client, "get_phone_for_email", {
      email: normalizedEmail,
    });
    return {
      email: normalizedEmail,
      phone: asNullableString(data),
    };
  }

  const [phoneResponse, emailResponse] = await Promise.all([
    safeRpc(client, "get_phone_for_username", { username: normalizedIdentifier }),
    safeRpc(client, "get_email_for_username", { username: normalizedIdentifier }),
  ]);

  const resolvedPhone = asNullableString(phoneResponse.data);
  const resolvedEmail = asNullableString(emailResponse.data);
  return {
    phone: resolvedPhone ?? normalizedPhone,
    email: resolvedEmail ?? normalizedEmail,
  };
}
