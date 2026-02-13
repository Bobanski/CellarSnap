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
  await page.getByLabel("Email").fill(identifier);
  await page.getByLabel("Password").fill(password);
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

    await page.goto(`/profile/${userBId}`);
    await page.getByRole("button", { name: "Add friend" }).click();
    await expect(page.getByText("Request sent")).toBeVisible();
    await signOut(page);

    await login(page, userBIdentifier, userBPassword);
    await page.goto(`/profile/${userAId}`);
    await expect(
      page.getByRole("button", { name: "Accept friend request" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Accept friend request" }).click();
    await expect(page.getByRole("button", { name: /^Remove$/ })).toBeVisible();
    await signOut(page);

    await login(page, userAIdentifier, userAPassword);
    await page.goto("/entries/new");
    await page.getByLabel("Wine name").fill(wineName);
    await page.getByLabel("Visibility").selectOption("friends");
    await page.getByRole("button", { name: "Save entry" }).click();
    const skipComparisonButton = page.getByRole("button", { name: "Skip" });
    if (
      await skipComparisonButton
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await skipComparisonButton.click();
    }
    await expect(page).toHaveURL(/\/entries\/[^/]+$/);
    await expect(page.getByRole("heading", { name: wineName })).toBeVisible();
    await signOut(page);

    await login(page, userBIdentifier, userBPassword);
    await page.goto("/feed");
    await page.getByRole("button", { name: "Friends only" }).click();
    await expect(page.getByRole("heading", { name: wineName })).toBeVisible();

    await page.goto(`/profile/${userAId}`);
    await page.getByRole("button", { name: /^Remove$/ }).click();
    await page.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByRole("button", { name: "Add friend" })).toBeVisible();

    await page.goto("/feed");
    await page.getByRole("button", { name: "Friends only" }).click();
    await expect(page.getByRole("heading", { name: wineName })).toHaveCount(0);
  });
});
