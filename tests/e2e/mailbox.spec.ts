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
