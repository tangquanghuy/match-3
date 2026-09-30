import { expect, test, type Page } from '@playwright/test';

async function bodyText(page: Page): Promise<string> {
  return page.locator('body').evaluate((body) => body.textContent ?? '');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const viewport of [
  { width: 1600, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'mobile' },
]) {
  test(`跨页英文复读清理并保留官方专名：${viewport.label}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto('/game.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.goto('/game.html#events');
    await expect(page.locator('.ev-overview-card')).toHaveCount(6);
    await expect(page.locator('.ev-overview-header > div > small, .ev-overview-title small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/WEEKLY EVENTS/);
    await expectNoHorizontalOverflow(page);

    await page.goto('/game.html#events/towerOfDoom');
    await expect(page.locator('.tw-start-stats')).toContainText('最高');
    await expect(page.locator('.ev-banner-copy > small, .ev-state h3 small, .ev-shop-entry-copy > small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/EVENT SHOP|END TOWER RUN|TOWER FLOORS|\bBEST\b|\bTier\b/);
    await page.screenshot({ path: `artifacts/ux-phase-b/copy-cleanup-events-${viewport.label}.png` });

    for (const route of ['standings', 'ranks', 'rules']) {
      await page.goto(`/game.html#invasion/${route}`);
      await expect(page.locator('.inv-secondary-body > header h2')).toBeVisible();
      await expect(page.locator('.inv-secondary-body > header > small')).toHaveCount(0);
    }
    expect(await bodyText(page)).not.toMatch(/WEEKLY STANDINGS|RANKED LEAGUES|INVASION RULES/);

    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      save.hero.level = 4;
      save.hero.xp = 0;
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
    });
    await page.goto('/game.html#invasion');
    await page.reload();
    await expect(page.locator('.inv-locked')).toBeVisible();
    await expect(page.locator('.inv-lock-kicker, .inv-lock-command-head > small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/RANKED INVASION|ACCESS PROTOCOL/);
    await expectNoHorizontalOverflow(page);

    await page.goto('/game.html#map');
    await expect(page.locator('.map-shell')).toBeVisible();
    await page.locator('.knode.sel').click({ force: true });
    await expect(page.locator('#kingdomVeil')).toBeVisible();
    await expect(page.locator('.kingdom-info > .eyebrow')).toHaveCount(0);
    await expect(page.locator('#kingdomEn')).toHaveText(/[A-Z]/);
    await expect(page.locator('#tributeVeil .eyebrow, #moneyVeil .money-tip > small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/KINGDOM OVERVIEW|\bTRIBUTE\b|\bINCOME\b/);
    await page.screenshot({ path: `artifacts/ux-phase-b/copy-cleanup-map-${viewport.label}.png` });
    await page.locator('#kingdomClose').click();
    await page.locator('#kingdomListBtn').click();
    await expect(page.locator('.kingdom-drawer header small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/\bKINGDOMS\b/);

    await page.goto('/game.html#settings');
    await expect(page.locator('.settings-page-head h1')).toBeVisible();
    await expect(page.locator('.settings-page-head > div > small, .settings-screen .panel-head small, .settings-subhead small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/\bSETTINGS\b|SAVE DATA|\bIMPORT\b|\bDEVELOPER\b|DANGER ZONE/);
    await expectNoHorizontalOverflow(page);

    await page.goto('/game.html#team');
    await expect(page.locator('.team-screen')).toBeVisible();
    await expect(page.locator('#teamConfirmKicker')).toHaveCount(0);
    await page.locator('#banner').click();
    await expect(page.locator('.banner-picker')).toBeVisible();
    await expect(page.locator('.banner-picker-head small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/\bCONFIRM\b|CLEAR LINEUP|DELETE PRESET|>BANNER</);
    // The picker now uses localized names/status; official English is checked on the kingdom detail above.
    await expect(page.locator('.banner-opt-name b').first()).not.toBeEmpty();
    expect(await page.locator('.banner-opt-name').allTextContents()).not.toHaveLength(0);
    await page.screenshot({ path: `artifacts/ux-phase-b/copy-cleanup-team-${viewport.label}.png` });

    await page.goto('/game.html#troop');
    await expect(page.locator('.collection-heading h1')).toBeVisible();
    await expect(page.locator('.collection-heading small')).toHaveCount(0);
    expect(await bodyText(page)).not.toMatch(/THE BESTIARY/);
    await expectNoHorizontalOverflow(page);
  });
}
