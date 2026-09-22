import { test, expect } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { AI_CONSENT_KEY, AI_CONSENT_VERSION, AI_PROCESSING_PATHS, hasAiConsent, readAiConsent, requestAiConsent } from "../packages/shared/src";
import { requireRequestAuth, RequestAuthError } from "../src/server/auth/requestAuth";
import { createAiConsentHandler } from "../src/app/api/privacy/ai-consent/handler";

const choice = (granted = true) => ({ version: AI_CONSENT_VERSION, granted, updatedAt: "2026-09-22T12:00:00Z" });
const user = (metadata: object = {}) => ({ id: "self", app_metadata: metadata, user_metadata: {} } as User);
const auth = (getUser: () => User | null) => ({
  getEnv: () => ({ supabaseUrl: "https://example.test", supabaseAnonKey: "public" }),
  createBearerClient: () => ({ auth: { getUser: async () => ({ data: { user: getUser() } }) } }),
  createCookieClient: async () => ({ auth: { getUser: async () => ({ data: { user: getUser() } }) } }) as never,
});

test("all personal AI routes reject absent/declined/stale/malformed consent for both auth modes", async () => {
  for (const path of AI_PROCESSING_PATHS) for (const bearer of [false, true]) {
    for (const record of [undefined, choice(false), { ...choice(), version: "old" }, { ...choice(), granted: "yes" }]) {
      const u = user({ [AI_CONSENT_KEY]: record });
      u.user_metadata = { [AI_CONSENT_KEY]: choice() }; // user-editable metadata never grants permission
      const request = new Request(`https://cluster.test${path}/`, { method: "POST", headers: bearer ? { Authorization: "Bearer old-token" } : {} });
      await expect(requireRequestAuth(request, undefined, auth(() => u))).rejects.toMatchObject({ status: 403, code: "AI_CONSENT_REQUIRED" });
    }
  }
});

test("fresh server account state permits opt-in then denies old tokens immediately after revocation", async () => {
  let current = user({ [AI_CONSENT_KEY]: choice() });
  const request = new Request("https://cluster.test/api/sommelier/chat", { method: "POST", headers: { Authorization: "Bearer unchanged" } });
  expect((await requireRequestAuth(request, undefined, auth(() => current))).user.id).toBe("self");
  current = user({ [AI_CONSENT_KEY]: choice(false) });
  await expect(requireRequestAuth(request, undefined, auth(() => current))).rejects.toMatchObject({ status: 403 });
  for (const [path, method] of [["/api/palate/distill", "GET"], ["/api/entries", "POST"], ["/api/privacy/ai-consent", "PUT"], ["/api/account", "DELETE"]]) {
    await expect(requireRequestAuth(new Request(`https://cluster.test${path}`, { method }), undefined, auth(() => current))).resolves.toMatchObject({ user: { id: "self" } });
  }
  await expect(requireRequestAuth(request, undefined, auth(() => null))).rejects.toMatchObject({ status: 401 });
});

