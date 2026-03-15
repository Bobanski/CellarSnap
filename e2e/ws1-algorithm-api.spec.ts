import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { createAlgorithmScoreHandler } from "../src/app/api/algorithm/score/handler";
import type { EffectiveWineProfile } from "../src/server/algorithm/types";
import { RequestAuthError } from "../src/server/auth/requestAuth";

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

function makeProfile(): EffectiveWineProfile {
  return {
    sensory: {
      body: 4,
      acidity: 3,
      tannin: 4,
      alcohol_perception: 3,
      fruit_ripeness: 3,
      oak_presence: 2,
      earthy: 3,
      mineral: 2,
      savory: 3,
      aromatic_intensity: 3,
      sweetness_perception: 1,
      bitterness_phenolic_grip: 2,
      finish_length: 4,
      concentration: 4,
      freshness: 3,
    },
    balance: {
      body_acid: 4,
      sweet_acid: 4,
      tannin_fruit: 4,
      alcohol_body: 4,
      oak_fruit: 4,
      overall: 4,
    },
    metadata: {
      base_profile_id: 1,
      fallback_level: 1,
      modifiers_applied: ["vintage:2019"],
      aroma_clusters: {
        primary: ["black fruit"],
        secondary: [],
        tertiary: [],
      },
      texture: "structured",
      style_families: ["classic"],
    },
  };
}

test.describe("WS1 algorithm score API", () => {
  test("POST with direct fields returns a score payload", async () => {
    const handler = createAlgorithmScoreHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      assembleProfile: async () => makeProfile(),
      loadUserPreferenceEntries: async () => [
        {
          rating: 95,
          wine_type: "red",
          advanced_notes: {
            body: "full",
            acidity: "medium",
            tannin: "high",
            alcohol: "medium",
            sweetness: "dry",
          },
        },
      ],
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score", {
        method: "POST",
        body: JSON.stringify({
          wine_type: "red",
          canonical_region: "Bordeaux",
          canonical_country: "France",
          vintage: 2019,
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.score).toBeGreaterThan(0);
    expect(payload.band).toBeDefined();
    expect(payload.modifiers_applied).toEqual(["vintage:2019"]);
  });

  test("POST with entry_id loads the entry before scoring", async () => {
    let loadedEntryId: string | null = null;

    const handler = createAlgorithmScoreHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      loadEntryForScoring: async (_supabase, _userId, entryId) => {
        loadedEntryId = entryId;
        return {
          wine_type: "red",
          canonical_region: "Bordeaux",
          canonical_sub_region: "Left Bank",
          canonical_country: "France",
          primary_grapes: "Cabernet Sauvignon",
          vintage: 2019,
          producer: "Opus One",
          classification: "Grand Cru",
          quality_tier: "Grand Cru",
        };
      },
      assembleProfile: async () => makeProfile(),
      loadUserPreferenceEntries: async () => [],
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score", {
        method: "POST",
        body: JSON.stringify({
          entry_id: "11111111-1111-4111-8111-111111111111",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(loadedEntryId).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("POST without auth returns 401", async () => {
    const handler = createAlgorithmScoreHandler({
      requireRequestAuth: async () => {
        throw new RequestAuthError("Unauthorized");
      },
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score", {
        method: "POST",
        body: JSON.stringify({
          wine_type: "red",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("low-confidence response includes the warning and hides the display score", async () => {
    const handler = createAlgorithmScoreHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      assembleProfile: async () => ({
        ...makeProfile(),
        metadata: {
          ...makeProfile().metadata,
          fallback_level: 6,
        },
      }),
      loadUserPreferenceEntries: async () => [],
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score", {
        method: "POST",
        body: JSON.stringify({
          wine_type: "red",
          canonical_country: "France",
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.display_score).toBeFalsy();
    expect(payload.confidence_warning).toContain("below the display threshold");
  });

  test("POST with missing wine_type and no entry_id returns 400", async () => {
    const handler = createAlgorithmScoreHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score", {
        method: "POST",
        body: JSON.stringify({
          canonical_region: "Bordeaux",
        }),
      })
    );

    expect(response.status).toBe(400);
  });

  test("POST with missing entry returns 404", async () => {
    const handler = createAlgorithmScoreHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      loadEntryForScoring: async () => null,
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score", {
        method: "POST",
        body: JSON.stringify({
          entry_id: "11111111-1111-4111-8111-111111111111",
        }),
      })
    );

    expect(response.status).toBe(404);
  });
});
