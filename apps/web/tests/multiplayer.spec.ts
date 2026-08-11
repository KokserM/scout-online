import { devices, expect, test, type Browser } from "@playwright/test";

test("two browsers can Show and complete a repeat-turn Scout", async ({
  browser,
}, testInfo) => {
  const hostContext = await gameContext(browser, testInfo.project.name);
  const guestContext = await gameContext(browser, testInfo.project.name);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("Your display name", { exact: true }).fill("Host");
  await host.getByRole("button", { name: /Create room/i }).click();
  await expect(host.getByRole("heading", { name: /Gather your players/i })).toBeVisible();
  const roomCode = await host.locator(".room-code span").allTextContents();

  await guest.goto(`/?room=${roomCode.join("")}`);
  await guest.getByLabel("Display name", { exact: true }).fill("Guest");
  await guest.getByRole("button", { name: /Take my seat/i }).click();
  await expect(host.getByText("Guest", { exact: true })).toBeVisible();

  await expect(host.getByRole("button", { name: "Ready", exact: true })).toBeVisible();
  await guest.getByRole("button", { name: "I’m ready" }).click();
  await expect(host.getByRole("button", { name: /Start the match/i })).toBeEnabled();
  await host.getByRole("button", { name: /Start the match/i }).click();

  await expect(host.getByRole("heading", { name: /Which way is up/i })).toBeVisible();
  await expect(guest.getByRole("heading", { name: /Which way is up/i })).toBeVisible();
  await expect(host.getByLabel("Full hand orientation preview, 11 cards", { exact: true }).locator(".card-wrap")).toHaveCount(11);
  await host.getByRole("button", { name: /Lock this orientation/i }).click();
  await guest.getByRole("button", { name: /Lock this orientation/i }).click();
  await expect(host.getByRole("heading", { name: /Which way is up/i })).toBeHidden();
  await expect(guest.getByRole("heading", { name: /Which way is up/i })).toBeHidden();
  await expect(host.getByText("Your hand", { exact: true })).toBeVisible();
  await expect(guest.getByText("Your hand", { exact: true })).toBeVisible();

  const pages = [host, guest];
  const openingPlayer = await waitForActivePage(pages);
  await expect(openingPlayer.locator(".hand-scroll")).toBeVisible();
  await openingPlayer.locator(".hand .card-button").first().click();
  await openingPlayer.getByRole("button", { name: /^Show 1$/ }).click();
  await expect(host.getByText(/showed$/i)).toBeVisible();
  await expect(guest.getByText(/showed$/i)).toBeVisible();

  const scoutingPlayer = await waitForActivePage(pages);
  await scoutingPlayer.getByRole("button", { name: "Scout (3)" }).click();
  await expect(scoutingPlayer.getByRole("button", { name: /Take left/i })).toBeVisible();
  await expect(scoutingPlayer.getByRole("button", { name: /Take right/i })).toBeVisible();
  await scoutingPlayer.getByRole("button", { name: /Take left/i }).click();
  const orientations = scoutingPlayer.getByRole("group", {
    name: "Choose card orientation",
  }).getByRole("button");
  await expect(orientations).toHaveCount(2);
  await orientations.first().click();
  await scoutingPlayer.getByRole("button", { name: /Choose a gap/i }).click();
  const gapButtons = scoutingPlayer.getByRole("button", { name: /Insert at position/i });
  const handCount = await scoutingPlayer.locator(".hand .card-button").count();
  await expect(gapButtons).toHaveCount(handCount + 1);
  await gapButtons.last().scrollIntoViewIfNeeded();
  const lastGapBox = await gapButtons.last().boundingBox();
  expect(lastGapBox?.width).toBeGreaterThanOrEqual(44);
  expect(lastGapBox?.height).toBeGreaterThanOrEqual(44);
  await scoutingPlayer.getByRole("button", { name: /Insert at position 0/i }).click();
  await expect(scoutingPlayer.getByLabel("Resulting hand preview", { exact: true }).locator(".card-wrap")).toHaveCount(handCount + 1);
  await scoutingPlayer.getByRole("button", { name: /Confirm Scout/i }).click();
  await expect(scoutingPlayer.getByRole("button", { name: "Scout (2)" })).toBeVisible();
  await expect(scoutingPlayer.locator(".round-header").getByText("Your move", { exact: true })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("Scout & Show selection preserves a right-scrolled preview", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);

  const viewports = [
    { name: "desktop", width: 1440, height: 900, complete: true },
    { name: "compact portrait", width: 320, height: 568, complete: false },
    { name: "portrait", width: 390, height: 844, complete: false },
    { name: "large portrait", width: 430, height: 932, complete: false },
    { name: "mobile landscape", width: 667, height: 375, complete: false },
  ] as const;

  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      const contexts = await Promise.all(
        Array.from({ length: 3 }, () => browser.newContext({
          baseURL: "http://127.0.0.1:5173",
          viewport,
          hasTouch: viewport.width <= 667,
          isMobile: viewport.width <= 430,
        })),
      );
      try {
        const [host, guestOne, guestTwo] = await Promise.all(
          contexts.map((context) => context.newPage()),
        );

        await host.goto("/");
        await host.getByLabel("Your display name", { exact: true }).fill(`Host ${viewport.name}`);
        await host.getByRole("button", { name: /Create room/i }).click();
        await expect(host.getByRole("heading", { name: /Gather your players/i })).toBeVisible();
        const roomCode = (await host.locator(".room-code span").allTextContents()).join("");

        for (const [page, name] of [
          [guestOne, "Guest One"],
          [guestTwo, "Guest Two"],
        ] as const) {
          await page.goto("/");
          await page.getByRole("button", { name: /Join with a code/i }).click();
          await page.getByLabel("Display name", { exact: true }).fill(`${name} ${viewport.name}`);
          await page.getByLabel("Room code", { exact: true }).fill(roomCode);
          await page.getByRole("button", { name: /Take my seat/i }).click();
          await expect(page.getByRole("heading", { name: /Gather your players/i })).toBeVisible();
          await page.getByRole("button", { name: "I’m ready", exact: true }).click();
        }
        await expect(host.getByRole("button", { name: /Start the match/i })).toBeEnabled();
        await host.getByRole("button", { name: /Start the match/i }).click();

        const pages = [host, guestOne, guestTwo];
        await Promise.all(
          pages.map(async (page) => {
            await expect(page.getByRole("heading", { name: /Which way is up/i })).toBeVisible();
            await page.getByRole("button", { name: /Lock this orientation/i }).click();
            await expect(page.getByRole("heading", { name: /Which way is up/i })).toBeHidden();
          }),
        );

        const openingPlayer = await waitForActivePage(pages);
        const openingCards = openingPlayer.locator(".hand .card-button");
        const openingValues = await openingCards.evaluateAll((cards) =>
          cards.map((card) => Number(card.getAttribute("aria-label")?.match(/^active (\d+)/)?.[1])),
        );
        const weakestIndex = openingValues.indexOf(Math.min(...openingValues));
        await openingCards.nth(weakestIndex).click();
        await openingPlayer.getByRole("button", { name: /^Show 1$/ }).click();
        await Promise.all(
          pages.map((page) => expect(page.getByText(/showed$/i)).toBeVisible()),
        );

        const combinedPlayer = await waitForActivePage(pages);
        await combinedPlayer.getByRole("button", { name: "Scout & Show", exact: true }).click();
        await combinedPlayer.locator(".scout-end:not([disabled])").first().click();
        const orientations = combinedPlayer.getByRole("group", {
          name: "Choose card orientation",
        }).getByRole("button");
        await expect(orientations).not.toHaveCount(0);
        await orientations.first().click();
        await combinedPlayer.getByRole("button", { name: "Choose a gap", exact: true }).click();
        await combinedPlayer.locator('button[aria-label^="Insert at position"]:not([disabled])').first().click();

        const preview = combinedPlayer.getByLabel("Resulting hand preview", { exact: true });
        const cards = preview.getByRole("button", { name: /^active \d+, opposite \d+/ });
        expect(await cards.count()).toBeGreaterThan(10);
        await preview.evaluate((element) => {
          element.scrollLeft = element.scrollWidth - element.clientWidth - 8;
        });
        const nearRight = await preview.evaluate((element) => ({
          scrollLeft: element.scrollLeft,
          maximum: element.scrollWidth - element.clientWidth,
        }));
        expect(nearRight.maximum).toBeGreaterThan(0);
        expect(nearRight.scrollLeft).toBeGreaterThanOrEqual(nearRight.maximum - 10);

        const legalRange = await findRightmostLegalRange(combinedPlayer, preview, cards);
        await clearPreviewSelection(preview, cards);
        await alignCardAtViewportRight(preview, cards.nth(legalRange.start));
        for (let index = legalRange.start; index <= legalRange.end; index += 1) {
          await clickWithoutScrollJump(preview, cards.nth(index));
        }

        const selected = preview.locator(".card-button.is-selected");
        await expect(selected).toHaveCount(legalRange.end - legalRange.start + 1);
        for (const selectedCard of await selected.all()) {
          await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
        }
        await expect(selected.locator(".card-selected-marker")).toHaveCount(
          legalRange.end - legalRange.start + 1,
        );
        const status = combinedPlayer.getByRole("dialog").getByRole("status");
        await expect(status).toContainText(
          `${legalRange.end - legalRange.start + 1} ${legalRange.start === legalRange.end ? "card" : "cards"} selected`,
        );
        await expect(status).toContainText("legal Show");
        const previewBox = await preview.boundingBox();
        const firstSelectedBox = await selected.first().boundingBox();
        expect(previewBox).not.toBeNull();
        expect(firstSelectedBox).not.toBeNull();
        expect(firstSelectedBox!.x).toBeGreaterThanOrEqual(previewBox!.x + previewBox!.width * 0.4);

        const confirm = combinedPlayer.getByRole("button", { name: /^Confirm Scout & Show \d+$/ });
        await expect(confirm).toBeEnabled();
        if (viewport.complete) {
          await confirm.click();
          await expect(combinedPlayer.getByRole("heading", { name: "Choose your Show." })).toBeHidden();
          await expect(combinedPlayer.getByText(/showed$/i)).toBeVisible();
        } else {
          await combinedPlayer.getByRole("button", { name: "Cancel", exact: true }).click();
          await expect(combinedPlayer.getByRole("heading", { name: "Choose your Show." })).toBeHidden();
          await expect(combinedPlayer.locator(".round-header").getByText("Your move", { exact: true })).toBeVisible();
        }
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
      }
    });
  }
});

