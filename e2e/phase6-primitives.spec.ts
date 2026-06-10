import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import {
  executeSelectWithFallback,
  executeWithColumnFallback,
} from "../src/server/db/compat";
import {
  RequestAuthError,
  requireRequestAuth,
} from "../src/server/auth/requestAuth";
import { signPhotoUrl, signPhotoUrls } from "../src/server/storage/signedUrls";
import { getAuthMode as getSharedAuthMode } from "../packages/shared/src/auth";
import { toLocalYmd as toSharedLocalYmd } from "../packages/shared/src/date";
import {
  hasDominantSingleBottleFrame,
  normalizePhone as normalizeSharedPhone,
  resolveSinglePhotoEntryMode,
  isUsernameFormatValid as isSharedUsernameFormatValid,
  PRICE_PAID_CURRENCY_LABELS as sharedCurrencyLabels,
  PRICE_PAID_CURRENCY_VALUES as sharedCurrencyValues,
  PRICE_PAID_SOURCE_LABELS as sharedSourceLabels,
  PRICE_PAID_SOURCE_VALUES as sharedSourceValues,
  QPR_LEVEL_LABELS as sharedQprLabels,
  QPR_LEVEL_VALUES as sharedQprValues,
} from "../packages/shared/src";
import { getAuthMode as getWebAuthMode } from "../src/lib/auth/mode";
import {
  getTodayLocalYmd as getWebTodayLocalYmd,
  toLocalYmd as toWebLocalYmd,
} from "../src/lib/dateYmd";
import {
  PRICE_PAID_CURRENCY_LABELS as webCurrencyLabels,
  PRICE_PAID_CURRENCY_VALUES as webCurrencyValues,
  PRICE_PAID_SOURCE_LABELS as webSourceLabels,
  PRICE_PAID_SOURCE_VALUES as webSourceValues,
  QPR_LEVEL_LABELS as webQprLabels,
  QPR_LEVEL_VALUES as webQprValues,
} from "../src/lib/entryMeta";
import {
  normalizePhone as normalizeWebPhone,
} from "../src/lib/validation/phone";
import {
  isUsernameFormatValid as isWebUsernameFormatValid,
} from "../src/lib/validation/username";
import { canManageEntryShare } from "../src/server/shares/access";
import {
  createEntrySchema,
  updateEntrySchema,
} from "../src/server/entries/schema";
import { resolvePersistedEntryRating } from "../src/server/entries/updateValidation";
import {
  resolveSharedTastingCopyTastedWithUserIds,
  shouldSuppressSharedCopyTagNotification,
} from "../src/server/entries/sharedTastings";
import { resolveAllowedProfileEntryPrivacies } from "../src/server/users/profileVisibility";
import { deleteUserAccount } from "../src/server/account/deleteAccount";

function makeUser(id: string): User {
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

function makeAuthClient(user: User | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
  };
}

test.describe("Phase 6 utility unification", () => {
  test("web wrappers match shared auth/date/validation behavior", () => {
    const originalAuthMode = process.env.NEXT_PUBLIC_AUTH_MODE;
    process.env.NEXT_PUBLIC_AUTH_MODE = "phone";
    expect(getWebAuthMode()).toBe(getSharedAuthMode("phone"));

    process.env.NEXT_PUBLIC_AUTH_MODE = "invalid";
    expect(getWebAuthMode()).toBe(getSharedAuthMode("invalid"));

    if (originalAuthMode === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_MODE;
    } else {
      process.env.NEXT_PUBLIC_AUTH_MODE = originalAuthMode;
    }

    const sampleDate = new Date("2024-05-06T12:00:00.000Z");
    expect(toWebLocalYmd(sampleDate)).toBe(toSharedLocalYmd(sampleDate));
    expect(getWebTodayLocalYmd(sampleDate)).toBe("2024-05-06");

    expect(normalizeWebPhone("(303) 555-1212")).toBe(
      normalizeSharedPhone("(303) 555-1212")
    );
    expect(isWebUsernameFormatValid("valid_username")).toBe(
      isSharedUsernameFormatValid("valid_username")
    );
    expect(isWebUsernameFormatValid("bad @ name")).toBe(
      isSharedUsernameFormatValid("bad @ name")
    );
    expect(webCurrencyValues).toEqual(sharedCurrencyValues);
    expect(webSourceValues).toEqual(sharedSourceValues);
    expect(webQprValues).toEqual(sharedQprValues);
    expect(webCurrencyLabels).toEqual(sharedCurrencyLabels);
    expect(webSourceLabels).toEqual(sharedSourceLabels);
    expect(webQprLabels).toEqual(sharedQprLabels);
  });
});

