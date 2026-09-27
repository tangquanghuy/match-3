import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`愿望单与详情入口视觉边界 ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/game.html#wishlist');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.wl-card').first()).toBeVisible();
    const shell = await page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>('.wishlist-screen')!;
      const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
      const nav = document.querySelector('.bottom-bar')!.getBoundingClientRect();
      return {
        screenTop: screen.getBoundingClientRect().top, headerBottom: topbar.bottom,
        screenBottom: screen.getBoundingClientRect().bottom, navTop: nav.top,
        overflow: screen.scrollWidth > screen.clientWidth + 1,
        walletWithinScreen: [...document.querySelectorAll<HTMLElement>('.wallet button')].filter(b => b.offsetWidth > 0)
          .every(b => b.getBoundingClientRect().right <= innerWidth),
        cardWidth: document.querySelector('.wl-card')!.getBoundingClientRect().width,
      };
    });
    expect(shell.screenTop).toBeGreaterThanOrEqual(shell.headerBottom - 2);
    expect(shell.screenBottom).toBeLessThanOrEqual(shell.navTop + 2);
    expect(shell.overflow).toBe(false);
    expect(shell.walletWithinScreen).toBe(true);
    expect(shell.cardWidth).toBeGreaterThanOrEqual(120);
    await expect(page.locator('.wl-intro')).toHaveCount(0);
    await expect(page.locator('.wl-selection')).toBeHidden();
    await expect(page.locator('#wl-filters-dialog')).not.toBeVisible();
    await expect(page.locator('.wl-card [data-toggle]').first()).toBeInViewport({ ratio: 1 });
    const firstRow = await page.locator('.wl-card').first().boundingBox();
    expect(firstRow!.y).toBeLessThan(viewport.height * .5);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('.wl-card img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-redesign/wishlist-${viewport.width}.png` });

    await page.locator('[data-detail]').first().click();
    const button = page.locator('#detailWishlist');
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport();
    await expect(button).toHaveText('加入愿望单');
    const metrics = await button.evaluate(el => {
      const c = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const back = document.querySelector('#back')!.getBoundingClientRect();
      const heading = el.closest('.page-heading')!.getBoundingClientRect();
      const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const textLum = luminance(c.color.match(/\d+/g)!.slice(0, 3).map(Number));
      // Check the brightest endpoint of the explicit button gradient (the worst contrast).
      const backgroundLum = luminance([52, 49, 38]);
      return {
        image: c.backgroundImage, border: c.borderTopWidth,
        contrast: (Math.max(textLum, backgroundLum) + .05) / (Math.min(textLum, backgroundLum) + .05),
        insideHeading: rect.top >= heading.top && rect.bottom <= heading.bottom,
        separateFromBack: rect.left >= back.right + 4,
        height: rect.height,
      };
    });
    expect(metrics.image).toContain('linear-gradient');
    expect(metrics.border).toBe('1px');
    expect(metrics.contrast).toBeGreaterThanOrEqual(4.5);
    expect(metrics.insideHeading).toBe(true);
    expect(metrics.separateFromBack).toBe(true);
    if (viewport.width <= 700) expect(metrics.height).toBeGreaterThanOrEqual(44);
    await expect.poll(() => page.locator('#portraitArt').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-redesign/detail-add-${viewport.width}.png` });
    await button.click();
    await expect(button).toHaveText('管理愿望单');
    await expect(button.locator('[data-icon="sparkles"] svg')).toHaveCount(1);
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await button.focus();
    await expect(button).toBeFocused();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `artifacts/visual-redesign/detail-manage-${viewport.width}.png` });
    await button.press('Enter');
    await expect(page.locator('.wishlist-screen')).toBeVisible();
    await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();
    await expect(page.locator('.wl-selection-head h2')).toHaveText('已选角色 1');
    await page.screenshot({ path: `artifacts/visual-redesign/wishlist-selection-${viewport.width}.png` });
  });
}

for (const width of [1600, 390, 320]) {
  test(`愿望单展开状态与触及上限反馈 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
    await page.goto('/game.html#wishlist');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('[data-action="filters"]').click();
    await expect(page.locator('#wl-filter-done')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `artifacts/visual-redesign/wishlist-filters-${width}.png` });
    await page.locator('#wl-filter-done').click();
    await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();
    await page.locator('[data-action="recommend"]').click();
    await page.locator('[data-action="apply-preview"]').click();
    await expect(page.locator('.wl-selection-head h2')).toHaveText('已选角色 27');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).gachaWishlist.troopIds);
    const pursuit = page.locator('[data-pursue]').first();
    await pursuit.click();
    await expect(page.locator('.wl-pursuit')).toContainText('最多再 200 抽');
    await page.locator('.wl-layout').evaluate(el => { el.scrollTop = 0; });
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.screenshot({ path: `artifacts/visual-redesign/wishlist-full-${width}.png` });
    await page.locator('.wl-tabs a[href="#wishlist"]').click();
    await page.locator('.wl-card:not(.is-selected) [data-toggle]').first().click();
    await expect(page.locator('#toast')).toContainText('已达愿望单上限');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).gachaWishlist.troopIds);
    expect(after).toEqual(before);
    await page.locator('.wl-help[href="#wishlist/rules"]').click();
    await expect(page).toHaveURL(/#wishlist\/rules$/);
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.screenshot({ path: `artifacts/visual-redesign/wishlist-rules-${width}.png` });
    await page.goto('/game.html#shop/invasion');
    await page.locator('.shop-goods-art').nth(1).click();
    await expect(page.locator('#shopItemDialog')).toBeVisible();
    await page.screenshot({ path: `artifacts/visual-redesign/shop-item-${width}.png` });
    await page.keyboard.press('Escape');
    await page.goto('/game.html#chests/gems');
    await expect(page.locator('#openWishlist')).toHaveText('愿望单 · 已选 27');
    const wishButton = page.locator('#openWishlist');
    await expect(wishButton).toBeInViewport({ ratio: 1 });
    const metrics = await wishButton.evaluate(el => ({height:el.getBoundingClientRect().height, nowrap:getComputedStyle(el).whiteSpace, fits:el.scrollWidth<=el.clientWidth+1}));
    expect(metrics.nowrap).toBe('nowrap');
    expect(metrics.fits).toBe(true);
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.height).toBeLessThanOrEqual(48);
    await expect.poll(() => page.locator('.chest-art').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-redesign/chests-wishlist-${width}.png` });
  });
}
