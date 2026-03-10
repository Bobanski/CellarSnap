import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { createSharePostHandler } from "../src/app/api/share/route";
import { createUserEntriesGetHandler } from "../src/app/api/users/[id]/entries/route";
import { createTaggedEntriesGetHandler } from "../src/app/api/users/[id]/tagged/route";
import { createEntryPutHandler } from "../src/app/api/entries/[id]/route";
import { createAccountDeleteHandler } from "../src/app/api/account/route";
import { createPasswordSignInHandler } from "../src/app/api/auth/password-sign-in/route";
import { createRecoveryStartHandler } from "../src/app/api/auth/recovery-start/route";

function makeAuthenticatedUser(id: string) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
  } as unknown as User;
}

function makeAuthOnlySupabase(userId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: makeAuthenticatedUser(userId) } }),
    },
    from() {
      throw new Error("Unexpected database query.");
    },
  };
}

function makeShareSupabase({
  viewerUserId,
  ownerUserId,
}: {
  viewerUserId: string;
  ownerUserId: string;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: makeAuthenticatedUser(viewerUserId) } }),
    },
    from(table: string) {
      if (table !== "wine_entries") {
        throw new Error(`Unexpected table lookup: ${table}`);
      }

      return {
        select(columns: string) {
          expect(columns).toBe("id, user_id");

          return {
            eq(column: string, value: string) {
              expect(column).toBe("id");
              return {
                maybeSingle: async () => ({
                  data: {
                    id: value,
                    user_id: ownerUserId,
                  },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

function makeEntryPutSupabase({
  viewerUserId,
  ownerUserId = viewerUserId,
  existingRating,
}: {
  viewerUserId: string;
  ownerUserId?: string;
  existingRating: number | null;
}) {
  let lastUpdatePayload: Record<string, unknown> | null = null;

  return {
    client: {
      auth: {
        getUser: async () => ({ data: { user: makeAuthenticatedUser(viewerUserId) } }),
      },
      from(table: string) {
        if (table !== "wine_entries") {
          throw new Error(`Unexpected table lookup: ${table}`);
        }

        return {
          select(columns: string) {
            if (columns === "id, user_id, rating") {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe("id");
                  expect(value).toBe("entry-1");
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: value,
                        user_id: ownerUserId,
                        rating: existingRating,
                      },
                      error: null,
                    }),
                  };
                },
              };
            }

            if (columns === "*") {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe("id");
                  expect(value).toBe("entry-1");

                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(viewerUserId);

                      return {
                        single: async () => ({
                          data: {
                            id: value,
                            user_id: ownerUserId,
                            rating: existingRating,
                          },
                          error: null,
                        }),
                        maybeSingle: async () => ({
                          data: {
                            id: value,
                            user_id: ownerUserId,
                            rating: existingRating,
                          },
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            }

            throw new Error(`Unexpected select columns: ${columns}`);
          },
          update(payload: Record<string, unknown>) {
            lastUpdatePayload = payload;

            return {
              eq(column: string, value: string) {
                expect(column).toBe("id");
                expect(value).toBe("entry-1");

                return {
                  eq(innerColumn: string, innerValue: string) {
                    expect(innerColumn).toBe("user_id");
                    expect(innerValue).toBe(viewerUserId);

                    return {
                      select(columns: string) {
                        expect(columns).toBe("*");
                        return {
                          maybeSingle: async () => ({
                            data: {
                              id: value,
                              user_id: ownerUserId,
                              rating:
                                typeof payload.rating === "number"
                                  ? payload.rating
                                  : existingRating,
                              ...payload,
                            },
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
    getLastUpdatePayload() {
      return lastUpdatePayload;
    },
  };
}

function makePasswordSignInClient() {
  let lastCredential:
    | { email: string; password: string }
    | { phone: string; password: string }
    | null = null;

  return {
    client: {
      rpc(fn: string, args?: Record<string, unknown>) {
        if (fn === "get_phone_for_username") {
          return Promise.resolve({
            data: args?.username === "user-name" ? "+15551234567" : null,
            error: null,
          });
        }
        if (fn === "get_email_for_username") {
          return Promise.resolve({
            data: args?.username === "user-name" ? "user@example.com" : null,
            error: null,
          });
        }
        throw new Error(`Unexpected rpc ${fn}`);
      },
      auth: {
        signInWithPassword(credentials: { email?: string; phone?: string; password: string }) {
          lastCredential = "phone" in credentials && credentials.phone
            ? { phone: credentials.phone, password: credentials.password }
            : { email: credentials.email!, password: credentials.password };

          return Promise.resolve({
            data: {
              session: {
                access_token: "access-token",
                refresh_token: "refresh-token",
              },
            },
            error: null,
          });
        },
      },
    },
    getLastCredential() {
      return lastCredential;
    },
  };
}

function makeRecoveryStartClient() {
  let lastResetEmail: string | null = null;
  let lastOtpPhone: string | null = null;

  return {
    client: {
      rpc(fn: string, args?: Record<string, unknown>) {
        if (fn === "get_phone_for_username") {
          return Promise.resolve({ data: null, error: null });
        }
        if (fn === "get_email_for_username") {
          return Promise.resolve({
            data: args?.username === "user-name" ? "user@example.com" : null,
            error: null,
          });
        }
        throw new Error(`Unexpected rpc ${fn}`);
      },
      auth: {
        signInWithOtp({ phone }: { phone: string }) {
          lastOtpPhone = phone;
          return Promise.resolve({ error: null });
        },
        resetPasswordForEmail(email: string) {
          lastResetEmail = email;
          return Promise.resolve({ error: null });
        },
      },
    },
    getLastResetEmail() {
      return lastResetEmail;
    },
    getLastOtpPhone() {
      return lastOtpPhone;
    },
  };
}

test.describe("Phase 6 route handler regressions", () => {
  test("password sign-in route resolves username server-side and returns a session", async () => {
    const authClient = makePasswordSignInClient();
    const handler = createPasswordSignInHandler({
      createAuthClient: () => authClient.client as never,
    });

    const response = await handler(
      new Request("http://localhost/api/auth/password-sign-in", {
        method: "POST",
        body: JSON.stringify({
          identifier: "user-name",
          password: "hunter2",
          authMode: "phone",
        }),
        headers: {
          "content-type": "application/json",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(authClient.getLastCredential()).toEqual({
      phone: "+15551234567",
      password: "hunter2",
    });
    await expect(response.json()).resolves.toEqual({
      session: {
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    });
  });

  test("recovery start route resolves username to email without returning the address", async () => {
    const recoveryClient = makeRecoveryStartClient();
    const handler = createRecoveryStartHandler({
      createAuthClient: () => recoveryClient.client as never,
    });

    const response = await handler(
      new Request("http://localhost/api/auth/recovery-start", {
        method: "POST",
        body: JSON.stringify({
          identifier: "user-name",
          redirectTo: "cellarsnap://auth/callback",
        }),
        headers: {
          "content-type": "application/json",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(recoveryClient.getLastResetEmail()).toBe("user@example.com");
    await expect(response.json()).resolves.toEqual({
      channel: "email",
    });
  });

  test("account deletion route deletes the authenticated account", async () => {
    const handler = createAccountDeleteHandler({
      requireRequestAuth: async () => ({
        user: makeAuthenticatedUser("user-1"),
        supabase: null as never,
        authMode: "bearer",
      }),
      createSupabaseAdminClient: () => ({}) as never,
      deleteUserAccount: async (_supabaseAdmin, userId) => ({
        deleted: true,
        mediaCleanupPending: false,
        removedStorageObjectCount: userId === "user-1" ? 2 : 0,
      }),
    });

    const response = await handler(
      new Request("http://localhost/api/account", {
        method: "DELETE",
        headers: {
          authorization: "Bearer token-1",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      mediaCleanupPending: false,
      removedStorageObjectCount: 2,
    });
  });

  test("share route rejects non-owners trying to create a share link", async () => {
    const handler = createSharePostHandler({
      createSupabaseServerClient: async () =>
        makeShareSupabase({
          viewerUserId: "viewer-1",
          ownerUserId: "owner-1",
        }) as never,
    });

    const response = await handler(
      new Request("http://localhost/api/share", {
        method: "POST",
        body: JSON.stringify({
          postId: "11111111-1111-4111-8111-111111111111",
        }),
        headers: {
          "content-type": "application/json",
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  test("profile entries route returns an empty list when the target user is blocked", async () => {
    const handler = createUserEntriesGetHandler({
      createSupabaseServerClient: async () =>
        makeAuthOnlySupabase("viewer-1") as never,
      resolveProfileEntryAccess: async () => ({
        blocked: true,
        isOwnProfile: false,
        allowedPrivacies: [],
      }),
    });

    const response = await handler(new Request("http://localhost/api/users/owner-1/entries"), {
      params: Promise.resolve({ id: "owner-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entries: [] });
  });

  test("tagged entries route returns an empty list when the target user is blocked", async () => {
    const handler = createTaggedEntriesGetHandler({
      createSupabaseServerClient: async () =>
        makeAuthOnlySupabase("viewer-1") as never,
      resolveProfileEntryAccess: async () => ({
        blocked: true,
        isOwnProfile: false,
        allowedPrivacies: [],
      }),
    });

    const response = await handler(new Request("http://localhost/api/users/owner-1/tagged"), {
      params: Promise.resolve({ id: "owner-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entries: [] });
  });

  test("entry update route allows partial saves when the stored entry already has a rating", async () => {
    const supabase = makeEntryPutSupabase({
      viewerUserId: "owner-1",
      existingRating: 92,
    });
    const handler = createEntryPutHandler({
      createSupabaseServerClient: async () => supabase.client as never,
      fetchPrimaryGrapesByEntryId: async () => new Map([["entry-1", []]]),
    });

    const response = await handler(
      new Request("http://localhost/api/entries/entry-1", {
        method: "PUT",
        body: JSON.stringify({
          producer: "Domaine Test",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );

    expect(response.status).toBe(200);
    expect(supabase.getLastUpdatePayload()).toEqual({
      producer: "Domaine Test",
    });
    await expect(response.json()).resolves.toMatchObject({
      entry: {
        id: "entry-1",
        user_id: "owner-1",
        rating: 92,
        producer: "Domaine Test",
        primary_grapes: [],
      },
    });
  });

  test("entry update route still rejects saves that would leave an entry without a rating", async () => {
    const supabase = makeEntryPutSupabase({
      viewerUserId: "owner-1",
      existingRating: null,
    });
    const handler = createEntryPutHandler({
      createSupabaseServerClient: async () => supabase.client as never,
      fetchPrimaryGrapesByEntryId: async () => new Map([["entry-1", []]]),
    });

    const response = await handler(
      new Request("http://localhost/api/entries/entry-1", {
        method: "PUT",
        body: JSON.stringify({
          producer: "Domaine Test",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );

    expect(response.status).toBe(400);
    expect(supabase.getLastUpdatePayload()).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        formErrors: [],
        fieldErrors: {
          rating: ["Rating required."],
        },
      },
    });
  });
});
