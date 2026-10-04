import { expect, test, type Page } from '@playwright/test';

async function openShop(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/game.html#materials/gold');
  await expect(page.locator('.material-shop')).toBeVisible();
}

for (const width of [1600, 768, 390, 320]) {
  test(`材料商店：目录、正式定价与完整明细 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
    await openShop(page);
    await expect(page.locator('.market-switch a')).toHaveCount(3);
    for (const selector of ['.topbar', '.bottom-bar', '.bottom-bar nav']) {
      const el = page.locator(selector);
      await expect(el).toBeInViewport({ ratio: 1 });
      expect(await el.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    }
    for (const nav of await page.locator('.bottom-bar nav button').all()) await expect(nav).toBeInViewport({ ratio: 1 });
    if (width <= 640) await expect(page.locator('.top-title')).toBeHidden();
    let total = 0;
    for (const [tier, count] of [['minor', 6], ['major', 6], ['runic', 6], ['arcane', 21], ['celestial', 1]] as const) {
      await page.locator(`[data-tier="${tier}"]`).click();
      await expect(page.locator('[data-stone]')).toHaveCount(count);
      total += count;
      await page.locator('[data-stone]').last().click();
      await expect(page.locator('[data-stone]').last()).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#materialBuy').scrollIntoViewIfNeeded();
      const prices = { minor: 3000, major: 12000, runic: 60000, arcane: 500000, celestial: 2000000 };
      await expect(page.locator('#materialBuy')).toHaveText(`${prices[tier].toLocaleString()} 金币 · 购买`);
      await expect(page.locator('#materialBuy')).toBeInViewport({ ratio: 1 });
      const overflow = await page.locator('.material-shop').evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.locator('.material-body').evaluate(el => { el.scrollTop = 0; });
    }
    expect(total).toBe(40);
    await page.locator('[data-tier="arcane"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/material-shop/gold-${width}.png` });
  });
}

test('整套礼包按神话真实颜色配齐，已解锁特质退出配方，不设置培养目标', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openShop(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    s.collection['6169'] = { copies: 1, level: 1, ascension: 0, traits: [false, false, false], locked: false };
    s.materials.traitstones['arcane:blue:green'] = 99;
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.goto('/game.html#materials/gems/6169');
  await page.reload();
  await expect(page.locator('#materialTroop')).toHaveCount(0);
  await expect(page.locator('#materialFamily option:checked')).toHaveText('神话 · 双秘法');
  await expect(page.locator('[data-bundle][aria-pressed=true]')).toHaveCount(1);
  const receipt = page.locator('.material-contents');
  await expect(receipt.locator('li').filter({ hasText: '持有 99' })).toContainText('×21');
  await expect(receipt.locator('b').filter({ hasText: /^×21$/ })).toHaveCount(2);
  await expect(receipt.locator('li').filter({ hasText: '圣辉石' })).toContainText('×4');
  await expect(page.locator('#materialStage')).toHaveValue('7');
  await page.locator('#materialBuy').scrollIntoViewIfNeeded();
  await expect(page.locator('#materialBuy')).toHaveText('3,480 宝石 · 购买');
  await expect(page.locator('#materialBuy')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'artifacts/material-shop/mythic-390.png' });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    s.collection['6169'].traits = [true, true, false];
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator('#materialStage')).toHaveValue('4');
  await expect(receipt.locator('b').filter({ hasText: /^×21$/ })).toHaveCount(0);
  await page.locator('.material-back').click();
  await expect(page.locator('.trait-material-link')).toHaveAttribute('href', '#materials/gems/6169');
  await page.locator('.trait-material-link').click();
  await expect(page.locator('#materialTroop')).toHaveCount(0);
  await expect(page.locator('#materialFamily option:checked')).toHaveText('神话 · 双秘法');
  await expect(page.locator('[data-bundle][aria-pressed=true]')).toHaveCount(1);
});

