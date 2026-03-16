import * as Linking from "expo-linking";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const EMAIL_OTP_TYPES: EmailOtpType[] = [
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

function asQueryStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isEmailOtpType(value: string): value is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(value as EmailOtpType);
}

export type AuthRedirectResult = {
  isRecovery: boolean;
};

export async function handleIncomingAuthUrl(url: string): Promise<AuthRedirectResult> {
  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};

  const otpTypeRaw = asQueryStringValue(query.type);
  const isRecovery = otpTypeRaw === "recovery";

  const accessToken = asQueryStringValue(query.access_token);
  const refreshToken = asQueryStringValue(query.refresh_token);
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { isRecovery };
  }

  const authCode = asQueryStringValue(query.code);
  if (authCode) {
    await supabase.auth.exchangeCodeForSession(authCode);
    return { isRecovery };
  }

  const tokenHash = asQueryStringValue(query.token_hash);
  if (tokenHash && otpTypeRaw && isEmailOtpType(otpTypeRaw)) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpTypeRaw,
    });
    return { isRecovery: otpTypeRaw === "recovery" };
  }

  return { isRecovery: false };
}
