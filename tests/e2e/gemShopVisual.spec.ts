import { expect, test, type Page } from '@playwright/test';

async function openCleanShop(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto('/game.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto('/game.html#events');
  await page.locator('[data-nav="商店"]').click();
  await expect(page.locator('.event-shop-panel')).toBeVisible();
  await page.locator('.market-switch a[href="#shop/gems"]').click();
  await expect(page.locator('.gem-shop-panel')).toBeVisible();
  await expect(page.locator('.gem-shop-grid')).toHaveAttribute('data-page-size', /[1-9]/);
}

test('宝石商店可从底栏进入、查看武器详情并按新价格购买', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  await expect(page.locator('[data-nav="商店"]')).toHaveClass(/active/);
  await expect(page.locator('.market-switch a.active')).toContainText('宝石商店');

  await page.evaluate(() => {
    const key = 'gems.meta.save';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.currencies.gems = 5_000;
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();

  const weapon = page.locator('[data-inspect-weapon="gw_ShatteredBlade"]');
  await expect(weapon.locator('.gem-shop-price')).toContainText('2,400');
  await weapon.click();
  const detail = page.locator('[data-gem-detail="gw_ShatteredBlade"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.gem-shop-detail-stats > .hero-stat')).toHaveCount(4);
  await expect(detail.locator('.gem-shop-detail-spell')).toBeVisible();
  await expect(detail.locator('.gem-shop-detail-purchase')).toContainText('2,400');
  expect((await detail.locator('.gem-shop-detail-purchase').innerText()).match(/2,400/g)).toHaveLength(1);
  await expect(detail.locator('.gem-shop-buy')).toHaveText('购买');
  for (const icon of ['swords', 'shield', 'heart', 'orb']) {
    await expect(detail.locator(`.gem-shop-detail-stats [data-icon="${icon}"] svg`)).toBeVisible();
  }
  const labels = detail.locator('.gem-shop-detail-stats > .hero-stat');
  expect(await labels.evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)';
  }))).toBe(true);
  await detail.locator('[data-buy-weapon="gw_ShatteredBlade"]').click();
  await expect(page.locator('.gem-shop-balance')).toContainText('2,600');
  await expect(page.locator('[data-gem-detail="gw_ShatteredBlade"] .gem-shop-buy')).toHaveText('已拥有');
  await page.locator('.gem-shop-back').click();
  await expect(page.locator('[data-inspect-weapon="gw_ShatteredBlade"]')).toContainText('已拥有');
});

