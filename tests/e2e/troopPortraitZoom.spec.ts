import { expect, test, type Page } from '@playwright/test';

async function openTroopDetail(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto('/game.html#troop/6000');
  await expect(page.locator('#detail')).toBeVisible();
  await expect.poll(() => page.locator('#portraitArt').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
}

for (const viewport of [{ width: 1600, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width} 宽度：点击详情卡放大后只显示完整立绘，可用 Esc 和关闭按钮退出`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTroopDetail(page);

    const original = page.locator('#portraitArt');
    const expand = page.locator('#portraitExpand');
    const src = await original.getAttribute('src');
    await expand.click({ position: { x: 100, y: 120 } });

    const zoom = page.locator('#portraitZoom');
    const artwork = page.locator('#portraitZoomArt');
    await expect(zoom).toHaveAttribute('open', '');
    await expect(zoom).toHaveCSS('background-color', 'rgb(9, 12, 19)');
    await expect(artwork).toHaveAttribute('src', src!);
    await expect(artwork).toHaveAttribute('alt', await original.getAttribute('alt') ?? '');
    await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(zoom.locator(':scope > *')).toHaveCount(2);
    await expect(zoom.locator('.card-name, .card-stats, .card-level')).toHaveCount(0);
    await expect(artwork).toHaveCSS('object-fit', 'contain');
    const bounds = await artwork.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);

    await page.keyboard.press('Escape');
    await expect(zoom).not.toBeVisible();
    await expect(expand).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(zoom).toBeVisible();
    await page.locator('#portraitZoomClose').click();
    await expect(zoom).not.toBeVisible();
  });
}

test('点击遮罩退出，预览中的图片继续沿原卡兜底链加载', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/static/portraits/**', (route) => route.abort());
  await page.route('https://rpg.bolt.qzz.io/**', (route) => route.abort());
  await page.goto('/game.html#troop/6000');
  const original = page.locator('#portraitArt');
  await expect.poll(() => original.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#portraitExpand').click();
  const artwork = page.locator('#portraitZoomArt');
  await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(artwork).toHaveAttribute('src', await original.getAttribute('src') ?? '');
  await page.locator('#portraitZoom').click({ position: { x: 3, y: 3 } });
  await expect(page.locator('#portraitZoom')).not.toBeVisible();
});

test('白鹭依晞图鉴卡和放大视图都加载独立立绘', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto('/game.html#troop/10001');
  await expect(page.locator('#cardName')).toHaveText('白鹭依晞');
  await expect(page.locator('#rarityLabel')).toHaveText('传说');
  await expect(page.locator('#cardType')).toContainText('异界来客 · 时空裂隙');
  await expect(page.locator('#spellName')).toHaveText('离岸封函');

  const portrait = page.locator('#portraitArt');
  await expect(portrait).toHaveAttribute('src', /bailu-yixi\.webp/);
  await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#portraitExpand').click();
  const zoomArt = page.locator('#portraitZoomArt');
  await expect(page.locator('#portraitZoom')).toBeVisible();
  await expect(zoomArt).toHaveAttribute('src', await portrait.getAttribute('src') ?? '');
  await expect.poll(() => zoomArt.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

// The missing artworks used to be cached as 404 for seven days, sending these
// cards down the shared demo fallback chain even after the files were deployed.
for (const [id, name, portrait] of [[6016, '\u4eba\u9a6c\u65a5\u5019', 'Troop_K04_00'], [6028, '\u5973\u796d\u53f8', 'Troop_K07_00']] as const) {
  test(`${name} displays its own release-versioned artwork, not a shared demo fallback`, async ({ page }) => {
    await page.goto(`/game.html#troop/${id}`);
    await expect(page.locator('#cardName')).toHaveText(name);
    const image = page.locator('#portraitArt');
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveAttribute('src', new RegExp(`/static/portraits/${portrait}\\.webp\\?v=[a-z0-9]+$`));
  });
}

test('collection cards keep their own artwork after previously missing portraits are published', async ({ page }) => {
  await page.goto('/game.html#troop');
  await page.locator('#collection [data-tab="all"]').click();
  for (const [id, name, portrait] of [[6016, '\u4eba\u9a6c\u65a5\u5019', 'Troop_K04_00'], [6028, '\u5973\u796d\u53f8', 'Troop_K07_00']] as const) {
    await page.locator('#collectionSearch').fill(name);
    const image = page.locator(`[data-troop="${id}"] img`).first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveAttribute('src', new RegExp(`/static/portraits/${portrait}\\.webp\\?v=[a-z0-9]+$`));
  }
});