test("Quick Play creates a live room with bots", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your display name", { exact: true }).fill("Solo");
  await page.getByRole("button", { name: /Quick play/i }).click();
  await expect(page.getByRole("heading", { name: /Which way is up/i })).toBeVisible();
  await expect(page.getByText(/^Tempo/)).toBeVisible();
  await expect(page.getByText(/^Marquee/)).toBeVisible();
});

test("a live round reaches responsive results", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);
  const contexts = await Promise.all([
    gameContext(browser, "desktop"),
    gameContext(browser, "desktop"),
  ]);
  const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()));

  await host.goto("/");
  await host.getByLabel("Your display name", { exact: true }).fill("Results Host");
  await host.getByRole("button", { name: /Create room/i }).click();
  const roomCodeCharacters = host.locator(".room-code span");
  await expect(roomCodeCharacters).toHaveCount(5);
  const roomCode = (await roomCodeCharacters.allTextContents()).join("");
  await guest.goto(`/?room=${roomCode}`);
  await guest.getByLabel("Display name", { exact: true }).fill("Results Guest");
  await guest.getByRole("button", { name: /Take my seat/i }).click();
  await guest.getByRole("button", { name: "I’m ready" }).click();
  await expect(host.getByRole("button", { name: /Start the match/i })).toBeEnabled();
  await host.getByRole("button", { name: /Start the match/i }).click();
  await Promise.all([host, guest].map(async (page) => {
    await page.getByRole("button", { name: /Lock this orientation/i }).click();
    await expect(page.getByRole("heading", { name: /Which way is up/i })).toBeHidden();
  }));

  const pages = [host, guest];
  for (let turn = 0; turn < 80; turn += 1) {
    if (await host.getByRole("heading", { name: "That’s the round." }).isVisible()) break;
    const active = await waitForActivePage(pages);
    await completeLegalTurn(active);
  }

  await expect(host.getByRole("dialog", { name: "That’s the round." })).toBeVisible();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await host.setViewportSize(viewport);
    const dialog = host.getByRole("dialog", { name: "That’s the round." });
    await dialog.getByRole("button", { name: "Next round" }).scrollIntoViewIfNeeded();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await Promise.all(contexts.map((context) => context.close()));
});

