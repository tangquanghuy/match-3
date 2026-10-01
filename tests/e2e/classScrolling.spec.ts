import { expect, test } from '@playwright/test';

for (const [width, height] of [[1600, 900], [768, 1024], [390, 844], [390, 640]] as const) {
  test(`Class directory and details use one vertical scroll ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.goto('/game.html#classes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hc-class-row').first()).toBeVisible();

    const verticalScrollers = async () => page.locator('.classes-screen').evaluate(screen =>
      [...screen.querySelectorAll<HTMLElement>('*')].filter(node => {
        const overflow = getComputedStyle(node).overflowY;
        return (overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1;
      }).map(node => node.className));

    expect((await verticalScrollers()).filter(name => name !== 'hc-scroll')).toEqual([]);
    await page.locator('.hc-class-row').first().click();
    await expect(page.locator('.hc-tree-panel')).toBeVisible();
    expect(await verticalScrollers()).toEqual(['hc-scroll']);

    const tree = page.locator('.hc-tree-panel .tree-body');
    expect(await tree.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    await page.locator('.hc-scroll').evaluate(node => node.scrollTop = 0);
    const rect = await tree.boundingBox();
    expect(rect).not.toBeNull();
    await page.mouse.move(rect!.x + 35, Math.min(rect!.y + 65, height - 25));
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.locator('.hc-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.locator('.hc-scroll').evaluate(node => node.scrollTop = node.scrollHeight);
    if (width < 700) {
      expect(await tree.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
      await tree.evaluate(node => node.scrollLeft = node.scrollWidth);
      expect(await tree.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    }
    await expect(tree.locator('.talent-cell').last()).toBeInViewport();
    await page.locator('[data-tab="traits"]').click();
    expect((await verticalScrollers()).filter(name => name !== 'hc-scroll')).toEqual([]);
    await page.locator('.hc-scroll').evaluate(node => node.scrollTop = node.scrollHeight);
    await expect(page.locator('.hc-traits .hc-trait').last()).toBeInViewport();
  });
}