test.describe("Phase 6 entry/share access helpers", () => {
  test("profile visibility helper resolves public, social, and blocked access", () => {
    expect(
      resolveAllowedProfileEntryPrivacies({
        isOwnProfile: true,
        isTestViewer: false,
        isBlocked: false,
        isFriend: false,
        isFriendOfFriend: false,
      })
    ).toEqual(["public", "friends_of_friends", "friends", "private"]);

    expect(
      resolveAllowedProfileEntryPrivacies({
        isOwnProfile: false,
        isTestViewer: false,
        isBlocked: true,
        isFriend: true,
        isFriendOfFriend: true,
      })
    ).toEqual([]);

    expect(
      resolveAllowedProfileEntryPrivacies({
        isOwnProfile: false,
        isTestViewer: false,
        isBlocked: false,
        isFriend: true,
        isFriendOfFriend: false,
      })
    ).toEqual(["public", "friends_of_friends", "friends"]);

    expect(
      resolveAllowedProfileEntryPrivacies({
        isOwnProfile: false,
        isTestViewer: false,
        isBlocked: false,
        isFriend: false,
        isFriendOfFriend: true,
      })
    ).toEqual(["public", "friends_of_friends"]);

    expect(
      resolveAllowedProfileEntryPrivacies({
        isOwnProfile: false,
        isTestViewer: false,
        isBlocked: false,
        isFriend: false,
        isFriendOfFriend: false,
      })
    ).toEqual(["public"]);
  });

  test("share access helper restricts management to public entries", () => {
    expect(canManageEntryShare("public")).toBeTruthy();
    expect(canManageEntryShare("friends")).toBeFalsy();
  });

  test("entry schemas keep price triplet rules aligned", () => {
    expect(
      createEntrySchema.safeParse({
        wine_name: "Clos Rougeard",
        price_paid: 42,
      }).success
    ).toBeFalsy();

    expect(
      createEntrySchema.safeParse({
        wine_name: "Clos Rougeard",
        price_paid: 42,
        price_paid_currency: "usd",
        price_paid_source: "retail",
      }).success
    ).toBeTruthy();

    expect(
      updateEntrySchema.safeParse({
        price_paid_currency: "usd",
      }).success
    ).toBeFalsy();

    expect(
      updateEntrySchema.safeParse({
        price_paid: null,
        price_paid_currency: null,
        price_paid_source: null,
      }).success
    ).toBeTruthy();

    expect(
      updateEntrySchema.safeParse({
        price_paid: 42,
        price_paid_currency: "usd",
        price_paid_source: "retail",
      }).success
    ).toBeTruthy();
  });

  test("update rating resolution preserves existing ratings for partial saves", () => {
    expect(
      resolvePersistedEntryRating({
        existingRating: 92,
        nextRating: undefined,
      })
    ).toBe(92);

    expect(
      resolvePersistedEntryRating({
        existingRating: 92,
        nextRating: 95,
      })
    ).toBe(95);

    expect(
      resolvePersistedEntryRating({
        existingRating: null,
        nextRating: undefined,
      })
    ).toBeNull();
  });

  test("single-photo quick count stays advisory when only one bottle is identified", () => {
    expect(
      resolveSinglePhotoEntryMode({
        identifiedBottleCount: 1,
        detectedBottleCount: 1,
        guardrailBottleCount: 2,
        hasStrongSingleBottleEvidence: true,
      })
    ).toEqual({
      effectiveBottleCount: 2,
      guardrailSuggestsAdditionalBottles: false,
      likelyLineup: false,
    });

    expect(
      resolveSinglePhotoEntryMode({
        identifiedBottleCount: 1,
        detectedBottleCount: 1,
        guardrailBottleCount: 2,
        hasStrongSingleBottleEvidence: false,
      })
    ).toEqual({
      effectiveBottleCount: 2,
      guardrailSuggestsAdditionalBottles: true,
      likelyLineup: false,
    });

    expect(
      resolveSinglePhotoEntryMode({
        identifiedBottleCount: 1,
        detectedBottleCount: 2,
        guardrailBottleCount: 2,
        hasStrongSingleBottleEvidence: false,
      })
    ).toEqual({
      effectiveBottleCount: 2,
      guardrailSuggestsAdditionalBottles: false,
      likelyLineup: true,
    });

    expect(
      hasDominantSingleBottleFrame({
        width: 0.38,
        height: 0.52,
      })
    ).toBeTruthy();

    expect(
      hasDominantSingleBottleFrame({
        width: 0.22,
        height: 0.52,
      })
    ).toBeFalsy();
  });

  test("shared tasting copies keep the canonical group without re-alerting them", () => {
    expect(
      resolveSharedTastingCopyTastedWithUserIds({
        viewerUserId: "user-bob",
        rootAuthorId: "user-alice",
        rootTaggedUserIds: ["user-bob", "user-carol", "user-alice", "user-carol"],
      })
    ).toEqual(["user-alice", "user-carol"]);

    expect(
      shouldSuppressSharedCopyTagNotification({
        tagUserId: "user-alice",
        rootAuthorId: "user-alice",
        rootTaggedUserIds: ["user-bob", "user-carol"],
      })
    ).toBeTruthy();

    expect(
      shouldSuppressSharedCopyTagNotification({
        tagUserId: "user-carol",
        rootAuthorId: "user-alice",
        rootTaggedUserIds: ["user-bob", "user-carol"],
      })
    ).toBeTruthy();

    expect(
      shouldSuppressSharedCopyTagNotification({
        tagUserId: "user-dave",
        rootAuthorId: "user-alice",
        rootTaggedUserIds: ["user-bob", "user-carol"],
      })
    ).toBeFalsy();
  });

  test("account deletion hard-deletes the auth user and removes owned storage", async () => {
    const removedPathBatches: string[][] = [];
    const deletedUserIds: string[] = [];

    const result = await deleteUserAccount(
      {
        auth: {
          admin: {
            deleteUser: async (userId: string) => {
              deletedUserIds.push(userId);
              return { data: { user: null }, error: null };
            },
          },
        },
        storage: {
          from(bucket: string) {
            expect(bucket).toBe("wine-photos");

            return {
              listV2: async ({ cursor }: { cursor?: string }) => {
                if (!cursor) {
                  return {
                    data: {
                      hasNext: true,
                      nextCursor: "page-2",
                      folders: [],
                      objects: [
                        { key: "user-1/avatar.jpg" },
                        { key: "user-1/entry-1/label/photo-1.jpg" },
                      ],
                    },
                    error: null,
                  };
                }

                return {
                  data: {
                    hasNext: false,
                    nextCursor: undefined,
                    folders: [],
                    objects: [{ key: "user-1/entry-1/place/photo-2.jpg" }],
                  },
                  error: null,
                };
              },
              remove: async (paths: string[]) => {
                removedPathBatches.push(paths);
                return { data: null, error: null };
              },
            };
          },
        },
      } as never,
      "user-1"
    );

    expect(deletedUserIds).toEqual(["user-1"]);
    expect(removedPathBatches).toEqual([
      [
        "user-1/avatar.jpg",
        "user-1/entry-1/label/photo-1.jpg",
        "user-1/entry-1/place/photo-2.jpg",
      ],
    ]);
    expect(result).toEqual({
      deleted: true,
      mediaCleanupPending: false,
      removedStorageObjectCount: 3,
    });
  });
});

