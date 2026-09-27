import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/ux-phase-b/shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(25000);

await page.goto('http://localhost:5173/game.html#weapons/all', { waitUntil: 'domcontentloaded' });
await page.locator('.weapons-workspace--all .weapon-card').first().waitFor();

await page.locator('[data-weapon-search]').fill('龙火炮');
await page.locator('.weapons-workspace--all .weapon-card').filter({ hasText: '龙火炮' }).first().click();
await page.locator('.detail-acquire').waitFor();
const cannon = await page.locator('.detail-acquire').innerText();
const cannonTitle = await page.locator('.detail-title').innerText();
console.log('CANNON', cannonTitle, JSON.stringify(cannon));
if (cannon.includes('官方')) throw new Error('cannon still has 官方');
if (!cannon.includes('机械师专属 · 职业 250 胜解锁')) throw new Error('cannon label mismatch: ' + cannon);
if (cannon.includes('解锁该职业')) throw new Error('cannon still verbose');
await page.locator('.detail-acquire').screenshot({ path: 'artifacts/ux-phase-b/shots/acquire-cannon.png' });
await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-acquire-cannon.png' });

await page.locator('[data-weapon-detail-close]').click();
await page.locator('[data-weapon-search]').fill('纯洁护盾');
await page.locator('.weapons-workspace--all .weapon-card').filter({ hasText: '纯洁护盾' }).first().click();
const aegis = await page.locator('.detail-acquire').innerText();
const aegisTitle = await page.locator('.detail-title').innerText();
console.log('AEGIS', aegisTitle, JSON.stringify(aegis));
if (aegis.includes('官方') || aegis.includes('王国武器包')) throw new Error('aegis leftover: ' + aegis);
if (!aegis.includes('宝石商店 · 通关白盔国后购买')) throw new Error('aegis label mismatch: ' + aegis);
await page.locator('.detail-acquire').screenshot({ path: 'artifacts/ux-phase-b/shots/acquire-aegis.png' });

await page.goto('http://localhost:5173/game.html#shop/gems', { waitUntil: 'domcontentloaded' });
await page.locator('.gem-shop-grid').waitFor();
const before = await page.locator('.gem-shop-card').filter({ hasText: '纯洁护盾' }).count();
console.log('GEM_SHOP_BEFORE', before);
if (before !== 0) throw new Error('纯洁护盾 should not be in gem shop before 白盔国 clear');

await page.evaluate(() => {
  const key = 'gems.meta.save';
  const save = JSON.parse(localStorage.getItem(key));
  save.kingdoms = save.kingdoms || {};
  save.kingdoms['白盔国'] = {
    ...(save.kingdoms['白盔国'] || {}),
    level: 1,
    questsDone: 8,
    exploreTier: 0,
    lastTributeAt: 0,
  };
  localStorage.setItem(key, JSON.stringify(save));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.goto('http://localhost:5173/game.html#shop/gems', { waitUntil: 'domcontentloaded' });
await page.locator('.gem-shop-grid').waitFor();
const after = await page.locator('.gem-shop-card').filter({ hasText: '纯洁护盾' }).count();
console.log('GEM_SHOP_AFTER', after);
if (after < 1) throw new Error('纯洁护盾 should appear after 白盔国 clear');
await page.locator('.gem-shop-card').filter({ hasText: '纯洁护盾' }).first().screenshot({
  path: 'artifacts/ux-phase-b/shots/gem-shop-aegis.png',
});

await browser.close();
console.log('ok');
