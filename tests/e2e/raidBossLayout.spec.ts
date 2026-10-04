import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`raid boss modes have distinct actions and bounded layout at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('/game.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.goto('/game.html#events/raidBoss');
    await expect(page.locator('.evm-raid')).toBeVisible();
    await expect(page.locator('.evm-raid [data-fight]')).toHaveCount(1);
    await expect(page.locator('.evm-raid [data-fight="raid"]')).toHaveCount(1);
    await expect(page.locator('.evm-raid [data-act^="ingot-tier:"]')).toHaveCount(0);
    const bossLayout = await page.locator('.rd-content').evaluate(root => {
      const panel = root.querySelector('.rd-panel')!;
      return { overflowX: root.scrollWidth - root.clientWidth, panelOverflow: panel.scrollHeight - panel.clientHeight };
    });
    expect(bossLayout.overflowX).toBeLessThanOrEqual(2);
    if (viewport.width > 999) expect(bossLayout.panelOverflow).toBeLessThanOrEqual(12);
    await page.screenshot({ path: `test-results/raid-boss-${viewport.width}.png` });

    await page.locator('a.rd-mode-link[href="#events/raidBoss/forge"]').click();
    await expect(page).toHaveURL(/#events\/raidBoss\/forge$/);
    await expect(page.locator('.evm-raid-forge')).toBeVisible();
    await expect(page.locator('.evm-raid-forge [data-fight]')).toHaveCount(1);
    await expect(page.locator('.evm-raid-forge [data-fight="ingot"]')).toHaveCount(1);
    await expect(page.locator('.evm-raid-forge [data-fight="ingot"]')).toHaveText(/挑战/);
    await expect(page.locator('.evm-raid-forge [data-fight="ingot"]')).not.toHaveText(/当前难度/);
    await expect(page.locator('.rd-forge-art img')).toHaveJSProperty('complete', true);
    expect(await page.locator('.rd-forge-art img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.locator('.rd-forge').evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toContain('bg-raid');
    await expect(page.locator('.evm-raid-forge .rd-forge-step')).toHaveCount(2);
    await expect(page.locator('.evm-raid-forge .rd-forge-range')).toHaveAttribute('max', '12');
    await expect(page.locator('.evm-raid-forge .rd-stage')).toHaveCount(0);
    await page.locator('.rd-forge-range').fill('10');
    await expect(page.locator('.rd-forge-range')).toHaveValue('10');
    await expect(page.locator('.rd-forge-feature')).toContainText('10');
    await expect(page.locator('.rd-forge-feature')).toContainText('Lv.');
    await page.locator('.rd-forge-step').nth(1).click();
    await expect(page.locator('.rd-forge-range')).toHaveValue('11');
    await page.locator('.rd-forge-step').first().click();
    await expect(page.locator('.rd-forge-range')).toHaveValue('10');
    const forgeLayout = await page.locator('.rd-forge').evaluate(root => ({
      overflowX: root.scrollWidth - root.clientWidth, overflowY: root.scrollHeight - root.clientHeight,
    }));
    expect(forgeLayout.overflowX).toBeLessThanOrEqual(2);
    if (viewport.width > 999) expect(forgeLayout.overflowY).toBeLessThanOrEqual(12);
    if (viewport.width <= 390) {
      const fightBox = await page.locator('.evm-raid-forge [data-fight="ingot"]').boundingBox();
      expect(fightBox!.y + fightBox!.height).toBeLessThan(viewport.height - 54);
    }    await page.screenshot({ path: `test-results/raid-forge-${viewport.width}.png` });
    await page.locator('a.rd-mode-link[href="#events/raidBoss"]').click();
    await expect(page.locator('.evm-raid [data-fight="raid"]')).toHaveCount(1);
    await page.locator('a.rd-mode-link[href="#events/raidBoss/forge"]').click();
    await expect(page.locator('.rd-forge-range')).toHaveValue('10');
  });
}
