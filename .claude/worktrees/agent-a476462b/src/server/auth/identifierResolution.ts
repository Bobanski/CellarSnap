import { z } from "zod";
import { normalizePhone } from "@/lib/validation/phone";

export type IdentifierMode = "auto" | "username" | "phone" | "email";

export type IdentifierResolution = {
  email: string | null;
  phone: string | null;
};

type RpcCapableClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const emailSchema = z.string().email();

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function resolveIdentifierForAuth({
  client,
  identifier,
  mode = "auto",
}: {
  client: RpcCapableClient;
  identifier: string;
  mode?: IdentifierMode;
}): Promise<IdentifierResolution> {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return { email: null, phone: null };
  }

  const normalizedPhone = normalizePhone(trimmedIdentifier);
  const parsedEmail = emailSchema.safeParse(trimmedIdentifier.toLowerCase());
  const normalizedEmail = parsedEmail.success ? parsedEmail.data : null;
  const resolveByPhone = mode === "phone" || (mode === "auto" && !!normalizedPhone);
  const resolveByEmail =
    mode === "email" || (mode === "auto" && !!normalizedEmail && !normalizedPhone);

  if (resolveByPhone) {
    if (!normalizedPhone) {
      return { email: null, phone: null };
    }

    const { data, error } = await client.rpc("get_email_for_phone", {
      phone: normalizedPhone,
    });
    if (error) {
      throw error;
    }

    return {
      phone: normalizedPhone,
      email: asNullableString(data),
    };
  }

  if (resolveByEmail) {
    if (!normalizedEmail) {
      return { email: null, phone: null };
    }

    const { data, error } = await client.rpc("get_phone_for_email", {
      email: normalizedEmail,
    });
    if (error) {
      throw error;
    }

    return {
      email: normalizedEmail,
      phone: asNullableString(data),
    };
  }

  const [phoneResponse, emailResponse] = await Promise.all([
    client.rpc("get_phone_for_username", { username: trimmedIdentifier }),
    client.rpc("get_email_for_username", { username: trimmedIdentifier }),
  ]);
  if (phoneResponse.error) {
    throw phoneResponse.error;
  }
  if (emailResponse.error) {
    throw emailResponse.error;
  }

  return {
    phone: asNullableString(phoneResponse.data),
    email: asNullableString(emailResponse.data),
  };
}