test('手机端武器详情可打开并关闭，购买操作不被裁切', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCleanShop(page);
  const weapon = page.locator('[data-inspect-weapon="gw_ShatteredBlade"]');
  await weapon.click();
  await expect(page.locator('.gem-shop-panel')).toHaveClass(/is-detail-page/);
  const detail = page.locator('[data-gem-detail="gw_ShatteredBlade"]');
  await expect(detail).toBeVisible();
  await detail.locator('.gem-shop-buy').scrollIntoViewIfNeeded();
  await expect(detail.locator('.gem-shop-buy')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gem-shop-panel')).not.toHaveClass(/is-detail-page/);
  await weapon.click();
  await page.locator('.gem-shop-back').click();
  await expect(page.locator('.gem-shop-panel')).not.toHaveClass(/is-detail-page/);
});

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`paginated shelf fits ${viewport.width}x${viewport.height} without scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCleanShop(page);
    const grid = page.locator('.gem-shop-grid');
    await expect(grid.locator('.gem-shop-card').first()).toBeVisible();
    await expect(page.locator('[data-gem-page="-1"]')).toBeDisabled();
    await expect(page.locator('.gem-shop-pagination')).toBeInViewport();
    await expect.poll(() => page.evaluate(() => {
      return ['.gem-shop-panel', '.gem-shop-catalog', '.gem-shop-grid'].every(selector => {
        const el = document.querySelector<HTMLElement>(selector)!;
        return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
      });
    })).toBe(true);
    const first = await grid.locator('.gem-shop-card').first().getAttribute('data-inspect-weapon');
    await page.locator('.gem-shop-page-controls button').last().click();
    await expect(grid.locator('.gem-shop-card').first()).not.toHaveAttribute('data-inspect-weapon', first!);
    await expect(page.locator('.gem-shop-page-label b')).toHaveText('2');
    await page.locator('.gem-shop-page-controls button').first().click();
    await expect(grid.locator('.gem-shop-card').first()).toHaveAttribute('data-inspect-weapon', first!);
    await page.locator('.gem-shop-panel img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => undefined))));
    await page.screenshot({ path: `artifacts/gem-shop-pagination/shop-${viewport.width}x${viewport.height}.png` });
  });
}

test('all products are reachable exactly once and filters reset pagination', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  const total = Number(await page.locator('.gem-shop-tab.is-active b').textContent());
  const seen: string[] = [];
  for (let i = 0; i < 100; i++) {
    seen.push(...await page.locator('[data-inspect-weapon]').evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.inspectWeapon!)));
    const next = page.locator('.gem-shop-page-controls button').last();
    if (await next.isDisabled()) break;
    await next.click();
    await expect(page.locator('.gem-shop-page-label b')).toHaveText(String(i + 2));
  }
  expect(seen).toHaveLength(total);
  expect(new Set(seen).size).toBe(total);
  await page.locator('.gem-shop-tab[href="#shop/gems/Mythic"]').click();
  await expect(page.locator('.gem-shop-page-label b')).toHaveText('1');
  await expect(page.locator('.gem-shop-page-controls button').first()).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.gem-shop-grid').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await expect(page.locator('.gem-shop-pagination')).toBeInViewport();
});

test('chest navigation contains only the two chest categories', async ({ page }) => {
  await page.goto('/game.html#chests/keys');
  await expect(page.locator('.chest-tab')).toHaveCount(2);
  await expect(page.locator('.chest-tabs a[href="#shop/gems"]')).toHaveCount(0);
  await page.locator('.chest-tabs a[href="#chests/gems"]').click();
  await expect(page.locator('.chest-tab.active')).toHaveAttribute('href', '#chests/gems');
  await page.screenshot({ path: 'artifacts/gem-shop-pagination/chests-two-tabs.png' });
});

test('purchase on a later page retains the page and selected weapon', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.currencies.gems = 100_000;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('.gem-shop-grid')).toHaveAttribute('data-page-size', /[1-9]/);
  await page.locator('.gem-shop-page-controls button').last().click();
  await expect(page.locator('.gem-shop-page-label b')).toHaveText('2');
  const card = page.locator('.gem-shop-card:not(.is-owned)').first();
  const id = await card.getAttribute('data-inspect-weapon');
  await card.click();
  await page.locator(`[data-buy-weapon="${id}"]`).click();
  await expect(page.locator(`[data-gem-detail="${id}"] .gem-shop-buy`)).toBeDisabled();
  await page.locator('.gem-shop-back').click();
  await expect(page.locator(`[data-inspect-weapon="${id}"]`)).toHaveClass(/selected.*is-owned/);
  await expect(page.locator('.gem-shop-page-label b')).toHaveText('2');
});

test('detail survives viewport changes and returns to the selected weapon', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCleanShop(page);
  const card = page.locator('.gem-shop-card').first();
  const id = await card.getAttribute('data-inspect-weapon');
  await card.click();
  await expect(page.locator('.gem-shop-panel')).toHaveClass(/is-detail-page/);
  await expect(page.locator('.gem-shop-catalog')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.gem-shop-panel')).toHaveClass(/is-detail-page/);
  await expect(page.locator('.gem-shop-buy')).toBeInViewport();
  await page.locator('.gem-shop-back').click();
  await expect(page.locator(`[data-inspect-weapon="${id}"]`)).toBeFocused();
});

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`standalone weapon detail is readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCleanShop(page);
    await expect(page.locator('.gem-shop-detail')).toHaveCount(0);
    if (await page.locator('[data-inspect-weapon="gw_FireSword"]').count() === 0) {
      await page.locator('.gem-shop-page-controls button').last().click();
    }
    await page.locator('[data-inspect-weapon="gw_FireSword"]').click();
    await expect(page).toHaveURL(/#shop\/gems\/weapon\/gw_FireSword$/);
    await expect(page.locator('.gem-shop-catalog')).toHaveCount(0);
    await expect(page.locator('.gem-shop-detail')).toBeVisible();
    await expect(page.locator('.gem-shop-detail-spell h3')).toHaveText('武器技能');
    await expect(page.locator('.gem-shop-detail-spell p')).toBeInViewport();
    await expect(page.locator('.gem-shop-buy')).toBeInViewport();
    await expect(page.locator('.gem-shop-back')).toBeInViewport();
    if (viewport.width >= 768) {
      await expect.poll(() => page.locator('.gem-shop-detail-info').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      expect(await page.locator('.gem-shop-detail-spell p').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17);
    }
    await page.locator('.gem-shop-detail img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => undefined))));
    await page.screenshot({ path: `artifacts/gem-shop-pagination/detail-${viewport.width}x${viewport.height}.png` });
    await page.locator('.gem-shop-back').click();
    await expect(page.locator('[data-inspect-weapon="gw_FireSword"]')).toBeFocused();
  });
}

