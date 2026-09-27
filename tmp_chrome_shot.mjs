import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const dir = 'artifacts/ux-phase-b/shots';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5173/game.html#team', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.topbar', { timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.topbar').screenshot({ path: `${dir}/chrome-topbar-1600.png` });
await page.locator('.wallet').screenshot({ path: `${dir}/wallet-chrome-topbar-1600.png` });
console.log('ok', await page.locator('.wallet svg.gic').count());
await browser.close();
