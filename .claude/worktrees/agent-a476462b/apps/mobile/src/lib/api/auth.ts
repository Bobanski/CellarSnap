import { buildAuthRedirectUrl, supabase } from "@/src/lib/supabase";
import { getWebApiBaseUrl } from "@/src/lib/api/webApi";

type PasswordSignInResponse = {
  session?: {
    access_token?: string;
    refresh_token?: string;
  };
  error?: string;
};

type RecoveryStartResponse = {
  channel?: "phone" | "email";
  phone?: string;
  error?: string;
};

type UsernameCheckResponse = {
  available?: boolean;
  error?: string;
};

type PhoneCheckResponse = {
  available?: boolean;
  normalized_phone?: string;
  error?: string;
};

function getMissingBaseUrlMessage(feature: string) {
  return `Set EXPO_PUBLIC_WEB_API_BASE_URL to enable ${feature}.`;
}

async function postJson<TResponse>(
  path: string,
  body: Record<string, unknown>,
  missingBaseUrlFeature = "secure sign-in and recovery"
): Promise<
  | { ok: true; payload: TResponse }
  | { ok: false; errorMessage: string; status: number; payload: TResponse | null }
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      errorMessage: getMissingBaseUrlMessage(missingBaseUrlFeature),
      status: 503,
      payload: null,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      errorMessage: "Unable to reach the server right now. Try again in a moment.",
      status: 0,
      payload: null,
    };
  }

  const payload = (await response.json().catch(() => null)) as TResponse | null;
  if (!response.ok) {
    const fallbackMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed.";

    return {
      ok: false,
      errorMessage: fallbackMessage,
      status: response.status,
      payload,
    };
  }

  return {
    ok: true,
    payload: (payload ?? {}) as TResponse,
  };
}

export async function signInWithIdentifier(params: {
  identifier: string;
  password: string;
  authMode: "email" | "phone";
}) {
  const result = await postJson<PasswordSignInResponse>("/api/auth/password-sign-in", {
    identifier: params.identifier,
    password: params.password,
    authMode: params.authMode,
  });

  if (!result.ok) {
    return {
      ok: false as const,
      errorMessage: result.errorMessage,
    };
  }

  const accessToken = result.payload.session?.access_token;
  const refreshToken = result.payload.session?.refresh_token;
  if (!accessToken || !refreshToken) {
    return {
      ok: false as const,
      errorMessage: "Authentication is temporarily unavailable.",
    };
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    return {
      ok: false as const,
      errorMessage: error.message,
    };
  }

  return {
    ok: true as const,
  };
}

export async function startPasswordRecovery(identifier: string) {
  const result = await postJson<RecoveryStartResponse>("/api/auth/recovery-start", {
    identifier,
    redirectTo: buildAuthRedirectUrl(),
  });

  if (!result.ok) {
    return {
      ok: false as const,
      errorMessage: result.errorMessage,
    };
  }

  if (result.payload.channel === "phone" && result.payload.phone) {
    return {
      ok: true as const,
      channel: "phone" as const,
      phone: result.payload.phone,
    };
  }

  return {
    ok: true as const,
    channel: "email" as const,
  };
}

export async function checkUsernameAvailable(username: string) {
  const result = await postJson<UsernameCheckResponse>("/api/username-check", {
    username,
  }, "account creation");

  if (!result.ok) {
    return {
      ok: false as const,
      errorMessage: result.errorMessage,
    };
  }

  return {
    ok: true as const,
    available: Boolean(result.payload.available),
  };
}

export async function checkPhoneAvailable(phone: string) {
  const result = await postJson<PhoneCheckResponse>("/api/phone-check", {
    phone,
  }, "account creation");

  if (!result.ok) {
    return {
      ok: false as const,
      errorMessage: result.errorMessage,
    };
  }

  return {
    ok: true as const,
    available: Boolean(result.payload.available),
    normalizedPhone: result.payload.normalized_phone ?? phone,
  };
}
