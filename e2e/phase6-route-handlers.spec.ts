import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { createSharePostHandler } from "../src/app/api/share/handler";
import { createUserEntriesGetHandler } from "../src/app/api/users/[id]/entries/handler";
import { createTaggedEntriesGetHandler } from "../src/app/api/users/[id]/tagged/handler";
import { createEntryDeleteHandler } from "../src/app/api/entries/[id]/deleteHandler";
import { createAccountDeleteHandler } from "../src/app/api/account/deleteHandler";
import { createEntryPutHandler } from "../src/app/api/entries/[id]/putHandler";
import { createPasswordSignInHandler } from "../src/app/api/auth/password-sign-in/handler";
import { createRecoveryStartHandler } from "../src/app/api/auth/recovery-start/handler";
import { createBulkGroupHandler } from "../src/app/api/entries/bulk-group/handler";
import { createBulkPublishHandler } from "../src/app/api/entries/bulk-publish/handler";

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
            if (
              columns === "id, user_id, rating" ||
              columns === "id, user_id, rating, entry_group_id"
            ) {
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
                        entry_group_id: null,
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
                            entry_group_id: null,
                          },
                          error: null,
                        }),
                        maybeSingle: async () => ({
                          data: {
                            id: value,
                            user_id: ownerUserId,
                            rating: existingRating,
                            entry_group_id: null,
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

function makeEntryDeleteClients({
  viewerUserId,
  ownerUserId = viewerUserId,
  photoPaths,
}: {
  viewerUserId: string;
  ownerUserId?: string;
  photoPaths: Array<string | null>;
}) {
  let removedPaths: string[] | null = null;
  let deletedEntryId: string | null = null;
  let deletedUserId: string | null = null;

  return {
    authClient: {
      from(table: string) {
        if (table !== "wine_entries") {
          throw new Error(`Unexpected table lookup: ${table}`);
        }

        return {
          select(columns: string) {
            expect(columns).toBe(
              "id, label_image_path, place_image_path, pairing_image_path, entry_group_id"
            );

            return {
              eq(column: string, value: string) {
                expect(column).toBe("id");
                expect(value).toBe("entry-1");

                return {
                  eq(innerColumn: string, innerValue: string) {
                    expect(innerColumn).toBe("user_id");
                    expect(innerValue).toBe(viewerUserId);

                    return {
                      maybeSingle: async () => ({
                        data:
                          ownerUserId === viewerUserId
                            ? {
                                id: "entry-1",
                                label_image_path: "labels/entry-1.jpg",
                                place_image_path: null,
                                pairing_image_path: "pending",
                                entry_group_id: null,
                              }
                            : null,
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
      storage: {
        from() {
          throw new Error("Unexpected storage access on auth client.");
        },
      },
    },
    adminClient: {
      from(table: string) {
        if (table === "entry_photos") {
          return {
            select(columns: string) {
              expect(columns).toBe("path");

              return {
                eq(column: string, value: string) {
                  expect(column).toBe("entry_id");
                  expect(value).toBe("entry-1");

                  return Promise.resolve({
                    data: photoPaths.map((path) => ({ path })),
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === "wine_entries") {
          return {
            delete() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe("id");
                  deletedEntryId = value;

                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      deletedUserId = innerValue;

                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table lookup: ${table}`);
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe("wine-photos");

          return {
            remove: async (paths: string[]) => {
              removedPaths = paths;
              return { data: [], error: null };
            },
          };
        },
      },
    },
    getRemovedPaths() {
      return removedPaths;
    },
    getDeletedFilter() {
      return {
        entryId: deletedEntryId,
        userId: deletedUserId,
      };
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

function makeBulkGroupSupabase(userId: string) {
  const state = {
    createdGroupPayload: null as Record<string, unknown> | null,
    updatedEntryPayload: null as Record<string, unknown> | null,
    insertedSlides: null as Record<string, unknown>[] | null,
  };

  return {
    client: {
      auth: {
        getUser: async () => ({ data: { user: makeAuthenticatedUser(userId) } }),
      },
      from(table: string) {
        if (table === "wine_entries") {
          return {
            select(columns: string) {
              expect(columns).toBe("id");
              return {
                in(column: string, values: string[]) {
                  expect(column).toBe("id");
                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(userId);
                      return Promise.resolve({
                        data: values.map((id) => ({ id })),
                        error: null,
                      });
                    },
                  };
                },
              };
            },
            update(payload: Record<string, unknown>) {
              state.updatedEntryPayload = payload;
              return {
                in(column: string, values: string[]) {
                  expect(column).toBe("id");
                  expect(values.length).toBeGreaterThan(0);
                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(userId);
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        }

        if (table === "entry_groups") {
          return {
            insert(payload: Record<string, unknown>) {
              state.createdGroupPayload = payload;
              return {
                select(columns: string) {
                  expect(columns).toBe("id, mode, title, anchor_entry_id");
                  return {
                    single: async () => ({
                      data: {
                        id: "group-1",
                        mode: payload.mode,
                        title: payload.title,
                        anchor_entry_id: payload.anchor_entry_id,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        if (table === "entry_group_slides") {
          return {
            insert(rows: Record<string, unknown>[]) {
              state.insertedSlides = rows;
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
    state,
  };
}

function makeBulkPublishSupabase(userId: string) {
  const state = {
    hiddenIds: [] as string[],
    publishedIds: [] as string[],
  };

  return {
    client: {
      auth: {
        getUser: async () => ({ data: { user: makeAuthenticatedUser(userId) } }),
      },
      from(table: string) {
        if (table === "wine_entries") {
          return {
            select(columns: string) {
              if (columns === "id, entry_group_id") {
                return {
                  in(column: string, values: string[]) {
                    expect(column).toBe("id");
                    return {
                      eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(userId);
                      return Promise.resolve({
                        data: values.map((id) => ({
                          id,
                            entry_group_id:
                              id === "33333333-3333-4333-8333-333333333333"
                                ? null
                                : "group-1",
                        })),
                        error: null,
                      });
                      },
                    };
                  },
                };
              }

              throw new Error(`Unexpected wine_entries select ${columns}`);
            },
            update(payload: Record<string, unknown>) {
              return {
                in(column: string, values: string[]) {
                  expect(column).toBe("id");
                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(userId);

                      if (payload.is_feed_visible === false) {
                        state.hiddenIds = values;
                        return Promise.resolve({ error: null });
                      }

                      return {
                        select(columns: string) {
                          expect(columns).toBe("id");
                          state.publishedIds.push(...values);
                          return Promise.resolve({
                            data: values.map((id) => ({ id })),
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === "entry_groups") {
          return {
            select(columns: string) {
              expect(columns).toBe("id, anchor_entry_id");
              return {
                in(column: string, values: string[]) {
                  expect(column).toBe("id");
                  expect(values).toEqual(["group-1"]);
                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(userId);
                      return Promise.resolve({
                        data: [
                          {
                            id: "group-1",
                            anchor_entry_id:
                              "11111111-1111-4111-8111-111111111111",
                          },
                        ],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
    state,
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
    const persistCalls: Array<Record<string, unknown>> = [];
    const handler = createEntryPutHandler({
      createSupabaseServerClient: async () => supabase.client as never,
      fetchPrimaryGrapesByEntryId: async () => new Map([["entry-1", []]]),
      persistEntryResolution: async ({ input }) => {
        persistCalls.push(input as unknown as Record<string, unknown>);
        return {
          entry: null,
          resolution: {
            canonical_region: null,
            canonical_country: null,
            canonical_sub_region: null,
            canonical_producer: "Domaine Test",
            canonical_classification: null,
            canonical_varietal: null,
            wine_type: null,
            resolution_confidence: 0,
            fallback_level: 6,
            region_alias_matched: false,
            producer_alias_matched: false,
            resolution_source: "stub" as const,
          },
        };
      },
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
    expect(persistCalls).toEqual([
      {
        region: null,
        producer: "Domaine Test",
        classification: null,
        wine_type: null,
        country: null,
        varietal: null,
      },
    ]);
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

  test("entry delete route deletes via the admin client after confirming ownership", async () => {
    const clients = makeEntryDeleteClients({
      viewerUserId: "owner-1",
      photoPaths: ["gallery/entry-1-1.jpg", "labels/entry-1.jpg", null, "pending"],
    });
    const handler = createEntryDeleteHandler({
      requireRequestAuth: async () => ({
        user: makeAuthenticatedUser("owner-1"),
        supabase: clients.authClient as never,
        authMode: "bearer",
      }),
      createSupabaseAdminClient: () => clients.adminClient as never,
    });

    const response = await handler(
      new Request("http://localhost/api/entries/entry-1", {
        method: "DELETE",
        headers: {
          authorization: "Bearer token-1",
        },
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );

    expect(response.status).toBe(200);
    expect(clients.getDeletedFilter()).toEqual({
      entryId: "entry-1",
      userId: "owner-1",
    });
    expect(clients.getRemovedPaths()).toEqual([
      "labels/entry-1.jpg",
      "gallery/entry-1-1.jpg",
    ]);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  test("bulk group route creates one grouped post for bulk-created entries", async () => {
    const supabase = makeBulkGroupSupabase("owner-1");
    const handler = createBulkGroupHandler({
      createSupabaseServerClient: async () => supabase.client as never,
    });

    const response = await handler(
      new Request("http://localhost/api/entries/bulk-group", {
        method: "POST",
        body: JSON.stringify({
          anchor_entry_id: "11111111-1111-4111-8111-111111111111",
          entry_ids: [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
          ],
          mode: "event",
          title: "Stuytown tasting",
          slides: [
            {
              entry_id: "11111111-1111-4111-8111-111111111111",
              photo_type: "label",
              path: "entries/a/label.jpg",
            },
            {
              entry_id: null,
              photo_type: "pairing",
              path: "entries/a/pairing.jpg",
            },
          ],
        }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(supabase.state.createdGroupPayload).toMatchObject({
      user_id: "owner-1",
      mode: "event",
      title: "Stuytown tasting",
    });
    expect(supabase.state.updatedEntryPayload).toEqual({
      entry_group_id: "group-1",
      is_feed_visible: false,
    });
    expect(supabase.state.insertedSlides).toHaveLength(2);
    await expect(response.json()).resolves.toEqual({
      group: {
        id: "group-1",
        mode: "event",
        title: "Stuytown tasting",
        anchor_entry_id: "11111111-1111-4111-8111-111111111111",
      },
    });
  });

  test("bulk publish route only publishes the anchor for grouped entries", async () => {
    const supabase = makeBulkPublishSupabase("owner-1");
    const handler = createBulkPublishHandler({
      createSupabaseServerClient: async () => supabase.client as never,
    });

    const response = await handler(
      new Request("http://localhost/api/entries/bulk-publish", {
        method: "POST",
        body: JSON.stringify({
          entry_ids: [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
          ],
        }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(supabase.state.hiddenIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(supabase.state.publishedIds).toEqual(
      expect.arrayContaining([
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
      ])
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      updated_ids: expect.arrayContaining([
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
      ]),
    });
  });
});