test('arcane stone bag lists all 21 stones and current explore sources', async ({ page }) => {
  await openShop(page);
  await page.goto('/game.html#bag/stones/arcane');
  await expect(page.locator('.bag-stone-filters [aria-current]')).toHaveText('秘法');
  await expect(page.locator('.bag-item')).toHaveCount(19);
  await expect(page.locator('.bag-detail-card:visible')).toContainText('王国探索掉落');
  await expect(page.locator('.bag-detail-card:visible')).not.toContainText('里程碑');
  await page.getByRole('link', { name: '下一页', exact: true }).click();
  await expect(page.locator('.bag-item')).toHaveCount(2);
  await expect(page.locator('.bag-pagination')).toContainText('2 / 2');
  await page.locator('.bag-stone-filters a').filter({ hasText: '圣辉' }).click();
  await expect(page.locator('.bag-item')).toHaveCount(1);
});

test('活动奖励子页展示真实难度与独立周额度', async ({ page }) => {
  await openShop(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!); s.hero.level = 20;
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.goto('/game.html#events/raidBoss/rewards'); await page.reload();
  await expect(page.locator('.ev-high-tier')).toContainText('Lv.50+');
  await expect(page.locator('.ev-high-tier')).toContainText('本周 0 / 4');
  await expect(page.locator('.ev-high-tier')).toContainText('本周 0 / 2');
  await page.goto('/game.html#events/towerOfDoom/rewards');
  const bossRewards = page.locator('.ev-high-tier').filter({ hasText: '三区通关材料' });
  await expect(page.locator('.ev-high-tier')).toHaveCount(1);
  for (const floor of [8, 16, 25]) await expect(bossRewards).toContainText(`第 ${floor} 层`);
});


test('金币跨优惠额度正确扣费、重载保留并恢复原价', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openShop(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    s.currencies.gold = 10_000_000;
    s.materialShop = { arcaneIntroPurchased: 82, gemBundlesPurchased: 0 };
    s.materials.traitstones['arcane:blue:blue'] = 0;
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.reload();
  await page.locator('[data-tier="arcane"]').click();
  await page.locator('[data-stone="arcane:blue:blue"]').click();
  await page.locator('#materialCount').fill('5');
  await page.locator('#materialCount').press('Tab');
  await expect(page.locator('.material-promo-badge')).toHaveText('秘法优惠');
  await expect(page.locator('.material-price')).toContainText('本次 2 颗享 500,000 金币优惠价 · 3 颗按原价');
  await expect(page.locator('#materialBuy')).toHaveText('4,000,000 金币 · 购买');
  await page.locator('#materialBuy').click();
  await expect(page.locator('.acquisition-dialog')).toContainText('材料已入库');
  await expect(page.locator('.acquisition-dialog')).toContainText('×5');
  await page.locator('.acquisition-dialog footer button').click();
  await expect(page.locator('.material-promo-badge')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    return [s.currencies.gold, s.materialShop.arcaneIntroPurchased, s.materials.traitstones['arcane:blue:blue']];
  })).toEqual([6_000_000, 84, 5]);
  await page.reload();
  await page.locator('[data-tier="arcane"]').click();
  await page.locator('#materialBuy').scrollIntoViewIfNeeded();
  await expect(page.locator('.material-promo-badge')).toHaveCount(0);
  await expect(page.locator('#materialBuy')).toHaveText('1,000,000 金币 · 购买');
  await page.screenshot({ path: 'artifacts/material-shop/priced-390.png' });
});

test('宝石整套成交按真实配方入库，不消耗金币秘法优惠；余额不足禁购', async ({ page }) => {
  await openShop(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    s.currencies.gems = 5000;
    s.materials.traitstones = {};
    s.collection['6169'] = { copies: 1, level: 1, ascension: 0, traits: [false, false, false], locked: false };
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.goto('/game.html#materials/gems/6169'); await page.reload();
  await expect(page.locator('#materialBuy')).toHaveText('3,480 宝石 · 购买');
  await expect(page.locator('.material-promo-badge')).toHaveText('神话首单 3 折');
  await expect(page.locator('.material-price-row del')).toHaveText('11,480 宝石');
  await page.locator('#materialBuy').click();
  await expect(page.locator('#materialBuy')).toBeDisabled();
  await expect(page.locator('.material-promo-badge')).toHaveText('神话第 2 单 5 折');
  await expect(page.locator('#materialBuy')).toHaveText('5,780 宝石 · 购买');
  expect(await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    return [s.currencies.gems, s.materialShop.arcaneIntroPurchased, s.materialShop.gemBundlesPurchased, s.materials.traitstones];
  })).toEqual([1520, 0, 1, { 'minor:blue': 24, 'major:blue': 64, 'runic:blue': 16, 'arcane:blue:green': 21, 'arcane:blue:red': 21, celestial: 4 }]);
});