function handlerFixture(authMode: "cookie" | "bearer" = "cookie") {
  let current = user({ provider: "email", other_setting: true });
  const writes: unknown[] = [];
  const handler = createAiConsentHandler({
    requireRequestAuth: async () => ({ user: current, authMode, supabase: {} as never }),
    createSupabaseAdminClient: () => ({ auth: { admin: { updateUserById: async (id: string, value: { app_metadata: object }) => {
      writes.push({ id, ...value });
      current = user({ ...current.app_metadata, ...value.app_metadata });
      return { data: { user: current }, error: null };
    } } } }) as never,
  });
  const request = (body: unknown, origin = "https://cluster.test") => new Request("https://cluster.test/api/privacy/ai-consent", { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { handler, writes, request, current: () => current };
}

test("consent API strictly stores only the caller's versioned choice and preserves unrelated metadata", async () => {
  const f = handlerFixture();
  expect(await (await f.handler(new Request("https://cluster.test/api/privacy/ai-consent"))).json()).toEqual({ consent: null });
  for (const granted of [true, false]) {
    const response = await f.handler(f.request({ granted, version: AI_CONSENT_VERSION }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).consent.granted).toBe(granted);
  }
  expect(f.writes).toHaveLength(2);
  expect(f.current().app_metadata).toMatchObject({ provider: "email", other_setting: true });
  for (const invalid of [{ granted: true }, { granted: "true", version: AI_CONSENT_VERSION }, { granted: true, version: "old" }, { granted: true, version: AI_CONSENT_VERSION, userId: "victim" }]) {
    expect((await f.handler(f.request(invalid))).status).toBe(400);
  }
  expect(f.writes).toHaveLength(2);
});

test("cookie writes reject foreign/missing origins; bearer writes don't depend on browser cookies", async () => {
  const f = handlerFixture();
  for (const origin of ["", "https://attacker.test"]) expect((await f.handler(f.request({ granted: true, version: AI_CONSENT_VERSION }, origin))).status).toBe(403);
  expect(f.writes).toHaveLength(0);
  const bearer = handlerFixture("bearer");
  expect((await bearer.handler(bearer.request({ granted: false, version: AI_CONSENT_VERSION }, ""))).status).toBe(200);
});

test("consent API keeps provider errors private and never claims a failed write succeeded", async () => {
  const f = createAiConsentHandler({ requireRequestAuth: async () => ({ user: user(), authMode: "bearer", supabase: {} as never }), createSupabaseAdminClient: () => { throw new Error("secret infrastructure detail"); } });
  const response = await f(handlerFixture().request({ granted: true, version: AI_CONSENT_VERSION }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
  const unauth = createAiConsentHandler({ requireRequestAuth: async () => { throw new RequestAuthError("Unauthorized"); }, createSupabaseAdminClient: () => { throw new Error("unreachable"); } });
  expect((await unauth(new Request("https://cluster.test/api/privacy/ai-consent"))).status).toBe(401);
});

test("sharing defaults off and requires a valid timestamp/version", () => {
  expect(hasAiConsent(null)).toBe(false);
  expect(readAiConsent({ [AI_CONSENT_KEY]: { ...choice(), updatedAt: "bad" } })).toBeNull();
  expect(hasAiConsent({ [AI_CONSENT_KEY]: choice() })).toBe(true);
});

test("mobile transport sends bearer without cookies and only confirms the saved choice", async () => {
  let called = false;
  const result = await requestAiConsent({ baseUrl: "https://api.test", granted: false, getToken: async () => "session", fetchImpl: async (input, init) => {
    called = true;
    expect(input).toBe("https://api.test/api/privacy/ai-consent");
    expect(init?.credentials).toBe("omit");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer session" });
    expect(JSON.parse(init?.body as string)).toEqual({ granted: false, version: AI_CONSENT_VERSION });
    return Response.json({ consent: choice(false) });
  } });
  expect(called).toBe(true); expect(result?.granted).toBe(false);
  await expect(requestAiConsent({ baseUrl: "", granted: true, fetchImpl: async () => Response.json({ consent: null }) })).rejects.toThrow("not confirmed");
  await expect(requestAiConsent({ baseUrl: "", fetchImpl: async () => Response.json({ nope: true }) })).rejects.toThrow("Unable to read");
});

test("timeout includes token acquisition and prevents a late permission write", async () => {
  let resolveToken!: (token: string) => void;
  let writes = 0;
  const result = requestAiConsent({ baseUrl: "", granted: true, timeoutMs: 5, getToken: () => new Promise(resolve => { resolveToken = resolve; }), fetchImpl: async () => { writes++; return Response.json({ consent: choice() }); } });
  await expect(result).rejects.toThrow("timed out");
  resolveToken("late"); await new Promise(resolve => setTimeout(resolve, 10));
  expect(writes).toBe(0);
});

test("encoded routing segments cannot skip personal AI consent", async () => {
  for (const path of ["/api/%6cabel-autofill", "/api/sommelier/%63hat", "/api/PHOTO-CONTEXT"]) {
    await expect(requireRequestAuth(new Request(`https://cluster.test${path}`, { method: "POST" }), undefined, auth(() => user()))).rejects.toMatchObject({ status: 403 });
  }
});

test("cookie choice writes accept a browser host after Next's internal hostname rewrite", async () => {
  const f = handlerFixture();
  const response = await f.handler(new Request("http://localhost:3013/api/privacy/ai-consent", { method: "PUT", headers: { Host: "127.0.0.1:3013", Origin: "http://127.0.0.1:3013", "Content-Type": "application/json" }, body: JSON.stringify({ granted: true, version: AI_CONSENT_VERSION }) }));
  expect(response.status).toBe(200);
  const foreign = await f.handler(new Request("http://localhost:3013/api/privacy/ai-consent", { method: "PUT", headers: { Host: "127.0.0.1:3013", Origin: "https://evil.test", "X-Forwarded-Host": "evil.test" }, body: JSON.stringify({ granted: true, version: AI_CONSENT_VERSION }) }));
  expect(foreign.status).toBe(403);
  expect(f.writes).toHaveLength(1);
});

test("missing sessions, network failures and server refusals never become a granted choice", async () => {
  await expect(requestAiConsent({ baseUrl: "", granted: true, getToken: async () => null, fetchImpl: async () => { throw new Error("must not send"); } })).rejects.toThrow("Sign in again");
  await expect(requestAiConsent({ baseUrl: "", granted: true, fetchImpl: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
  await expect(requestAiConsent({ baseUrl: "", granted: true, fetchImpl: async () => Response.json({ error: "Session expired" }, { status: 401 }) })).rejects.toThrow("Session expired");
});
