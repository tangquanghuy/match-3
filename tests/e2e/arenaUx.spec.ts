import { test, expect } from '@playwright/test';

async function openFreshArena(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/game.html#arena');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.arena-screen')).toBeVisible({ timeout: 15_000 });
}

test.describe('竞技场 A-6~A-9 UX 回归', () => {
  test('奖表、黄金报名提示和三步进度具有明确语义', async ({ page }) => {
    await openFreshArena(page);

    await expect(page.locator('button.step')).toHaveCount(0);
    await expect(page.locator('.step[role="listitem"]')).toHaveCount(3);
    await expect(page.locator('.step[aria-current="step"]')).toHaveCount(1);
    expect(await page.locator('.arena-screen').innerText()).not.toMatch(/WEEKLY DRAFT ARENA|ENTER THE ARENA|DRAFT ROUND|DRAFTED TEAM|ARENA RUN|LEAVE THIS RUN|CURRENT OPPONENT|CLEARED|UP NEXT/);

    const wins = await page.locator('.prize').evaluateAll((rows) => rows.map((row) => ({
      wins: row.getAttribute('data-wins'),
      tier: row.querySelector('.prize-tier')?.textContent?.trim(),
      tierCount: row.querySelectorAll('.prize-tier').length,
    })));
    expect(wins.map((row) => row.wins)).toEqual(['6', '5', '4', '3', '2', '1', '0']);
    expect(wins.every((row) => row.tier && row.tierCount === 1)).toBe(true);
    await expect(page.locator('#ticketReset')).toHaveText(/固定15级 · 无特质/);
  });

  test('锁定牌组显示 x/4 进度、空槽序号和四档边框类', async ({ page }) => {
    await openFreshArena(page);
    await page.locator('#enter').click();
    await expect(page.locator('#draft')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#round')).toHaveText('1');

    await page.locator('#draftCards .draft-card').first().click();
    await page.locator('#nextDraft').click();
    await expect(page.locator('#draft')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 1/4');
    await expect(page.locator('#pickedSlots .filled')).toHaveCount(1);
    await expect(page.locator('#pickedSlots .empty')).toHaveCount(3);
    await expect(page.locator('#pickedSlots .empty').first()).toHaveAttribute('aria-label', /第 2 张待选择/);

    for (let round = 1; round < 4; round += 1) {
      await page.locator('#draftCards .draft-card').first().click();
      await page.locator('#nextDraft').click();
      if (round < 3) await expect(page.locator('#draft')).toBeVisible({ timeout: 10_000 });
    }
    await expect(page.locator('#battle')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#draftTeam .run-slot')).toHaveCount(4);
    const rarityClasses = await page.locator('#draftTeam .run-slot').evaluateAll((rows) => rows.map((row) => [...row.classList].find((name) => name.startsWith('r-'))));
    expect(rarityClasses.every(Boolean)).toBe(true);
  });

  test('窄屏竞技场进度条与票区不产生横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFreshArena(page);
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      steps: document.querySelector('.steps')?.getBoundingClientRect().width ?? 0,
      ticket: document.querySelector('.ticket')?.getBoundingClientRect().right ?? 0,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.steps).toBeGreaterThan(0);
    expect(geometry.ticket).toBeLessThanOrEqual(geometry.viewport + 1);
  });

  test('真实移动布局保持立绘与信息分区，主操作全程可达', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFreshArena(page);

    const stage = await page.locator('.stage').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, transform: getComputedStyle(el).transform };
    });
    expect(stage.width).toBeGreaterThanOrEqual(389);
    expect(stage.height).toBeGreaterThanOrEqual(843);
    expect(stage.transform).toBe('none');
    await expect(page.locator('.arena-marquee img')).toHaveCount(3);
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-signup-responsive.png' });

    await page.locator('#enter').click();
    await expect(page.locator('#draft')).toBeVisible();
    const cardGeometry = await page.locator('.draft-card').first().evaluate((card) => {
      const art = card.querySelector('.draft-card-art')!.getBoundingClientRect();
      const info = card.querySelector('.draft-card-info')!.getBoundingClientRect();
      return { cardWidth: card.getBoundingClientRect().width, artHeight: art.height, artBottom: art.bottom, infoTop: info.top };
    });
    expect(cardGeometry.cardWidth).toBeGreaterThan(300);
    expect(cardGeometry.artHeight).toBeGreaterThan(220);
    expect(cardGeometry.infoTop).toBeGreaterThanOrEqual(cardGeometry.artBottom - 1);
    await page.locator('.draft-card').first().click();
    await expect(page.locator('.draft-card').first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#nextDraft').scrollIntoViewIfNeeded();
    await expect(page.locator('#nextDraft')).toBeVisible();
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-draft-responsive.png' });

    for (let round = 0; round < 4; round += 1) {
      await page.locator('#nextDraft').click();
      if (round < 3) {
        await expect(page.locator('#draft')).toBeVisible();
        await page.locator('.draft-card').first().click();
        await page.locator('#nextDraft').scrollIntoViewIfNeeded();
      }
    }
    await expect(page.locator('#battle')).toBeVisible();
    await page.locator('#fight').scrollIntoViewIfNeeded();
    await expect(page.locator('#fight')).toBeVisible();
    await expect(page.locator('.match[aria-current="step"]')).toHaveCount(1);
    await expect(page.locator('.match.pending img')).toHaveCount(4);
    await expect.poll(() => page.locator('#battle img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), { timeout: 15000 }).toBe(true);
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-lineup-responsive.png' });
  });

  test('桌面三阶段保持稳定构图和图文边界', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openFreshArena(page);
    await expect.poll(() => page.locator('.arena-marquee img').first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-signup-desktop.png' });

    await page.locator('#enter').click();
    const firstCard = page.locator('.draft-card').first();
    await firstCard.click();
    const separation = await firstCard.evaluate((card) => {
      const art = card.querySelector('.draft-card-art')!.getBoundingClientRect();
      const info = card.querySelector('.draft-card-info')!.getBoundingClientRect();
      return { artBottom: art.bottom, infoTop: info.top, cardBottom: card.getBoundingClientRect().bottom };
    });
    expect(separation.infoTop).toBeGreaterThanOrEqual(separation.artBottom - 1);
    expect(separation.cardBottom).toBeLessThan(790);
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-draft-desktop.png' });

    for (let round = 0; round < 4; round += 1) {
      await page.locator('#nextDraft').click();
      if (round < 3) await page.locator('.draft-card').first().click();
    }
    await expect(page.locator('#battle')).toBeVisible();
    const action = await page.locator('#fight').boundingBox();
    expect(action).not.toBeNull();
    expect(action!.y + action!.height).toBeLessThan(818);
    await expect(page.locator('.match.pending img')).toHaveCount(4);
    await expect.poll(() => page.locator('#battle img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), { timeout: 15000 }).toBe(true);
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-lineup-desktop.png' });
  });

  test('768px 平板使用原尺寸双栏而非整体缩放', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openFreshArena(page);
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.stage')!;
      const signup = document.querySelector<HTMLElement>('.signup-stage')!;
      return {
        stageWidth: stage.getBoundingClientRect().width,
        stageHeight: stage.getBoundingClientRect().height,
        transform: getComputedStyle(stage).transform,
        signupColumns: getComputedStyle(signup).gridTemplateColumns.split(' ').length,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.stageWidth).toBeGreaterThanOrEqual(767);
    expect(geometry.stageHeight).toBeGreaterThanOrEqual(1023);
    expect(geometry.transform).toBe('none');
    expect(geometry.signupColumns).toBe(2);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(769);
    await page.screenshot({ path: 'artifacts/ux-phase-b/shots/pvp-arena-signup-tablet.png' });
  });
});


test('荣耀钥匙在零荣耀时仍可开启，余额与按钮同步', async ({ page }) => {
  await page.goto('/game.html#chests/keys');
  await expect(page.locator('[data-open="glory-1"]')).toBeVisible();
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.currencies.glory = 0; save.currencies.gloryKeys = 1;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('[data-open="glory-1"]')).toBeEnabled();
  await expect(page.locator('[data-open="glory-1"] .btn-cost')).toContainText('1 钥匙');
  await expect(page.locator('[data-open="glory-10"]')).toBeDisabled();
  await page.locator('[data-open="glory-1"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.gloryKeys)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.glory)).toBe(0);
});


test('胜场只递进对手选秀水平，刷新与首败保留同一档，手机文案不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshArena(page);
  await page.locator('#enter').click();
  for (let round = 0; round < 4; round++) {
    await page.locator('.draft-card').first().click();
    await page.locator('#nextDraft').click();
  }
  const tiers = ['初试选秀', '基础选牌', '输出意识', '兼顾供魔', '进阶编队', '熟练选秀'];
  for (let wins = 0; wins < tiers.length; wins++) {
    await page.evaluate((wins) => {
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      save.arena.activeDraft.wins = wins;
      save.arena.activeDraft.losses = wins % 2;
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
    }, wins);
    await page.reload();
    await expect(page.locator('.match-copy > b')).toContainText(tiers[wins]!);
    await expect(page.locator('.match-copy > small')).toHaveText('固定 Lv.15 · 4 人 · 无特质');
    await expect(page.locator('.match-preview img')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  }
});
