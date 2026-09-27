import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/ux-phase-b/shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(20000);
await page.goto('http://localhost:5173/game.html#weapons/owned', { waitUntil: 'domcontentloaded' });
await page.locator('.weapons-workspace--owned .weapon-card').first().waitFor();
const report = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.weapons-workspace--owned .weapon-card')];
  const first = cards[0];
  const art = first?.querySelector('.weapon-art')?.getBoundingClientRect();
  const name = first?.querySelector('.weapon-name')?.getBoundingClientRect();
  const card = first?.getBoundingClientRect();
  const mana = first?.querySelector('.weapon-mana')?.getBoundingClientRect();
  const screen = document.querySelector('.weapons-screen');
  return {
    count: cards.length,
    names: cards.map((c) => c.querySelector('.weapon-name')?.textContent),
    rarities: cards.map((c) => c.querySelector('.weapon-rarity') ? 'HAS_LABEL' : null).filter(Boolean),
    metas: cards.map((c) => c.querySelector('.weapon-meta') ? 'HAS_META' : null).filter(Boolean),
    manaIcons: cards.filter((c) => c.querySelector('.weapon-mana .board-gem')).length,
    manaCosts: cards.map((c) => c.querySelector('.weapon-mana i')?.textContent),
    borders: cards.slice(0, 6).map((c) => getComputedStyle(c).borderTopColor),
    artShare: art && card ? +(art.height / card.height).toFixed(3) : null,
    artBox: art,
    nameBox: name,
    manaBox: mana,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    screenScroll: screen ? screen.scrollHeight > screen.clientHeight + 1 : null,
  };
});
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-catalog-artfirst-1600.png' });

const dagger = page.locator('.weapon-card', { hasText: '暗黑匕首' }).first();
if (await dagger.count()) {
  const box = await dagger.boundingBox();
  if (box) {
    await page.screenshot({
      path: 'artifacts/ux-phase-b/shots/weapons-catalog-dagger.png',
      clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 },
    });
  }
}
await browser.close();
