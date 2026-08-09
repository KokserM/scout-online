import { expect, test } from "@playwright/test";

test("landing, join, rules, and demo table are usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Read the room/i })).toBeVisible();

  await page.getByRole("button", { name: /How to play/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Join with a code/i }).click();
  await expect(page.getByRole("heading", { name: /Join the table/i })).toBeVisible();
  await page.getByRole("button", { name: /Back to entrance/i }).click();

  await page.getByRole("button", { name: /Preview a table/i }).click();
  await expect(page.getByText("Your hand")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scout", exact: true })).toBeVisible();
});

test("mobile layout does not overflow the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole("button", { name: /Quick play/i })).toBeVisible();
});

test("room deep links open the join form with the code prefilled", async ({ page }) => {
  await page.goto("/?room=F7K2M");

  await expect(page.getByRole("heading", { name: /Join the table/i })).toBeVisible();
  await expect(page.getByLabel("Room code")).toHaveValue("F7K2M");
});