for (const width of [1600, 768, 390, 320]) {
  test(`按组合目录浏览，不随上千部队膨胀 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
    await openShop(page);
    await page.evaluate(async () => {
      const path = '/src/data/troops.ts';
      const { TROOPS } = await import(/* @vite-ignore */ path);
      const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
      for (const troop of TROOPS) s.collection[String(troop.id)] = { copies: 1, level: 1, ascension: 0, traits: [false, false, false], locked: false };
      localStorage.setItem('gems.meta.save', JSON.stringify(s));
    });
    await page.goto('/game.html#materials/gems'); await page.reload();
    await expect(page.locator('#materialTroop')).toHaveCount(0);
    await expect(page.locator('#materialFamily option')).toHaveCount(13);
    await expect(page.locator('[data-bundle]')).toHaveCount(5);
    await page.locator('#materialFamily').selectOption({ label: '神话 · 双秘法' });
    await expect(page.locator('[data-bundle]')).toHaveCount(5);
    await page.locator('[data-color="blue"]').click();
    const first = await page.locator('[data-bundle]').first().getAttribute('data-bundle');
    await page.locator('[data-page="1"]').click();
    await expect(page.locator('.material-pages')).toContainText('2 /');
    expect(await page.locator('[data-bundle]').first().getAttribute('data-bundle')).not.toBe(first);
    await page.locator('[data-bundle]').first().click();
    await expect(page.locator('#materialBuy')).toHaveText('3,480 宝石 · 购买');
    const selected = await page.locator('[data-bundle][aria-pressed=true]').getAttribute('data-bundle');
    const contents = await page.locator('.material-contents').innerText();
    await page.reload();
    await expect(page.locator('[data-bundle][aria-pressed=true]')).toHaveAttribute('data-bundle', selected!);
    await expect(page.locator('.material-contents')).toHaveText(contents, { useInnerText: true });
    await expect(page.locator('#materialStage')).toHaveValue('7');
    if (width > 760) {
      await expect(page.locator('[data-bundle]').last()).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.material-contents li').last()).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#materialBuy')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.material-pages')).toBeInViewport({ ratio: 1 });
    }
    await page.locator('#materialStage').selectOption('4');
    await expect(page.locator('#materialStage')).toHaveValue('4');
    await expect(page.locator('.material-contents')).not.toHaveText(contents, { useInnerText: true });
    expect(await page.locator('#materialBuy').innerText()).not.toBe('3,480 宝石 · 购买');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const selector of ['.material-shop', '.material-catalog', '.material-detail']) {
      expect(await page.locator(selector).evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.locator('#materialBuy').scrollIntoViewIfNeeded();
    await expect(page.locator('#materialBuy')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `artifacts/material-shop/bundles-detail-${width}.png` });
    await page.locator('#materialFamily').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/material-shop/bundles-catalog-${width}.png` });
  });
}

test('空收藏也能买组合；无效商品显示禁购且不回退为其他商品', async ({ page }) => {
  await openShop(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!); s.collection = {}; s.currencies.gems = 1000;
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.goto('/game.html#materials/gems'); await page.reload();
  await expect(page.locator('#materialBuy')).toHaveText('280 宝石 · 购买');
  await page.locator('#materialBuy').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.gems)).toBe(720);
  await page.goto('/game.html#materials/gems/b-invalid/7');
  await expect(page.locator('#materialBuy')).toBeDisabled();
  await expect(page.locator('.material-contents li')).toHaveCount(0);
});
