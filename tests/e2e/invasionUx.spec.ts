import { test, expect } from '@playwright/test';

test('入侵主屏三选一，榜单/官阶/规则走次级视图', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#invasion');

  const rivals = page.locator('.inv-rival');
  await expect(rivals).toHaveCount(3);
  await expect(page.locator('.inv-rank-emblem')).toHaveCount(1);
  await expect(page.locator('.inv-rows, .inv-rank-list, .inv-vp-rule')).toHaveCount(0);
  await expect(page.locator('.inv-attack.recommended')).toHaveCount(1);
  await expect(page.locator('.inv-def')).toHaveCount(12);
  expect((await page.locator('.inv-def').allTextContents()).join(' ')).not.toMatch(/攻\d|护\d|生\d|魔\d/);
  await expect(page.locator('.inv-hub-foot')).toBeVisible();
  await expect.poll(() => page.locator('.inv-def img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);

  await page.locator('.inv-hub-links a[href="#invasion/standings"]').click();
  await expect(page).toHaveURL(/#invasion\/standings$/);
  await expect(page.locator('.inv-row')).toHaveCount(30);
  await expect(page.locator('.inv-row.me')).toHaveCount(1);
  await expect(page.locator('.inv-cutline')).toContainText(['前 20 名晋级']);

  await page.locator('.inv-subnav a[href="#invasion/ranks"]').click();
  await expect(page.locator('.inv-rank-row')).toHaveCount(10);
  await expect(page.locator('.inv-rank-row.current')).toHaveCount(1);
  await expect(page.locator('.inv-rank-row .inv-rank-emblem')).toHaveCount(10);

  await page.locator('.inv-subnav a[href="#invasion/rules"]').click();
  await expect(page.locator('.inv-rules-body')).toContainText('战败扣');
  await expect(page.locator('.inv-rules-body')).not.toContainText('4 消');
  await page.locator('.inv-subnav a[href="#invasion"]').click();
  await expect(rivals).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('窄屏对手分页保持推荐优先、位置同步与卡片可读', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#invasion');

  const rivals = page.locator('.inv-rival');
  const position = page.locator('.inv-choice-position');
  await expect(rivals).toHaveCount(3);
  await expect(rivals.first()).toHaveClass(/recommended/);
  await expect(page.locator('.inv-choice-pager')).toBeVisible();
  await expect(position).toContainText(/1\s*\/\s*3/);

  const visibleCardIndex = () => page.locator('.inv-rivals').evaluate((track) => {
    const viewport = track.getBoundingClientRect();
    const cards = [...track.querySelectorAll('.inv-rival')];
    return cards.findIndex((card) => {
      const bounds = card.getBoundingClientRect();
      const visibleWidth = Math.min(bounds.right, viewport.right) - Math.max(bounds.left, viewport.left);
      return visibleWidth >= bounds.width * .8;
    });
  });
  await expect.poll(visibleCardIndex).toBe(0);

  await page.locator('[data-inv-next]').click();
  await expect(position).toContainText(/2\s*\/\s*3/);
  await expect.poll(visibleCardIndex).toBe(1);

  await page.locator('[data-inv-prev]').click();
  await expect(position).toContainText(/1\s*\/\s*3/);
  await expect.poll(visibleCardIndex).toBe(0);

  await page.locator('.inv-rivals').hover();
  await page.mouse.wheel(1200, 0);
  await expect(position).toContainText(/3\s*\/\s*3/);
  await expect.poll(visibleCardIndex).toBe(2);

  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.inv-battle-hub')!;
    const cardText = [...document.querySelectorAll('.inv-rival small, .inv-rival b, .inv-rival h3, .inv-rival .inv-rival-nums, .inv-rival .inv-rival-risk, .inv-rival .inv-attack')];
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      panelFits: panel.scrollWidth <= panel.clientWidth + 1,
      cardTextReadable: cardText.every((el) => Number.parseFloat(getComputedStyle(el).fontSize) >= 10),
    };
  });
  expect(layout).toEqual({ documentFits: true, panelFits: true, cardTextReadable: true });
});

test('平板和窄桌面以真实尺寸展示候选，不缩小整屏', async ({ page }) => {
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/game.html#invasion');
    await expect(page.locator('.inv-rival')).toHaveCount(3);
    const layout = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('#stage')!;
      const panel = document.querySelector<HTMLElement>('.inv-battle-hub')!;
      const portrait = document.querySelector<HTMLElement>('.inv-def img')!;
      return {
        stageWidth: Math.round(stage.getBoundingClientRect().width),
        portraitHeight: Math.round(portrait.getBoundingClientRect().height),
        documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
        panelFits: panel.scrollWidth <= panel.clientWidth + 1,
      };
    });
    expect(layout.stageWidth).toBe(viewport.width);
    expect(layout.portraitHeight).toBeGreaterThanOrEqual(viewport.width === 768 ? 180 : 140);
    expect(layout.documentFits).toBe(true);
    expect(layout.panelFits).toBe(true);
  }
});

test('320px 短屏可以滚动到出击按钮', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/game.html#invasion');
  const attack = page.locator('.inv-attack').first();
  await attack.scrollIntoViewIfNeeded();
  const button = await attack.boundingBox();
  expect(button).not.toBeNull();
  expect(button!.y + button!.height).toBeLessThanOrEqual(568 - 58);
  expect(button!.y).toBeGreaterThanOrEqual(66);
});

test('锁态仅展示起始官阶；窄屏没有卡片互相覆盖', async ({ page }) => {
  await page.goto('/game.html#invasion');
  await expect(page.locator('.inv-rival')).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.inv-rival')].map((el) => el.getBoundingClientRect());
    const panel = document.querySelector('.inv-battle-hub')!;
    const stage = document.querySelector('#stage')!;
    const name = document.querySelector('.inv-rival-name')!;
    return {
      cardsSeparate: cards.every((card, index) => index === 0 || card.left >= cards[index - 1]!.right),
      panelFits: panel.scrollWidth <= panel.clientWidth + 1,
      stageFillsScreen: stage.getBoundingClientRect().height >= window.innerHeight - 1,
      cardNameReadable: Number.parseFloat(getComputedStyle(name).fontSize) >= 16,
    };
  });
  expect(layout).toEqual({ cardsSeparate: true, panelFits: true, stageFillsScreen: true, cardNameReadable: true });

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.hero.level = 4;
    save.hero.xp = 0;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('.inv-locked')).toBeVisible();
  await expect(page.locator('.inv-lock-preview .inv-rank-emblem')).toHaveCount(1);
  await expect(page.locator('.inv-rank-row, .inv-ladder-step')).toHaveCount(0);
  await page.locator('#invMapCta').click();
  await expect(page).toHaveURL(/#map$/);
});
