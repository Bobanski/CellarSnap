import { NextResponse } from "next/server";
import { z } from "zod";
import { AI_CONSENT_KEY, AI_CONSENT_VERSION, readAiConsent } from "@shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";

const choiceSchema = z.object({ granted: z.boolean(), version: z.literal(AI_CONSENT_VERSION) }).strict();
const headers = { "Cache-Control": "no-store" };
export function createAiConsentHandler(dependencies = { requireRequestAuth, createSupabaseAdminClient }) {
  return async function handle(request: Request) {
    try {
      const { user, authMode } = await dependencies.requireRequestAuth(request);
      if (request.method === "GET") {
        return NextResponse.json({ consent: readAiConsent(user.app_metadata) }, { headers });
      }
      // Next may use an internal hostname in request.url. A browser cannot forge
      // Host; compare it to Origin instead of trusting X-Forwarded-Host.
      const requestUrl = new URL(request.url);
      let sameOrigin = false;
      try {
        const origin = new URL(request.headers.get("origin") ?? "");
        sameOrigin = origin.host === (request.headers.get("host") ?? requestUrl.host) && origin.protocol === requestUrl.protocol;
      } catch { /* Missing/invalid Origin fails closed for cookie writes. */ }
      if (authMode === "cookie" && !sameOrigin) {
        return NextResponse.json({ error: "Please update this choice from Cluster." }, { status: 403, headers });
      }
      const parsed = choiceSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: "Choose whether to allow AI sharing using the current disclosure." }, { status: 400, headers });
      const consent = { ...parsed.data, updatedAt: new Date().toISOString() };
      // GoTrue merges this single app_metadata key; never accepts a user ID or arbitrary metadata.
      const { data, error } = await dependencies.createSupabaseAdminClient().auth.admin.updateUserById(user.id, {
        app_metadata: { [AI_CONSENT_KEY]: consent },
      });
      if (error || !data.user || readAiConsent(data.user.app_metadata)?.granted !== consent.granted) {
        throw new Error("Choice could not be saved");
      }
      return NextResponse.json({ consent: readAiConsent(data.user.app_metadata) }, { headers });
    } catch (error) {
      if (error instanceof RequestAuthError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
      return NextResponse.json({ error: "Unable to save or load your AI choice. Please try again." }, { status: 503, headers });
    }
  };
}