async function gameContext(browser: Browser, projectName: string) {
  return browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    ...(projectName === "mobile" ? devices["iPhone 13"] : devices["Desktop Chrome"]),
  });
}

async function clickWithoutScrollJump(
  preview: import("@playwright/test").Locator,
  card: import("@playwright/test").Locator,
) {
  const before = await preview.evaluate((element) => element.scrollLeft);
  await card.click({ force: true });
  await expect.poll(async () =>
    Math.abs(await preview.evaluate((element) => element.scrollLeft) - before),
  ).toBeLessThanOrEqual(2);
  const after = await preview.evaluate((element) => element.scrollLeft);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
}

async function alignCardAtViewportRight(
  preview: import("@playwright/test").Locator,
  card: import("@playwright/test").Locator,
) {
  await preview.evaluate((element, target) => {
    const cardElement = target as HTMLElement;
    const maximum = element.scrollWidth - element.clientWidth;
    element.scrollLeft = Math.min(maximum, Math.max(0, cardElement.offsetLeft - element.clientWidth * 0.55));
  }, await card.elementHandle());
}

async function clearPreviewSelection(
  preview: import("@playwright/test").Locator,
  cards: import("@playwright/test").Locator,
) {
  for (let attempt = 0; attempt < await cards.count() + 1; attempt += 1) {
    const selected = preview.locator(".card-button.is-selected").first();
    if (!await selected.isVisible()) return;
    await alignCardAtViewportRight(preview, selected);
    await clickWithoutScrollJump(preview, selected);
  }
  throw new Error("Scout & Show preview selection did not clear");
}