test('detail route preserves category and page through history and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  await page.locator('.gem-shop-tab[href="#shop/gems/Epic"]').click();
  await page.locator('.gem-shop-page-controls button').last().click();
  await expect(page.locator('.gem-shop-page-label b')).toHaveText('2');
  const id = await page.locator('.gem-shop-card').first().getAttribute('data-inspect-weapon');
  await page.locator('.gem-shop-card').first().click();
  await expect(page).toHaveURL(new RegExp(`#shop/gems/Epic/weapon/${id}$`));
  await page.goBack();
  await expect(page.locator('.gem-shop-page-label b')).toHaveText('2');
  await expect(page.locator('.gem-shop-tab.is-active')).toHaveAttribute('href', '#shop/gems/Epic');
  await page.goForward();
  await expect(page.locator(`[data-gem-detail="${id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-gem-detail="${id}"]`)).toBeVisible();
  await page.locator('.gem-shop-back').click();
  await expect(page.locator('.gem-shop-page-label b')).toHaveText('2');
  await expect(page.locator(`[data-inspect-weapon="${id}"]`)).toBeFocused();
});

test('unknown detail route has a usable return link', async ({ page }) => {
  await page.goto('/game.html#shop/gems/weapon/not-a-weapon');
  await expect(page.locator('.gem-shop-empty')).toBeVisible();
  await page.locator('.gem-shop-back').click();
  await expect(page.locator('.gem-shop-grid')).toBeVisible();
});


test('余额不足时保留售价与缺口，技能标题不重复武器名', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openCleanShop(page);
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.currencies.gems = 1_000;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.goto('/game.html#shop/gems/weapon/gw_ShatteredBlade');
  await page.reload();
  const purchase = page.locator('.gem-shop-detail-purchase');
  await expect(purchase).toContainText('2,400');
  expect((await purchase.innerText()).match(/2,400/g)).toHaveLength(1);
  await expect(purchase.locator('button')).toHaveText('还差 1,400 宝石');
  await expect(purchase.locator('button')).toBeDisabled();
  await expect(purchase.locator('button')).toBeInViewport();
  await expect(page.locator('.gem-shop-detail-spell h3')).toHaveText('武器技能');
  await expect(page.locator('.gem-shop-detail-stats > .hero-stat')).toHaveCount(4);
  for (const label of ['攻击', '护甲', '生命', '魔力']) {
    await expect(page.locator(`.gem-shop-detail-stats [title="${label}"]`)).toBeInViewport();
  }
});
