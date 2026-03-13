import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import {
  toComparisonSubmissionPayload,
  toSurveySubmissionPayload,
} from "../packages/shared/src/entry-flow";
import { createComparisonPostHandler } from "../src/app/api/entries/[id]/comparison/route";
import { RequestAuthError } from "../src/server/auth/requestAuth";

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

function makeComparisonSupabase(userId: string) {
  const state = {
    surveyUpdatePayload: null as Record<string, unknown> | null,
    comparisonInsertPayload: null as Record<string, unknown> | null,
  };

  return {
    client: {
      from(table: string) {
        if (table === "wine_entries") {
          return {
            select(columns: string) {
              expect(columns).toBe("id, user_id");
              return {
                eq(column: string, value: string) {
                  expect(column).toBe("id");
                  return {
                    single: async () => ({
                      data: {
                        id: value,
                        user_id: userId,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(payload: Record<string, unknown>) {
              state.surveyUpdatePayload = payload;

              return {
                eq(column: string, value: string) {
                  expect(column).toBe("id");
                  expect(typeof value).toBe("string");
                  return {
                    eq(innerColumn: string, innerValue: string) {
                      expect(innerColumn).toBe("user_id");
                      expect(innerValue).toBe(userId);
                      return {
                        select(columns: string) {
                          expect(columns).toBe(
                            "id, survey_how_was_it, survey_expectation_match, survey_drink_again"
                          );
                          return {
                            single: async () => ({
                              data: {
                                id: value,
                                survey_how_was_it: payload.survey_how_was_it,
                                survey_expectation_match:
                                  payload.survey_expectation_match ?? null,
                                survey_drink_again: payload.survey_drink_again,
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
        }

        if (table === "entry_comparison_feedback") {
          return {
            insert(payload: Record<string, unknown>) {
              state.comparisonInsertPayload = payload;
              return {
                select(columns: string) {
                  expect(columns).toBe(
                    "id, new_entry_id, comparison_entry_id, response, created_at"
                  );
                  return {
                    single: async () => ({
                      data: {
                        id: "feedback-1",
                        new_entry_id: payload.new_entry_id,
                        comparison_entry_id: payload.comparison_entry_id,
                        response: payload.response,
                        created_at: "2026-03-13T16:00:00.000Z",
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table lookup: ${table}`);
      },
    },
    state,
  };
}

test.describe("Bulk post-save survey contract", () => {
  test("shared survey payload helpers omit expectations when bulk flow skips that question", () => {
    expect(
      toSurveySubmissionPayload({
        how_was_it: "good",
        drink_again: "yes",
      })
    ).toEqual({
      how_was_it: "good",
      drink_again: "yes",
    });

    expect(
      toComparisonSubmissionPayload({
        answers: {
          how_was_it: "good",
          drink_again: "yes",
        },
        comparisonEntryId: "22222222-2222-4222-8222-222222222222",
        response: "more",
      })
    ).toEqual({
      how_was_it: "good",
      drink_again: "yes",
      comparison_entry_id: "22222222-2222-4222-8222-222222222222",
      response: "more",
    });
  });

  test("comparison route accepts bulk survey submissions without expectations", async () => {
    const supabase = makeComparisonSupabase("owner-1");
    const handler = createComparisonPostHandler({
      requireRequestAuth: async () => ({
        supabase: supabase.client as never,
        user: makeAuthenticatedUser("owner-1"),
        authMode: "cookie",
      }),
    });

    const response = await handler(
      new Request("http://localhost/api/entries/11111111-1111-4111-8111-111111111111/comparison", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          how_was_it: "good",
          drink_again: "yes",
          comparison_entry_id: "22222222-2222-4222-8222-222222222222",
          response: "more",
        }),
      }),
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(supabase.state.surveyUpdatePayload).toEqual({
      survey_how_was_it: "good",
      survey_expectation_match: null,
      survey_drink_again: "yes",
    });
    expect(supabase.state.comparisonInsertPayload).toEqual({
      user_id: "owner-1",
      new_entry_id: "11111111-1111-4111-8111-111111111111",
      comparison_entry_id: "22222222-2222-4222-8222-222222222222",
      response: "more",
    });
    await expect(response.json()).resolves.toEqual({
      survey: {
        id: "11111111-1111-4111-8111-111111111111",
        survey_how_was_it: "good",
        survey_expectation_match: null,
        survey_drink_again: "yes",
      },
      feedback: {
        id: "feedback-1",
        new_entry_id: "11111111-1111-4111-8111-111111111111",
        comparison_entry_id: "22222222-2222-4222-8222-222222222222",
        response: "more",
        created_at: "2026-03-13T16:00:00.000Z",
      },
    });
  });

  test("comparison route still rejects unauthenticated bulk survey submissions", async () => {
    const handler = createComparisonPostHandler({
      requireRequestAuth: async () => {
        throw new RequestAuthError("Unauthorized");
      },
    });

    const response = await handler(
      new Request("http://localhost/api/entries/11111111-1111-4111-8111-111111111111/comparison", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          how_was_it: "good",
          drink_again: "yes",
        }),
      }),
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
