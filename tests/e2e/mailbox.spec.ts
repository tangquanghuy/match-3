import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
});

test('旧周活动奖励通过邮件补发，附件只能领取一次', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#mail');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.eventWeeks.invasion = {
      weekStart: Date.now(), points: 100, claimed: [0], wins: 1, tokens: 0, tokensEarned: 0,
      playRewards: 0, bought: {}, eventData: { revision: 2, gemPaid0: 150, currencyBonusPaid0: 1 }, runTeam: null,
    };
    save.mailbox = { weeklyDoubleVersion: 0, classTrialXpVersion: 1, items: [] };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#mailAlert')).toBeVisible();
  await expect(page.locator('.mailbox-row')).toHaveCount(1);
  await expect(page.locator('.mailbox-detail')).toContainText('入侵奖励补发');
  await expect(page.locator('.mailbox-attachments')).toContainText('宝石');
  const before = await page.locator('#gemBalance').textContent();
  await page.locator('[data-mail-claim]').click();
  await expect(page.locator('[data-mail-claim]')).toHaveText('已领取');
  await expect(page.locator('#mailAlert')).toBeHidden();
  expect(await page.locator('#gemBalance').textContent()).not.toBe(before);
  await page.reload();
  await expect(page.locator('.mailbox-row')).toHaveCount(1);
  await expect(page.locator('[data-mail-claim]')).toBeDisabled();
});

test('手机邮件列表与附件不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#mail');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.mailbox = { weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: [{
      id: 'test-mobile-mail', title: '永生战域奖励补发', body: '本周已领取奖励的差额。',
      sentAt: Date.now(), readAt: null, claimedAt: null,
      currencies: { gold: 200000, gems: 300, souls: 16000 },
      materials: { traitstones: { 'arcane:blue:purple': 8, celestial: 2 } },
    }] };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('.mailbox-screen')).toBeVisible();
  await expect(page.locator('#mailBtn')).toBeVisible();
  await expect(page.locator('.mailbox-attachments')).toContainText('宝石');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


test('神话自选中断仍保留资格，特质石只领取一次，确认后展示宝箱演出', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#mail');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.mailbox = { weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: [{
      id: 'mythic-choice-test', title: '神话补偿', body: '领取特质石和一次神话自选',
      sentAt: Date.now(), readAt: null, claimedAt: null,
      currencies: {}, materials: { traitstones: { 'minor:yellow': 90, celestial: 18 } }, mythicChoice: 1,
    }] };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).materials.traitstones['minor:yellow'] ?? 0);
  await expect(page.locator('.mailbox-attachments')).toContainText('神话自选');
  await page.locator('[data-mail-claim]').click();
  await expect(page.locator('#choice-query')).toBeVisible();
  await expect(page).toHaveURL(/#wishlist\/choice\/mythic-choice-test/);
  await page.locator('#choice-query').fill('彗星拉斯');
  await expect(page.locator('[data-choice-id="7440"]')).toBeVisible();
  await page.locator('[data-choice-detail="7440"]').last().click();
  await expect(page).toHaveURL(/#troop\/7440\/choice\/mythic-choice-test/);
  await expect(page.locator('#detailBackLabel')).toHaveText('返回神话自选');
  await expect(page.locator('#cardName')).toHaveText('彗星拉斯');
  await expect(page.locator('#spellCopy')).not.toBeEmpty();
  await expect(page.locator('#traitList')).not.toBeEmpty();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).mailbox.items[0].mythicChoice)).toBe(1);
  await page.locator('#back').click();
  await expect(page.locator('#choice-query')).toHaveValue('彗星拉斯');
  await page.locator('[data-choice-id="7440"]').click();
  await page.locator('[data-choice-cancel]').click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).materials.traitstones['minor:yellow'] ?? 0)).toBe(before + 90);
  await page.goto('/game.html#mail');
  await expect(page.locator('#mailAlert')).toBeVisible();
  await expect(page.locator('[data-mail-claim]')).toBeDisabled();
  await page.locator('[data-mail-choice]').click();
  await page.locator('#choice-query').fill('彗星拉斯');
  await page.locator('[data-choice-id="7440"]').click();
  await page.locator('[data-choice-confirm]').click();
  await expect(page.locator('#summonModal')).toBeVisible();
  await expect(page.locator('#summonTitle')).toHaveText('神话自选');
  expect(await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    return [save.collection['7440'] !== undefined, save.mailbox.items[0].mythicChoice, save.materials.traitstones['minor:yellow']];
  })).toEqual([true, 0, before + 90]);
  await page.reload();
  await expect(page.locator('#mailAlert')).toBeHidden();
});

test('bulk claiming materials opens a pending mythic choice without consuming it', async ({ page }) => {
  await page.goto('/game.html#mail');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.mailbox = { weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: [{
      id: 'bulk-mythic-choice', title: 'Mythic compensation', body: 'Pick a mythic troop',
      sentAt: Date.now(), readAt: null, claimedAt: null,
      currencies: {}, materials: { traitstones: { celestial: 18 } }, mythicChoice: 1,
    }] };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).materials.traitstones.celestial ?? 0);
  await page.locator('[data-mail-all]').click();
  await expect(page).toHaveURL(/#wishlist\/choice\/bulk-mythic-choice/);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
  expect(save.mailbox.items[0].mythicChoice).toBe(1);
  expect(save.mailbox.items[0].claimedAt).not.toBeNull();
  expect(save.materials.traitstones.celestial).toBe(before + 18);
  await page.goto('/game.html#mail');
  await expect(page.locator('[data-mail-all]')).toBeDisabled();
  await expect(page.locator('[data-mail-choice]')).toBeVisible();
});


test('手机神话自选卡面可查看详情、返回邮件自选且不会消耗资格', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#mail');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.mailbox = { weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: [{
      id: 'mobile-choice', title: '神话自选', body: '查看再决定', sentAt: Date.now(), readAt: null,
      claimedAt: null, currencies: {}, materials: {}, mythicChoice: 1,
    }] };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await page.locator('[data-mail-claim]').click();
  await page.locator('#choice-query').fill('彗星拉斯');
  await page.locator('.collection-card[data-choice-detail="7440"]').click();
  await expect(page.locator('#spellCopy')).not.toBeEmpty();
  await expect(page.locator('#traitList')).not.toBeEmpty();
  await page.locator('#back').click();
  await expect(page.locator('#choice-query')).toHaveValue('彗星拉斯');
  await expect(page.locator('[data-choice-id="7440"]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).mailbox.items[0].mythicChoice)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
