import { test, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createPasswordSignInHandler } from "../src/app/api/auth/password-sign-in/handler";
import { createRecoveryStartHandler } from "../src/app/api/auth/recovery-start/handler";
import { POST as retiredResolver } from "../src/app/api/auth/resolve-identifier/route";
import { applyRateLimit } from "../src/lib/rateLimit";

const migration = "supabase/sql/20260913014834_restrict_contact_resolution.sql";
const request = (body: object, route = "test", ua = "test") => new Request(`http://localhost/${route}`, {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.34", "user-agent": ua },
});

test("actual migration denies every lookup/availability RPC to both client roles and preserves backend results", async () => {
  const catalog = JSON.parse(await readFile("docs/remediation/evidence/b04a-live-catalog.json", "utf8"));
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id int primary key, email text, phone text);
      create table public.profiles(id int primary key, display_name text, email text, phone text);
      insert into auth.users values(1,'owner@example.test','+15551234567');
      insert into profiles values(1,'Test Owner','old@example.test','+15551234567');
      grant usage on schema public to anon, authenticated, service_role;`);
    for (const fn of catalog.functions) await db.exec(fn.definition);
    expect((await db.query("select get_email_for_username('test owner') as email")).rows).toEqual([{email: "owner@example.test"}]);
    await db.exec(await readFile(migration, "utf8"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const fn of catalog.functions) {
        const name = fn.signature.split("(")[0];
        await expect(db.query(`select ${name}('Test Owner')`)).rejects.toThrow(/permission denied/);
      }
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    expect((await db.query(`select get_email_for_username(' TEST OWNER ') as email,
      get_email_for_phone('+15551234567') as phone_email,
      get_phone_for_username('test owner') as phone,
      get_phone_for_email(' OWNER@EXAMPLE.TEST ') as email_phone,
      is_username_available('test owner') as taken,
      is_username_available('new name') as free,
      is_phone_available('+15551234567') as phone_taken,
      is_phone_available('+15557654321') as phone_free`)).rows).toEqual([{
        email: "owner@example.test", phone_email: "owner@example.test", phone: "+15551234567", email_phone: "+15551234567", taken: false, free: true, phone_taken: false, phone_free: true,
      }]);
  } finally { await db.close(); }
});

function fixture(known = true, deliveryError = false) {
  const credentials: unknown[] = [], deliveries: unknown[] = [];
  return { credentials, deliveries,
    resolver: { rpc: async (fn: string) => ({ data: known ? fn.startsWith("get_email") ? "owner@example.test" : "+15551234567" : null, error: null }) },
    authClient: { auth: {
      signInWithPassword: async (credential: unknown) => { credentials.push(credential); return { data: { session: null }, error: { message: "Provider private detail" } }; },
      resetPasswordForEmail: async (email: string) => { deliveries.push(email); return { error: deliveryError ? { message: "Not found" } : null }; },
      signInWithOtp: async (value: unknown) => { deliveries.push(value); return { error: deliveryError ? { message: "Not found" } : null }; },
    }, rpc: async () => { throw new Error("Public auth client must never resolve contacts"); } },
  };
}

test("wrong-password outcomes are identical for known and unknown usernames and both attempt authentication", async () => {
  for (const known of [true, false]) {
    const f = fixture(known);
    const handler = createPasswordSignInHandler({createAuthClient: () => f.authClient, createResolverClient: () => f.resolver});
    const response = await handler(request({identifier: known ? "Test Owner" : "missing", password: "wrong"}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error: "Invalid credentials."});
    expect(f.credentials).toHaveLength(1);
  }
});

test("email, phone and username credentials preserve server-side selection", async () => {
  for (const [identifier, authMode, expected] of [
    ["Test Owner", "email", {email: "owner@example.test", password: "wrong"}],
    ["owner@example.test", "email", {email: "owner@example.test", password: "wrong"}],
    ["+15551234567", "phone", {phone: "+15551234567", password: "wrong"}],
    ["Test Owner", "phone", {phone: "+15551234567", password: "wrong"}],
  ] as const) {
    const f = fixture();
    await createPasswordSignInHandler({createAuthClient: () => f.authClient, createResolverClient: () => f.resolver})(request({identifier, authMode, password: "wrong"}));
    expect(f.credentials).toEqual([expected]);
  }
});

test("recovery outcomes do not enumerate accounts or disclose resolved contacts including provider errors", async () => {
  for (const [identifier, expected] of [["Test Owner", {channel: "email"}], ["missing", {channel: "email"}], ["owner@example.test", {channel: "email"}], ["+15551234567", {channel: "phone", phone: "+15551234567"}]] as const) {
    for (const known of [true, false]) {
      const f = fixture(known, !known);
      const response = await createRecoveryStartHandler({createAuthClient: () => f.authClient, createResolverClient: () => f.resolver})(request({identifier}));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expected);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  }
});

test("retired resolver returns a constant contact-free result", async () => {
  const response = await retiredResolver();
  expect(response.status).toBe(410);
  expect(await response.text()).not.toMatch(/email|phone|exists/);
});

test("changing user agent cannot reset anonymous limits", async () => {
  const params = {routeKey: "b04-ua", windowMs: 60000, maxRequests: 1};
  expect((await applyRateLimit({...params, request: request({}, "test", "one")})).allowed).toBe(true);
  expect((await applyRateLimit({...params, request: request({}, "test", "two")})).allowed).toBe(false);
});

test("protected auth fails closed without distributed limiter; local test mode is explicit", async () => {
  const original = process.env.CELLARSNAP_RATE_LIMIT_BACKEND;
  try {
    delete process.env.CELLARSNAP_RATE_LIMIT_BACKEND;
    expect((await applyRateLimit({request: request({}), routeKey: "b04-unavailable", windowMs: 60000, maxRequests: 2, requireDistributed: true})).allowed).toBe(false);
  } finally { process.env.CELLARSNAP_RATE_LIMIT_BACKEND = original; }
});
