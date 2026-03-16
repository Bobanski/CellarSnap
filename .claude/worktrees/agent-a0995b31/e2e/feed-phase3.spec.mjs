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
  await page.getByLabel("Email or username").fill(identifier);
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

async function createPublicEntry(page, { wineName, consumedAt }) {
  const response = await page.request.post("/api/entries", {
    data: {
      wine_name: wineName,
      consumed_at: consumedAt,
      entry_privacy: "public",
      is_feed_visible: true,
      skip_comparison_candidate: true,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(typeof body?.entry?.id).toBe("string");
  const entryId = body.entry.id;

  const photoResponse = await page.request.post(`/api/entries/${entryId}/photos`, {
    data: { type: "label" },
  });
  expect(photoResponse.ok()).toBeTruthy();

  return entryId;
}

async function fetchFeedPage(page, { scope, limit, cursor, cursorV2 }) {
  const search = new URLSearchParams({
    scope,
    limit: String(limit),
  });
  if (cursorV2) {
    search.set("cursor_v2", cursorV2);
  } else if (cursor) {
    search.set("cursor", cursor);
  }

  const response = await page.request.get(`/api/feed?${search.toString()}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("Feed phase 3", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    missingEnv.length > 0,
    `Missing E2E env vars: ${missingEnv.join(", ")}`
  );

  test("cursor v2 pagination is monotonic and blocks hide authors from feed", async ({
    page,
  }) => {
    const userAId = process.env.E2E_USER_A_ID;
    const userAIdentifier = process.env.E2E_USER_A_IDENTIFIER;
    const userAPassword = process.env.E2E_USER_A_PASSWORD;
    const userBIdentifier = process.env.E2E_USER_B_IDENTIFIER;
    const userBPassword = process.env.E2E_USER_B_PASSWORD;

    const batchPrefix = `E2E-P3-${Date.now()}`;
    const createdEntryIds = [];
    const createdWineNames = [];
    const totalEntriesToCreate = 26;

    let loggedInAs = null;
    try {
      await login(page, userAIdentifier, userAPassword);
      loggedInAs = "A";

      for (let index = 0; index < totalEntriesToCreate; index += 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - index);
        const consumedAt = date.toISOString().slice(0, 10);
        const wineName = `${batchPrefix}-${String(index).padStart(2, "0")}`;
        createdWineNames.push(wineName);
        const entryId = await createPublicEntry(page, { wineName, consumedAt });
        createdEntryIds.push(entryId);
      }

      await signOutIfPossible(page);
      await login(page, userBIdentifier, userBPassword);
      loggedInAs = "B";

      const seenEntryIds = new Set();
      const seenCreatedByPrefix = new Set();
      let cursor = null;
      let cursorV2 = null;
      let hasMore = true;
      let pagesFetched = 0;
      let previousCursorV2 = null;

      while (hasMore && pagesFetched < 5) {
        const feedData = await fetchFeedPage(page, {
          scope: "public",
          limit: 10,
          cursor,
          cursorV2,
        });
        const pageEntries = Array.isArray(feedData.entries) ? feedData.entries : [];

        for (const entry of pageEntries) {
          expect(seenEntryIds.has(entry.id)).toBeFalsy();
          seenEntryIds.add(entry.id);
          if (
            entry.user_id === userAId &&
            typeof entry.wine_name === "string" &&
            entry.wine_name.startsWith(batchPrefix)
          ) {
            seenCreatedByPrefix.add(entry.wine_name);
          }
        }

        if (previousCursorV2 && feedData.next_cursor_v2) {
          expect(feedData.next_cursor_v2).not.toBe(previousCursorV2);
        }

        cursor = typeof feedData.next_cursor === "string" ? feedData.next_cursor : null;
        cursorV2 =
          typeof feedData.next_cursor_v2 === "string" ? feedData.next_cursor_v2 : null;
        previousCursorV2 = cursorV2;
        hasMore = Boolean(feedData.has_more);
        pagesFetched += 1;
      }

      expect(seenEntryIds.size).toBeGreaterThan(0);
      expect(seenCreatedByPrefix.size).toBeGreaterThan(0);

      const blockResponse = await page.request.post(`/api/users/${userAId}/block`);
      expect(blockResponse.ok()).toBeTruthy();

      const blockedFeed = await fetchFeedPage(page, {
        scope: "public",
        limit: 30,
        cursor: null,
        cursorV2: null,
      });
      const blockedEntries = (blockedFeed.entries ?? []).filter(
        (entry) => entry.user_id === userAId
      );
      expect(blockedEntries.length).toBe(0);

      const unblockResponse = await page.request.delete(`/api/users/${userAId}/block`);
      expect(unblockResponse.ok()).toBeTruthy();
    } finally {
      try {
        if (loggedInAs === "B") {
          await signOutIfPossible(page);
          loggedInAs = null;
        }
      } catch {
        // Best-effort sign out for cleanup.
      }

      try {
        await login(page, userAIdentifier, userAPassword);
        for (const entryId of createdEntryIds) {
          await page.request.delete(`/api/entries/${entryId}`);
        }
      } catch {
        // Best-effort cleanup for test-created entries.
      } finally {
        await signOutIfPossible(page).catch(() => null);
      }
    }
  });
});