test.describe("Phase 6 server primitive unit coverage", () => {
  test("request auth prefers bearer token when available", async () => {
    const bearerUser = makeUser("bearer-user");
    let cookieCalls = 0;

    const result = await requireRequestAuth(
      new Request("http://localhost/test", {
        headers: { authorization: "Bearer token-1" },
      }),
      undefined,
      {
        getEnv: () => ({
          supabaseUrl: "https://supabase.example",
          supabaseAnonKey: "anon-key",
        }),
        createBearerClient: () => makeAuthClient(bearerUser),
        createCookieClient: async () => {
          cookieCalls += 1;
          return makeAuthClient(makeUser("cookie-user")) as never;
        },
      }
    );

    expect(result.authMode).toBe("bearer");
    expect(result.user.id).toBe("bearer-user");
    expect(cookieCalls).toBe(0);
  });

  test("request auth falls back to cookie auth when bearer is unresolved", async () => {
    const cookieUser = makeUser("cookie-user");
    let bearerCalls = 0;

    const result = await requireRequestAuth(
      new Request("http://localhost/test", {
        headers: { authorization: "Bearer token-2" },
      }),
      undefined,
      {
        getEnv: () => ({
          supabaseUrl: "https://supabase.example",
          supabaseAnonKey: "anon-key",
        }),
        createBearerClient: () => {
          bearerCalls += 1;
          return makeAuthClient(null);
        },
        createCookieClient: async () => makeAuthClient(cookieUser) as never,
      }
    );

    expect(bearerCalls).toBe(1);
    expect(result.authMode).toBe("cookie");
    expect(result.user.id).toBe("cookie-user");
  });

  test("request auth enforces configured auth mode flags", async () => {
    let bearerCalls = 0;

    const cookieOnlyResult = await requireRequestAuth(
      new Request("http://localhost/test", {
        headers: { authorization: "Bearer token-3" },
      }),
      { allowBearer: false, allowCookieFallback: true },
      {
        getEnv: () => ({
          supabaseUrl: "https://supabase.example",
          supabaseAnonKey: "anon-key",
        }),
        createBearerClient: () => {
          bearerCalls += 1;
          return makeAuthClient(makeUser("bearer-user"));
        },
        createCookieClient: async () => makeAuthClient(makeUser("cookie-user")) as never,
      }
    );

    expect(cookieOnlyResult.authMode).toBe("cookie");
    expect(cookieOnlyResult.user.id).toBe("cookie-user");
    expect(bearerCalls).toBe(0);

    await expect(
      requireRequestAuth(
        new Request("http://localhost/test", {
          headers: { authorization: "Bearer token-4" },
        }),
        { allowBearer: false, allowCookieFallback: false },
        {
          getEnv: () => ({
            supabaseUrl: "https://supabase.example",
            supabaseAnonKey: "anon-key",
          }),
          createBearerClient: () => makeAuthClient(makeUser("bearer-user")),
          createCookieClient: async () => makeAuthClient(makeUser("cookie-user")) as never,
        }
      )
    ).rejects.toBeInstanceOf(RequestAuthError);
  });

  test("signed URL helpers normalize pending paths and dedupe requests", async () => {
    const calls: Array<{ bucket: string; path: string; ttl: number }> = [];
    const supabase = {
      storage: {
        from(bucket: string) {
          return {
            createSignedUrl: async (path: string, ttl: number) => {
              calls.push({ bucket, path, ttl });
              if (path === "broken.jpg") {
                return { data: null, error: { message: "broken" } };
              }
              return {
                data: { signedUrl: `https://cdn.example/${path}?ttl=${ttl}` },
                error: null,
              };
            },
          };
        },
      },
    } as never;

    expect(await signPhotoUrl(null, supabase)).toBeNull();
    expect(await signPhotoUrl("pending", supabase)).toBeNull();
    expect(await signPhotoUrl("pending", supabase, { treatPendingAsNull: false })).toBe(
      "https://cdn.example/pending?ttl=3600"
    );
    expect(await signPhotoUrl("broken.jpg", supabase)).toBeNull();

    const signed = await signPhotoUrls(
      ["a.jpg", "a.jpg", "pending", null, undefined, "b.jpg"],
      supabase
    );

    expect(signed.get("a.jpg")).toBe("https://cdn.example/a.jpg?ttl=3600");
    expect(signed.get("b.jpg")).toBe("https://cdn.example/b.jpg?ttl=3600");
    expect(signed.has("pending")).toBeFalsy();

    const aCalls = calls.filter((call) => call.path === "a.jpg");
    expect(aCalls.length).toBe(1);
  });

  test("column fallback helpers remove unsupported fields and retry predictably", async () => {
    const attemptedPayloads: Array<Record<string, unknown>> = [];

    const result = await executeWithColumnFallback({
      initialPayload: { wine_name: "Example", comments_scope: "viewers", bio: "hello" },
      removableColumns: ["comments_scope", "bio"],
      maxAttempts: 4,
      attempt: async (payload) => {
        attemptedPayloads.push({ ...payload });
        if ("comments_scope" in payload) {
          return {
            data: null,
            error: {
              code: "42703",
              message: 'column "comments_scope" does not exist',
            },
          };
        }
        if ("bio" in payload) {
          return {
            data: null,
            error: {
              code: "42703",
              message: 'column "bio" does not exist',
            },
          };
        }
        return {
          data: { ok: true },
          error: null,
        };
      },
    });

    expect(attemptedPayloads).toEqual([
      { wine_name: "Example", comments_scope: "viewers", bio: "hello" },
      { wine_name: "Example", bio: "hello" },
      { wine_name: "Example" },
    ]);
    expect(result.error).toBeNull();
    expect(result.removedColumns).toEqual(["comments_scope", "bio"]);
    expect(result.payload).toEqual({ wine_name: "Example" });
  });

  test("select fallback helper continues on missing-column errors only", async () => {
    const attempted: string[] = [];
    const successful = await executeSelectWithFallback({
      attempts: [
        { key: "strict", missingColumns: ["root_entry_id"] as const },
        { key: "compat", missingColumns: [] as const },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      attempt: async (attempt) => {
        attempted.push(attempt.key);
        if (attempt.key === "strict") {
          return {
            data: null,
            error: {
              code: "42703",
              message: 'column "root_entry_id" does not exist',
            },
          };
        }
        return {
          data: [{ id: "row-1" }],
          error: null,
        };
      },
    });

    expect(attempted).toEqual(["strict", "compat"]);
    expect(successful.error).toBeNull();
    expect(successful.usedAttempt?.key).toBe("compat");

    const failedAttempts: string[] = [];
    const failed = await executeSelectWithFallback({
      attempts: [{ key: "strict", missingColumns: ["root_entry_id"] as const }],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      attempt: async (attempt) => {
        failedAttempts.push(attempt.key);
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "unexpected parse failure",
          },
        };
      },
    });

    expect(failedAttempts).toEqual(["strict"]);
    expect(failed.error?.code).toBe("PGRST116");
    expect(failed.usedAttempt).toBeNull();
  });
});
