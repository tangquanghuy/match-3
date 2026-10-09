import { test, expect } from '@playwright/test';

test('设置兑换码把 9000 赞附件送进邮件、每档一次', async ({ page }) => {
  await page.goto('/game.html#settings');
  await expect(page.locator('#openRedeem')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#redeemDialog')).toBeHidden();
  await expect(page.locator('#redeemStatus')).toHaveCount(0);
  await page.locator('#openRedeem').click();
  const form = page.locator('#redeemForm');
  await expect(form).toBeVisible();
  await form.locator('input').fill('9000LIKES');
  await form.locator('button[type=submit]').click();
  await expect(page.locator('#redeemFeedback')).toContainText('兑换成功');
  await expect(page.locator('#redeemDialog')).toBeVisible();
  await page.reload();
  await expect(page.locator('#redeemStatus')).toHaveCount(0);
  await page.locator('#openRedeem').click();
  await expect(page.locator('#redeemFeedback')).toBeHidden();
  await page.locator('#redeemInput').fill('9000LIKES');
  await page.locator('#redeemButton').click();
  await expect(page.locator('#redeemFeedback')).toContainText('已经兑换过了');

  const mail = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { defaultMetaGateway } = await load('/src/meta/gateway/index.ts');
    const gateway = defaultMetaGateway();
    await gateway.load();
    return gateway.current().mailbox.items.filter((item: { id: string }) => item.id === 'creation-corridor-9000-likes-2026-10-06');
  });
  expect(mail).toHaveLength(1);
  expect(mail[0].currencies).toEqual({ gold: 900_000, gems: 4_500 });
  expect(mail[0].claimedAt).toBeNull();
});

test('已领取旧邮件的存档仅在尝试重复兑换后显示已兑换', async ({ page }) => {
  await page.goto('/game.html#settings');
  await expect(page.locator('#openRedeem')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { defaultMetaGateway } = await load('/src/meta/gateway/index.ts');
    const gateway = defaultMetaGateway();
    await gateway.load();
    const save = JSON.parse(gateway.exportSaveJson());
    save.mailbox.items.push({ id: 'creation-corridor-9000-likes-2026-10-06', title: '创世回廊点赞达9000！',
      body: '已领取', sentAt: Date.now() - 1000, readAt: Date.now() - 500, claimedAt: Date.now() - 500,
      currencies: { gold: 900_000, gems: 4_500 }, materials: {} });
    await gateway.dev?.importSaveJson(JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#redeemStatus')).toHaveCount(0);
  await page.locator('#openRedeem').click();
  await expect(page.locator('#redeemFeedback')).toBeHidden();
  await page.locator('#redeemInput').fill('9000LIKES');
  await page.locator('#redeemButton').click();
  await expect(page.locator('#redeemFeedback')).toContainText('已经兑换过了');
});

test('兑换码弹窗支持粘贴、关闭和重新打开', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/game.html#settings');
  await expect(page.locator('#openRedeem')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => navigator.clipboard.writeText('9000LIKES'));
  await page.locator('#openRedeem').click();
  await page.locator('#pasteRedeem').click();
  await expect(page.locator('#redeemInput')).toHaveValue('9000LIKES');
  await page.locator('#closeRedeem').click();
  await expect(page.locator('#redeemDialog')).toBeHidden();
  await page.locator('#openRedeem').click();
  await expect(page.locator('#redeemInput')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#redeemDialog')).toBeHidden();
});
