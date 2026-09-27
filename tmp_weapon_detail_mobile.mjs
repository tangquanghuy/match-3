import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(20000);
await page.goto('http://localhost:5173/game.html#weapons/all', { waitUntil: 'domcontentloaded' });
await page.locator('[data-weapon-search]').fill('神性长枪');
await page.locator('.weapons-workspace--all .weapon-card').first().click();
await page.locator('.weapon-detail-sheet').waitFor();
const report = await page.evaluate(() => {
  const hit = (a, b) => a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
  const scroll = document.querySelector('.detail-scroll');
  const cards = [...document.querySelectorAll('.affix-card')];
  return {
    overflowsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    needsScroll: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
    overlaps: cards.map((card) => {
      const name = card.querySelector('.affix-copy b').getBoundingClientRect();
      const state = card.querySelector('.affix-state').getBoundingClientRect();
      return hit(name, state);
    }),
    sheet: document.querySelector('.weapon-detail-sheet')?.getBoundingClientRect(),
    screen: document.querySelector('.weapons-screen')?.getBoundingClientRect(),
  };
});
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-detail-lance-390.png' });
await browser.close();