async function findRightmostLegalRange(
  page: import("@playwright/test").Page,
  preview: import("@playwright/test").Locator,
  cards: import("@playwright/test").Locator,
) {
  const confirm = page.getByRole("button", { name: /^Confirm Scout & Show \d+$/ });
  for (let start = await cards.count() - 1; start >= 0; start -= 1) {
    await clearPreviewSelection(preview, cards);
    await alignCardAtViewportRight(preview, cards.nth(start));
    await clickWithoutScrollJump(preview, cards.nth(start));
    if (await confirm.isEnabled()) return { start, end: start };
    for (let end = start + 1; end < await cards.count(); end += 1) {
      await alignCardAtViewportRight(preview, cards.nth(end));
      await clickWithoutScrollJump(preview, cards.nth(end));
      if (await confirm.isEnabled()) return { start, end };
    }
  }
  throw new Error("No projected legal Scout & Show range was selectable");
}

async function waitForActivePage(pages: import("@playwright/test").Page[]) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (const page of pages) {
      if (await page.locator(".round-header").getByText("Your move", { exact: true }).isVisible()) return page;
    }
    await pages[0]!.waitForTimeout(50);
  }
  throw new Error("No active player appeared");
}

async function completeLegalTurn(page: import("@playwright/test").Page) {
  const cards = page.locator(".hand .card-button");
  const show = page.getByRole("button", { name: /^Show(?: \d+)?$/ });
  const clearSelection = async () => {
    for (let index = 0; index < 20 && await page.locator(".hand .card-button.is-selected").count(); index += 1) {
      // Selection lift/layout animation can keep the card moving just long
      // enough for Playwright's stability check to race. The hit target is
      // already known and visible, so force the deterministic deselection.
      await page.locator(".hand .card-button.is-selected").first().click({ force: true });
    }
  };

  for (let start = 0; start < await cards.count(); start += 1) {
    await clearSelection();
    await cards.nth(start).click();
    if (await show.isEnabled()) {
      await show.click();
      await expect(page.locator(".round-header").getByText("Your move", { exact: true })).toBeHidden();
      return;
    }
    for (let end = start + 1; end < await cards.count(); end += 1) {
      await cards.nth(end).click();
      if (await show.isEnabled()) {
        await show.click();
        await expect(page.locator(".round-header").getByText("Your move", { exact: true })).toBeHidden();
        return;
      }
    }
  }

  await clearSelection();
  const scout = page.getByRole("button", { name: /^Scout \(\d+\)$/ });
  await expect(scout).toBeEnabled();
  await scout.click();
  await page.locator(".scout-end:not([disabled])").first().click();
  await page.getByRole("group", { name: "Choose card orientation" }).getByRole("button").first().click();
  await page.getByRole("button", { name: /Choose a gap/i }).click();
  await page.locator('button[aria-label^="Insert at position"]:not([disabled])').first().click();
  const confirmScout = page.getByRole("button", { name: "Confirm Scout" });
  await confirmScout.click();
  await expect(confirmScout).toBeHidden();
}

