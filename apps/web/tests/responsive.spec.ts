import { expect, test } from "@playwright/test";

const viewports = [
  { name: "compact phone", width: 320, height: 568 },
  { name: "phone", width: 375, height: 667 },
  { name: "tall phone", width: 390, height: 844 },
  { name: "large phone", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile landscape", width: 667, height: 375 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test("core screens remain usable at all acceptance viewports", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop");
  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const quickPlay = page.getByRole("button", { name: /Quick play/i });
      await expect(quickPlay).toBeVisible();
      await expectInsideViewport(quickPlay, viewport.width, viewport.height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      await page.getByRole("button", { name: /Preview a table/i }).click({ force: true });
      await expect(page.getByText("Your hand", { exact: true })).toBeVisible();
      const actionBar = page.locator(".action-bar");
      await expect(actionBar).toBeVisible();
      await expectInsideViewport(actionBar, viewport.width, viewport.height, false);
      await expect(page.getByRole("button", { name: "Scout", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Show", exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
});

test("live game remains operable at every acceptance viewport", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop");

  for (const [index, viewport] of viewports.entries()) {
    await test.step(viewport.name, async () => {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:5173",
        viewport,
        hasTouch: viewport.width <= 768,
        isMobile: viewport.width <= 430,
      });
      const page = await context.newPage();
      await page.goto("/");
      await page.getByLabel("Your display name", { exact: true }).fill(`Viewport ${index}`);
      await page.getByRole("button", { name: /Quick play/i }).click();

      const orientation = page.getByRole("dialog", { name: /Which way is up/i });
      await expect(orientation).toBeVisible();
      await expectInsideViewport(orientation, viewport.width, viewport.height);
      const fullHand = page.getByLabel(/Full hand orientation preview, \d+ cards/);
      expect(await fullHand.locator(".card-wrap").count()).toBeGreaterThan(5);
      expect(await fullHand.evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);
      await fullHand.locator(".card-wrap").last().scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: /Flip the whole hand/i })).toBeVisible();
      await expectMinimumTarget(page.getByRole("button", { name: /Lock this orientation/i }));
      await page.getByRole("button", { name: /Flip the whole hand/i }).click();
      const scrollTransform = await fullHand.evaluate((element) => getComputedStyle(element).transform);
      expect(scrollTransform === "none" || scrollTransform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
      await page.getByRole("button", { name: /Lock this orientation/i }).click();

      await expect(page.getByText("Your hand", { exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Table" })).toBeVisible();
      const hand = page.locator(".hand-scroll");
      const handWidths = await hand.evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
      expect(handWidths.scroll).toBeGreaterThanOrEqual(handWidths.client);
      if (viewport.width <= 768) expect(handWidths.scroll).toBeGreaterThan(handWidths.client);
      await hand.locator(".card-button").last().scrollIntoViewIfNeeded();

      const actionBar = page.locator(".action-bar");
      await expectInsideViewport(actionBar, viewport.width, viewport.height);
      for (const button of await actionBar.getByRole("button").all()) {
        await expectMinimumTarget(button);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await context.close();
    });
  }
});

test("lobby QR dialog fits every acceptance viewport", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/");
  await page.getByLabel("Your display name", { exact: true }).fill("QR host");
  await page.getByRole("button", { name: /Create room/i }).click();
  await page.getByRole("button", { name: /Invite players/i }).click();

  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      const dialog = page.getByRole("dialog", { name: "Invite players" });
      await expectInsideViewport(dialog, viewport.width, viewport.height);
      await expect(page.getByTestId("invite-qr")).toBeVisible();
      await expectMinimumTarget(page.getByRole("button", { name: "Close invite" }));
      await dialog.getByRole("button", { name: /Copy link/i }).scrollIntoViewIfNeeded();
      await expectMinimumTarget(dialog.getByRole("button", { name: /Copy link/i }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

async function expectInsideViewport(
  locator: import("@playwright/test").Locator,
  width: number,
  height: number,
  requireVerticalFit = true,
) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  if (requireVerticalFit) expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
}

async function expectMinimumTarget(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
