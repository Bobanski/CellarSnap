import { supabase } from "@/src/lib/supabase";

export function getWebApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_WEB_API_BASE_URL?.trim();
  return baseUrl ? baseUrl.replace(/\/$/, "") : null;
}

export async function getAccessTokenForApi() {
  const { data: sessionResult } = await supabase.auth.getSession();
  let session = sessionResult.session;
  const expiresSoon =
    typeof session?.expires_at === "number" &&
    session.expires_at * 1000 <= Date.now() + 90_000;

  if (!session?.access_token || expiresSoon) {
    const { data: refreshedSessionResult } = await supabase.auth.refreshSession();
    if (refreshedSessionResult.session?.access_token) {
      session = refreshedSessionResult.session;
    }
  }

  return session?.access_token ?? null;
}
