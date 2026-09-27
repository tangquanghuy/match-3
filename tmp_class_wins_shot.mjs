import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/ux-phase-b/shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(25000);

await page.goto('http://localhost:5173/game.html#hero', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.hero-screen').waitFor();
await page.locator('#careerWins').waitFor({ state: 'visible' });

const career = await page.locator('.class-head').innerText();
const current = await page.locator('#classCurrent').innerText();
const wins = await page.locator('#careerWins').innerText();
console.log('CAREER\n' + career);
console.log('CURRENT\n' + current);
console.log('WINS', wins);

if (!wins.includes('34 / 250 胜')) throw new Error('career wins mismatch: ' + wins);
if (!current.includes('34 / 250 胜')) throw new Error('class current wins mismatch: ' + current);

const geometry = await page.evaluate(() => {
  const info = document.querySelector('.hero-info');
  return {
    overflowY: getComputedStyle(info).overflowY,
    hasInnerScroll: info.scrollHeight > info.clientHeight + 1,
    badgeVisible: getComputedStyle(document.querySelector('#careerWins')).display !== 'none',
  };
});
console.log('GEOMETRY', geometry);
if (geometry.hasInnerScroll) throw new Error('hero info started scrolling');

await page.locator('.class-head').screenshot({ path: 'artifacts/ux-phase-b/shots/hero-class-wins-head.png' });
await page.locator('#classCurrent').screenshot({ path: 'artifacts/ux-phase-b/shots/hero-class-wins-current.png' });
await page.screenshot({ path: 'artifacts/ux-phase-b/shots/hero-class-wins.png' });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.locator('.class-head').screenshot({ path: 'artifacts/ux-phase-b/shots/hero-class-wins-head-mobile.png' });
await page.locator('#classCurrent').screenshot({ path: 'artifacts/ux-phase-b/shots/hero-class-wins-current-mobile.png' });

await browser.close();
console.log('ok');
