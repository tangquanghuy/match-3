import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

async function seedRoster(page: Page) {
  await page.goto('/game.html#troop/6000');
  await expect(page.locator('#detailFavorite')).toBeVisible();
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const { newSave } = await load('/src/meta/state/schema.ts');
    const save = newSave({ now: Date.now(), starterTroopIds: [6000, 6097, 6457] });
    save.collection[6097].level = 10;
    save.collection[6457].level = 7;
    await metaGateway().dev.importSaveJson(JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#detailFavorite')).toHaveAttribute('aria-pressed', 'false');
}

test('收藏随存档保留，编队优先排序且筛选仍生效，取消恢复普通排序', async ({ page }) => {
  await seedRoster(page);
  await page.locator('#detailFavorite').click();
  await expect(page.locator('#detailFavorite')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#detailFavoriteLabel')).toHaveText('已收藏');
  await page.goto('/game.html#troop/6457');
  await page.locator('#detailFavorite').click();
  await expect(page.locator('#detailFavorite')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/game.html#team');
  const ids = () => page.locator('#roster .mini').evaluateAll(els => els.map(el => (el as HTMLElement).dataset.id));
  await expect(page.locator('#roster .mini')).toHaveCount(4);
  expect((await ids()).slice(0, 3)).toEqual(['6457', '6000', '6097']);
  await expect(page.locator('#roster .mini-favorite')).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/troop-favorites-team.png' });
  await page.locator('#sortRoster').selectOption('name');
  expect((await ids()).slice(0, 2)).toEqual(await page.evaluate(async () => {
    const path = '/src/data/troops.ts';
    const { getTroopById } = await import(/* @vite-ignore */ path);
    return [6000, 6457].sort((a, b) => getTroopById(a).name.localeCompare(getTroopById(b).name, 'zh-Hans-CN')).map(String);
  }));
  await page.locator('[data-filter="hero"]').click();
  expect(await ids()).toEqual(['hero']);
  await page.locator('[data-filter="all"]').click();
  const name = await page.evaluate(async () => {
    const path = '/src/data/troops.ts';
    const { getTroopById } = await import(/* @vite-ignore */ path);
    return getTroopById(6097).name;
  });
  await page.locator('#searchInput').fill(name);
  expect(await ids()).toEqual(['6097']);
  await page.goto('/game.html#troop/6000');
  await expect(page.locator('#detailFavorite')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#detailFavorite').click();
  await expect(page.locator('#detailFavorite')).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/game.html#team');
  await page.locator('#sortRoster').selectOption('level');
  expect((await ids()).slice(0, 3)).toEqual(['6457', '6097', '6000']);
});

for (const width of [1600, 390, 320]) {
  test(`图鉴收藏按钮可操作且标题栏无重叠 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1600 ? 900 : 844 });
    await seedRoster(page);
    await page.locator('#detailFavorite').click();
    await expect(page.locator('#detailFavorite')).toHaveAttribute('aria-pressed', 'true');
    const layout = await page.locator('#detail .page-heading').evaluate(el => {
      const elements = ['#back', '#detailFavorite', '#detailWishlist', '.heading-center'].map(sel => el.querySelector<HTMLElement>(sel)!)
        .filter(node => getComputedStyle(node).display !== 'none');
      const rects = elements.map(node => node.getBoundingClientRect());
      return {
        inView: rects.every(r => r.left >= 0 && r.right <= window.innerWidth),
        overlap: rects.some((a, i) => rects.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)),
      };
    });
    expect(layout).toEqual({ inView: true, overlap: false });
    const topIcons = await page.locator('.topbar .orb').evaluateAll(buttons => buttons.map(button => {
      const outer = button.getBoundingClientRect();
      const inner = button.querySelector('[data-icon]')!.getBoundingClientRect();
      return { x: Math.abs(outer.left + outer.width / 2 - inner.left - inner.width / 2),
        y: Math.abs(outer.top + outer.height / 2 - inner.top - inner.height / 2) };
    }));
    expect(topIcons.every(offset => offset.x <= 0.5 && offset.y <= 0.5)).toBe(true);
    await page.screenshot({ path: `artifacts/troop-favorite-detail-${width}.png` });
  });
}
