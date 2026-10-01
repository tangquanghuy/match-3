import { expect, test } from '@playwright/test';

for (const width of [1600, 390, 320]) {
  test(`秘法实图：背包21种、商店共用资源与手机详情 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('/game.html#bag/stones/arcane');
    await expect(page.locator('.bag-section-head h2')).toHaveText('秘法属性石');
    await expect(page.locator('.bag-item')).toHaveCount(19);
    const urls: string[] = [];
    for (let current = 1; current <= 2; current++) {
      const images = page.locator('.bag-item-art img');
      await expect(images).toHaveCount(current === 1 ? 19 : 2);
      await expect(page.locator('.bag-item-art svg')).toHaveCount(0);
      const unownedArt = page.locator('.bag-item.empty[data-bag-item^="arcane:"] .bag-item-art');
      expect(await unownedArt.count()).toBeGreaterThan(0);
      expect(await unownedArt.evaluateAll(nodes => nodes.every(node => {
        const style = getComputedStyle(node);
        return style.filter === 'none' && Number(style.opacity) >= 0.7;
      }))).toBe(true);
      await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => {
        const image = node as HTMLImageElement;
        return image.complete && image.naturalWidth === 256 && image.naturalHeight === 256;
      }))).toBe(true);
      urls.push(...await images.evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src)));
      if (current === 1) {
        await page.screenshot({ path: `artifacts/explore-art/bag-arcane-${width}.png` });
        await page.getByRole('link', { name: '下一页', exact: true }).click();
      }
    }
    expect(new Set(urls).size).toBe(21);
    await page.locator('.bag-item').last().click();
    await expect(page.locator('.bag-detail-card:visible h3')).toHaveText('秘法深渊属性石');
    await expect(page.locator('.bag-detail-card:visible img')).toHaveAttribute('src', /stone-arcane-brown-brown.*\.webp/);
    if (width <= 640) await page.locator('.bag-detail-close').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.goto('/game.html#materials/gold');
    await expect(page.locator('.material-shop')).toBeVisible();
    const tier = page.locator('[data-tier="arcane"]');
    await tier.click();
    const shopArt = page.locator('.material-list img');
    await expect(shopArt).toHaveCount(21);
    expect(await shopArt.evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src))).toEqual(urls);
    await page.screenshot({ path: `artifacts/explore-art/shop-arcane-${width}.png` });
  });
}
