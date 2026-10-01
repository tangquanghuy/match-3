import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

for (const viewport of [{ width: 1600, height: 1000 }, { width: 1100, height: 800 }, { width: 390, height: 844 }]) {
  test(`灰鸠 portrait and full couplet title at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/game.html#troop');
    await expect(page.locator('#collection')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-tab="all"]').click();
    await page.locator('#collectionSearch').fill('灰鸠');
    const card = page.locator('.collection-card');
    await expect(card).toHaveCount(1); await expect(card).toHaveClass(/r-3/); await card.click();
    await expect(page.locator('#detail')).toBeVisible();
    const title = page.locator('#spellName');
    await expect(title).toHaveClass(/spell-couplet/);
    expect(await title.textContent()).toBe('一霎惊澜雨逢客，\n半生冷月剑辞乡');
    const geometry = await title.evaluate(el => {
      const heading = el as HTMLElement;
      const header = heading.closest('.spell-head') as HTMLElement;
      const mark = header.querySelector('.spell-mark')!;
      const body = header.nextElementSibling as HTMLElement;
      const rect = heading.getBoundingClientRect();
      const headRect = header.getBoundingClientRect();
      const scale = headRect.height / header.offsetHeight;
      return {
        whiteSpace: getComputedStyle(el).whiteSpace,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
        height: heading.offsetHeight,
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
        above: (rect.top - headRect.top) / scale,
        below: (headRect.bottom - rect.bottom) / scale,
        iconGap: (rect.left - mark.getBoundingClientRect().right) / scale,
        bodyHeight: body.offsetHeight,
      };
    });
    expect(geometry.whiteSpace).toBe('pre-line');
    expect(geometry.height).toBeCloseTo(geometry.lineHeight * 2, 0);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.above).toBeGreaterThanOrEqual(17);
    expect(geometry.below).toBeGreaterThanOrEqual(17);
    expect(geometry.iconGap).toBeGreaterThanOrEqual(17);
    expect(geometry.bodyHeight).toBeGreaterThanOrEqual(220);
    for (const name of ['听雨', '续盏', '辞旧']) await expect(page.locator('#traitList')).toContainText(name);
    const image = page.locator('#portraitArt');
    await expect(image).toHaveAttribute('src', /huijiu\.webp/);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await title.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/huijiu-${viewport.width}.png`, fullPage: true });
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`灰鸠 battle title has breathing room at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('battle.gestureHintShown', '1');
      localStorage.setItem('battle.skipCastConfirm', '0');
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => {
      const app = (window as unknown as { __app?: { startupPlaying: boolean } }).__app;
      return !!app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
    });
    await page.evaluate(() => {
      const app = (window as unknown as { __app: { getEngine(): { getState(): {
        teams: { Left: { characters: Array<{ name: string; skillId: string; manaCost: number }> } }
      } } } }).__app;
      Object.assign(app.getEngine().getState().teams.Left.characters[0], { name: '灰鸠', skillId: '20019', manaCost: 16 });
    });
    await page.getByTestId('card-0').locator('.gem').click();
    const pane = page.locator('.usw.open [data-pane="spell"]');
    await pane.focus(); await page.keyboard.press('Enter');
    await expect(pane).toHaveAttribute('data-pos', 'center');
    const title = pane.locator('h3.spell-couplet');
    await expect(title).toBeVisible();
    const geometry = await title.evaluate(el => {
      const header = el.closest('.usw-pane-head') as HTMLElement;
      return {
        lines: (el as HTMLElement).offsetHeight / parseFloat(getComputedStyle(el).lineHeight),
        padding: parseFloat(getComputedStyle(header).paddingTop),
        titleWidth: el.scrollWidth,
        availableWidth: el.parentElement!.clientWidth,
        redundantManaLabel: getComputedStyle(el.parentElement!.querySelector('small')!).display,
      };
    });
    expect(geometry.lines).toBeCloseTo(2, 1);
    expect(geometry.padding).toBeGreaterThanOrEqual(12);
    expect(geometry.titleWidth).toBeLessThanOrEqual(geometry.availableWidth + 1);
    expect(geometry.redundantManaLabel).toBe('none');
    await page.screenshot({ path: `artifacts/huijiu-battle-${viewport.width}.png` });
  });
}
