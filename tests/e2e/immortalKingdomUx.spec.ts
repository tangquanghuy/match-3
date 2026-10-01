import { test, expect } from '@playwright/test';

for (const width of [1600, 390]) {
 test(`kingdom bonus back preserves page and refreshed levels ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/game.html#map', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#kingdomBonusBtn')).toBeVisible();
  await page.locator('#kingdomBonusBtn').click();
  await page.locator('[data-kb-page="next"]').click();
  const rows = page.locator('#kbonusList .kb-row');
  const pager = await page.locator('#kbonusPager [role="status"]').innerText();
  const names = await rows.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.id));
  await rows.first().click();
  await expect(page.locator('#kingdomBonusBack')).toBeVisible();
  await expect(page.locator('#kbonusVeil')).toBeHidden();
  await page.locator('#kingdomBonusBack').click();
  expect(await rows.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.id))).toEqual(names);
  await expect(rows.first()).toBeFocused();
  await rows.first().click();
  const upgrade = page.locator('#kingdomUpgrade');
  if (await upgrade.isEnabled()) await upgrade.click();
  await expect(page.locator('#kingdomBonusBack')).toBeVisible();
  await page.locator('#kingdomBonusBack').click();
  await expect(page.locator('#kingdomVeil')).toBeHidden();
  await expect(page.locator('#kbonusVeil')).toBeVisible();
  // Upgrading re-sorts kingdoms; retain the page, not stale row contents.
  await expect(page.locator('#kbonusPager [role="status"]')).toHaveText(pager);
  await expect(page.locator('#kbonusList .kb-row:focus')).toHaveCount(1);
  const nextName = await rows.nth(1).getAttribute('data-id');
  await rows.nth(1).click();
  await expect(page.locator('#kingdomName')).toHaveText(nextName!);
  await page.screenshot({ path: `artifacts/kingdom-bonus-back-${width}.png` });
  const backBox = await page.locator('#kingdomBonusBack').boundingBox();
  expect(backBox!.x).toBeGreaterThanOrEqual(0); expect(backBox!.x + backBox!.width).toBeLessThanOrEqual(width);
  await page.locator('#kingdomClose').click();
  await page.locator('.knode.sel').click();
  await expect(page.locator('#kingdomBonusBack')).toBeHidden();
 });

 test(`immortal trait fuel is displayed, gated and charged ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/game.html#troop/7580', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#unlock')).toBeVisible();
  await page.evaluate(async () => {
   const load = (path: string) => import(/* @vite-ignore */ path);
   const { metaGateway } = await load('/src/meta/gateway/index.ts');
   const { traitUnlockCost } = await load('/src/meta/data/economy.ts');
   const { freshRegionalState } = await load('/src/meta/state/regional.ts');
   const gw = metaGateway(), s = JSON.parse(gw.exportSaveJson());
   s.hero.level = 50; s.collection['7580'] = { level: 8, ascension: 0, copies: 0, traits: [false, false, false], locked: false };
   s.regional = { ...freshRegionalState(), burningSouls: 32 };
   for (const slot of [1, 2, 3]) for (const [key, n] of Object.entries(traitUnlockCost(slot, 'brown', 7580).stones)) s.materials.traitstones[key] = (s.materials.traitstones[key] ?? 0) + Number(n);
   await gw.dev.importSaveJson(JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#unlockCost')).toContainText('燃烧灵魂 ×33');
  await expect(page.locator('#unlock')).toBeDisabled();
  await expect(page.locator('#unlockLabel')).toContainText('燃烧灵魂还差 1');
  await page.evaluate(async () => {
   const path = '/src/meta/gateway/index.ts', { metaGateway } = await import(/* @vite-ignore */ path);
   const gw = metaGateway(), s = JSON.parse(gw.exportSaveJson()); s.regional.burningSouls = 198;
   await gw.dev.importSaveJson(JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (const [cost, left] of [[33, 165], [66, 99], [99, 0]]) {
   await expect(page.locator('#unlockCost')).toContainText(`燃烧灵魂 ×${cost}`);
   await expect(page.locator('#unlock')).toBeEnabled();
   await page.locator('#unlock').click();
   await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).regional.burningSouls)).toBe(left);
  }
  await expect(page.locator('#unlockLabel')).toHaveText('特质全解锁');
 });
}


test('slow battle settlement keeps battle visible until result mounts', async ({ page }) => {
 test.setTimeout(90_000);
 const errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(`/game.html#quest/${encodeURIComponent('破碎尖塔')}`);
 await expect(page.locator('.quest-map')).toBeVisible();
 await page.evaluate(async () => {
  const path = '/src/meta/gateway/index.ts';
  const { metaGateway } = await import(/* @vite-ignore */ path);
  const gateway = metaGateway(), save = JSON.parse(gateway.exportSaveJson());
  save.kingdoms['破碎尖塔'].questsDone = 0;
  await gateway.dev.importSaveJson(JSON.stringify(save));
 });
 await page.reload();
 await expect(page.locator('#questFight')).toBeEnabled();
 await page.locator('#questFight').click();
 await expect(page.locator('#battle-root .battle-settings-button')).toBeVisible({ timeout: 30_000 });
 await page.evaluate(async () => {
  const path = '/src/meta/gateway/index.ts';
  const { metaGateway } = await import(/* @vite-ignore */ path);
  const gateway = metaGateway();
  const original = gateway.settleBattle.bind(gateway);
  const gate = new Promise<void>(resolve => window.addEventListener('release-test-settlement', () => resolve(), { once: true }));
  gateway.settleBattle = async (result: unknown) => {
   document.body.dataset.settlementCalls = String(Number(document.body.dataset.settlementCalls ?? 0) + 1);
   await gate;
   return original(result);
  };
  const root = document.getElementById('battle-root')!;
  const observer = new MutationObserver(() => {
   if (root.hidden) {
    document.body.dataset.resultMountedBeforeBattleHidden = String(!!document.querySelector('.result-screen'));
    observer.disconnect();
   }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['hidden'] });
 });
 await page.getByRole('button', { name: '战斗设置', exact: true }).click();
 await page.getByRole('button', { name: '放弃本局' }).click();
 await page.getByRole('button', { name: '确认放弃' }).click();
 await expect(page.locator('.battle-settlement-wait')).toBeVisible({ timeout: 15_000 });
 await expect(page.locator('.battle-settlement-wait')).toContainText('等待网络中');
 await page.waitForTimeout(1200);
 await expect(page.locator('#battle-root')).toBeVisible();
 await expect(page.locator('.result-screen')).toHaveCount(0);
 await page.screenshot({ path: 'artifacts/battle-settlement-wait.png' });
 await page.evaluate(() => window.dispatchEvent(new Event('release-test-settlement')));
 await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
 await expect(page.locator('#battle-root')).toBeHidden();
 await expect(page.locator('.battle-settlement-wait')).toHaveCount(0);
 await expect(page.locator('body')).toHaveAttribute('data-result-mounted-before-battle-hidden', 'true');
 await expect(page.locator('body')).toHaveAttribute('data-settlement-calls', '1');
 await expect(page).toHaveURL(/#result$/);
 expect(errors).toEqual([]);
});
