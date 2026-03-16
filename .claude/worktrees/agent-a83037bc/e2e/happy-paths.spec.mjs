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
  // Default auth mode is email; tests use the visible label.
  await page.getByLabel("Email or username").fill(identifier);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /Sign out/i }).first()).toBeVisible();
}

async function signOut(page) {
  await page.getByRole("button", { name: /Sign out/i }).first().click();
  await expect(page).toHaveURL(/\/login$/);
}

async function clearRelationship(page, targetUserId) {
  const response = await page.request.delete(`/api/users/${targetUserId}/follow`);
  expect(response.ok()).toBeTruthy();
}

async function clearBlock(page, targetUserId) {
  const response = await page.request.delete(`/api/users/${targetUserId}/block`);
  expect(response.ok()).toBeTruthy();
}

async function ensureFeedPhoto(page, entryId) {
  const response = await page.request.post(`/api/entries/${entryId}/photos`, {
    data: { type: "label" },
  });
  expect(response.ok()).toBeTruthy();
}

async function expectFriends(page, targetUserId) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/users/${targetUserId}/follow`);
        if (!response.ok()) {
          return false;
        }
        const payload = await response.json();
        return payload?.friends === true;
      },
      { timeout: 20000 }
    )
    .toBeTruthy();
}

async function expectNotFriends(page, targetUserId) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/users/${targetUserId}/follow`);
        if (!response.ok()) {
          return false;
        }
        const payload = await response.json();
        return payload?.friends === false;
      },
      { timeout: 20000 }
    )
    .toBeTruthy();
}

test.describe("Core happy paths", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    missingEnv.length > 0,
    `Missing E2E env vars: ${missingEnv.join(", ")}`
  );

  test("login, request, accept, unfriend, and friends-only visibility", async ({
    page,
  }) => {
    const userAId = process.env.E2E_USER_A_ID;
    const userAIdentifier = process.env.E2E_USER_A_IDENTIFIER;
    const userAPassword = process.env.E2E_USER_A_PASSWORD;
    const userBId = process.env.E2E_USER_B_ID;
    const userBIdentifier = process.env.E2E_USER_B_IDENTIFIER;
    const userBPassword = process.env.E2E_USER_B_PASSWORD;
    const wineName = `E2E Friends Only ${Date.now()}`;

    await login(page, userAIdentifier, userAPassword);
    await clearRelationship(page, userBId);
    await clearBlock(page, userBId);

    await page.goto(`/profile/${userBId}`);
    await page.getByRole("button", { name: "Add friend" }).click();
    await expect(page.getByText("Request sent")).toBeVisible();
    await signOut(page);

    await login(page, userBIdentifier, userBPassword);
    await clearBlock(page, userAId);
    await page.getByRole("button", { name: "Alerts" }).click();
    await expect(
      page.getByRole("button", { name: "Accept friend request" })
    ).toBeVisible();
    const acceptResponsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== "POST") return false;
      const url = response.url();
      return url.includes("/api/friends/requests/") && url.endsWith("/accept");
    });
    await page.getByRole("button", { name: "Accept friend request" }).click();
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.ok()).toBeTruthy();
    await page.getByRole("button", { name: "Close alerts" }).click();

    await page.goto(`/profile/${userAId}`);
    await expect(page.getByRole("button", { name: /^Remove$/ })).toBeVisible();
    await signOut(page);

    await login(page, userAIdentifier, userAPassword);
    await page.goto("/entries/new");
    await page
      .locator('details:has(summary:has-text("Wine details"))')
      .evaluate((element) => {
        element.open = true;
      });
    await page.locator('input[name="wine_name"]').fill(wineName);
    await page.locator('input[name="rating"]').fill("92");
    await page
      .locator('details:has(summary:has-text("Visibility & interaction"))')
      .evaluate((element) => {
        element.open = true;
      });
    await page.locator('select[name="entry_privacy"]').selectOption("friends");
    const createEntryResponsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== "POST") return false;
      return new URL(response.url()).pathname === "/api/entries";
    });
    await page.getByRole("button", { name: "Save entry" }).click();
    const surveyHeading = page.getByRole("heading", { name: "Quick check-in" });
    const surveyAppeared = await surveyHeading
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    const saveAndContinueButton = page.getByRole("button", {
      name: "Save and continue",
    });
    if (surveyAppeared) {
      await page.getByRole("combobox", { name: "How was it?" }).selectOption({
        label: "Good",
      });
      await page
        .getByRole("combobox", {
          name: "How did it compare to your expectations?",
        })
        .selectOption({ label: "Met expectations" });
      await page
        .getByRole("combobox", { name: "Would you drink it again?" })
        .selectOption({ label: "Yes" });
      await saveAndContinueButton.click();
    }
    const skipComparisonButton = page.getByRole("button", { name: "Skip" });
    const comparisonAppeared = await skipComparisonButton
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (comparisonAppeared) {
      await skipComparisonButton.click();
    }

    const createEntryResponse = await createEntryResponsePromise;
    expect(createEntryResponse.ok()).toBeTruthy();
    const createEntryPayload = await createEntryResponse.json();
    const entryId = createEntryPayload?.entry?.id;
    expect(typeof entryId).toBe("string");
    await ensureFeedPhoto(page, entryId);
    await expect(page).not.toHaveURL(/\/entries\/new$/);

    const publishResponse = await page.request.put(`/api/entries/${entryId}`, {
      data: {
        wine_name: wineName,
        rating: 92,
        entry_privacy: "friends",
        is_feed_visible: true,
      },
    });
    if (!publishResponse.ok()) {
      throw new Error(
        `Publish update failed (${publishResponse.status()}): ${await publishResponse.text()}`
      );
    }
    const publishPayload = await publishResponse.json();
    expect(publishPayload?.entry?.entry_privacy).toBe("friends");
    expect(Boolean(publishPayload?.entry?.is_feed_visible)).toBeTruthy();
    await signOut(page);

    await login(page, userBIdentifier, userBPassword);
    await clearBlock(page, userAId);
    await expectFriends(page, userAId);
    const visibleEntryResponse = await page.request.get(`/api/entries/${entryId}`);
    expect(visibleEntryResponse.ok()).toBeTruthy();
    const visibleUserEntriesResponse = await page.request.get(
      `/api/users/${userAId}/entries`
    );
    expect(visibleUserEntriesResponse.ok()).toBeTruthy();
    const visibleUserEntriesPayload = await visibleUserEntriesResponse.json();
    const visibleUserEntries = Array.isArray(visibleUserEntriesPayload?.entries)
      ? visibleUserEntriesPayload.entries
      : [];
    expect(visibleUserEntries.some((entry) => entry?.id === entryId)).toBeTruthy();

    await page.goto(`/profile/${userAId}`);
    await page.getByRole("button", { name: /^Remove$/ }).click();
    await page.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByRole("button", { name: "Add friend" })).toBeVisible();
    await expectNotFriends(page, userAId);

    const hiddenEntryResponse = await page.request.get(`/api/entries/${entryId}`);
    expect(hiddenEntryResponse.status()).toBe(403);
    const hiddenUserEntriesResponse = await page.request.get(`/api/users/${userAId}/entries`);
    expect(hiddenUserEntriesResponse.ok()).toBeTruthy();
    const hiddenUserEntriesPayload = await hiddenUserEntriesResponse.json();
    const hiddenUserEntries = Array.isArray(hiddenUserEntriesPayload?.entries)
      ? hiddenUserEntriesPayload.entries
      : [];
    expect(hiddenUserEntries.some((entry) => entry?.id === entryId)).toBeFalsy();
  });
});
