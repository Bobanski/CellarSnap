import { expect, test } from "@playwright/test";

const requiredEnv = [
  "E2E_USER_A_ID",
  "E2E_USER_A_IDENTIFIER",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_ID",
  "E2E_USER_B_IDENTIFIER",
  "E2E_USER_B_PASSWORD",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

async function login(page, identifier, password) {
  await page.goto("/login");
  await page
    .getByLabel(/Email or username|Username or phone number/)
    .fill(identifier);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function signOutIfPossible(page) {
  const signOutButton = page.getByRole("button", { name: /Sign out/i }).first();
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
    await expect(page).toHaveURL(/\/login$/);
  }
}

async function clearRelationship(page, targetUserId) {
  const response = await page.request.delete(`/api/users/${targetUserId}/follow`);
  expect(response.ok()).toBeTruthy();
}

async function ensureFeedPhoto(page, entryId) {
  const response = await page.request.post(`/api/entries/${entryId}/photos`, {
    data: { type: "label" },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("Phase 6 route integration", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    missingEnv.length > 0,
    `Missing E2E env vars: ${missingEnv.join(", ")}`
  );

  test("profile, entries, feed, and friends routes keep contract behavior", async ({
    page,
  }) => {
    const userAId = process.env.E2E_USER_A_ID;
    const userAIdentifier = process.env.E2E_USER_A_IDENTIFIER;
    const userAPassword = process.env.E2E_USER_A_PASSWORD;
    const userBId = process.env.E2E_USER_B_ID;
    const userBIdentifier = process.env.E2E_USER_B_IDENTIFIER;
    const userBPassword = process.env.E2E_USER_B_PASSWORD;

    const wineName = `E2E-P6-${Date.now()}`;
    let createdEntryId = null;
    let loggedInAs = null;

    try {
      await login(page, userAIdentifier, userAPassword);
      loggedInAs = "A";

      await clearRelationship(page, userBId);

      const profileResponse = await page.request.get("/api/profile");
      expect(profileResponse.ok()).toBeTruthy();
      const profilePayload = await profileResponse.json();
      expect(profilePayload?.profile?.id).toBe(userAId);

      const createEntryResponse = await page.request.post("/api/entries", {
        data: {
          wine_name: wineName,
          consumed_at: "2026-02-28",
          entry_privacy: "public",
          is_feed_visible: true,
          skip_comparison_candidate: true,
        },
      });
      expect(createEntryResponse.ok()).toBeTruthy();
      const createdEntryPayload = await createEntryResponse.json();
      createdEntryId = createdEntryPayload?.entry?.id ?? null;
      expect(typeof createdEntryId).toBe("string");
      await ensureFeedPhoto(page, createdEntryId);

      const entriesResponse = await page.request.get("/api/entries?limit=20");
      expect(entriesResponse.ok()).toBeTruthy();
      const entriesPayload = await entriesResponse.json();
      expect(Array.isArray(entriesPayload?.entries)).toBeTruthy();
      expect(entriesPayload.entries.some((entry) => entry.id === createdEntryId)).toBeTruthy();

      const followResponse = await page.request.post(`/api/users/${userBId}/follow`);
      expect(followResponse.ok()).toBeTruthy();
      const followPayload = await followResponse.json();
      expect(typeof followPayload.following).toBe("boolean");
      expect(typeof followPayload.follows_you).toBe("boolean");
      expect(typeof followPayload.friends).toBe("boolean");
      expect(typeof followPayload.friend_status).toBe("string");

      await signOutIfPossible(page);
      await login(page, userBIdentifier, userBPassword);
      loggedInAs = "B";

      const feedResponse = await page.request.get("/api/feed?scope=public&limit=50");
      expect(feedResponse.ok()).toBeTruthy();
      const feedPayload = await feedResponse.json();
      expect(Array.isArray(feedPayload?.entries)).toBeTruthy();
      expect(typeof feedPayload?.has_more).toBe("boolean");
      expect(
        feedPayload.entries.some(
          (entry) => entry.id === createdEntryId && entry.wine_name === wineName
        )
      ).toBeTruthy();

      const requestsResponse = await page.request.get("/api/friends/requests");
      expect(requestsResponse.ok()).toBeTruthy();
      const requestsPayload = await requestsResponse.json();
      const incomingRequest = Array.isArray(requestsPayload?.incoming)
        ? requestsPayload.incoming.find((request) => request?.requester?.id === userAId)
        : null;

      if (incomingRequest?.id) {
        const acceptResponse = await page.request.post(
          `/api/friends/requests/${incomingRequest.id}/accept`
        );
        expect(acceptResponse.ok()).toBeTruthy();
      }

      const relationshipResponse = await page.request.get(`/api/users/${userAId}/follow`);
      expect(relationshipResponse.ok()).toBeTruthy();
      const relationshipPayload = await relationshipResponse.json();
      expect(typeof relationshipPayload.following).toBe("boolean");
      expect(typeof relationshipPayload.follows_you).toBe("boolean");
      expect(typeof relationshipPayload.friends).toBe("boolean");
      expect(typeof relationshipPayload.friend_status).toBe("string");

      const friendsResponse = await page.request.get("/api/friends");
      expect(friendsResponse.ok()).toBeTruthy();
      const friendsPayload = await friendsResponse.json();
      expect(Array.isArray(friendsPayload?.friends)).toBeTruthy();

      const suggestionsResponse = await page.request.get("/api/friends/suggestions");
      expect(suggestionsResponse.ok()).toBeTruthy();
      const suggestionsPayload = await suggestionsResponse.json();
      expect(Array.isArray(suggestionsPayload?.suggestions)).toBeTruthy();

      const userBProfileResponse = await page.request.get("/api/profile");
      expect(userBProfileResponse.ok()).toBeTruthy();
      const userBProfilePayload = await userBProfileResponse.json();
      expect(userBProfilePayload?.profile?.id).toBe(userBId);
    } finally {
      try {
        if (loggedInAs === "B") {
          await clearRelationship(page, userAId);
          await signOutIfPossible(page);
          loggedInAs = null;
        }
      } catch {
        // Best-effort cleanup if B session actions fail.
      }

      try {
        await login(page, userAIdentifier, userAPassword);
        if (createdEntryId) {
          await page.request.delete(`/api/entries/${createdEntryId}`);
        }
        await clearRelationship(page, userBId);
      } catch {
        // Best-effort cleanup for A session data.
      } finally {
        await signOutIfPossible(page).catch(() => null);
      }
    }
  });
});
