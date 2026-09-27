import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/ux-phase-b/shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(20000);
await page.goto('http://localhost:5173/game.html#weapons/all', { waitUntil: 'domcontentloaded' });
await page.locator('[data-weapon-search]').fill('神性长枪');
await page.locator('.weapons-workspace--all .weapon-card').first().click();
await page.locator('.detail-art img').first().evaluate(async (image) => {
  if (!image.complete) await new Promise((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
  await image.decode();
});

const report = await page.evaluate(() => {
  const box = (el) => el.getBoundingClientRect();
  const scroll = document.querySelector('.detail-scroll');
  const cards = [...document.querySelectorAll('.affix-card')];
  const hit = (a, b) => a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
  return {
    title: document.querySelector('.detail-title')?.textContent,
    affixCount: cards.length,
    icons: cards.map((card) => card.querySelector('.affix-icon')?.getAttribute('data-icon')),
    names: cards.map((card) => card.querySelector('.affix-copy b')?.textContent),
    states: cards.map((card) => card.querySelector('.affix-state')?.textContent),
    overlaps: cards.map((card) => {
      const name = box(card.querySelector('.affix-copy b'));
      const desc = box(card.querySelector('.affix-copy small'));
      const state = box(card.querySelector('.affix-state'));
      const icon = box(card.querySelector('.affix-icon'));
      const copy = box(card.querySelector('.affix-copy'));
      return {
        nameState: hit(name, state),
        descState: hit(desc, state),
        iconCopy: icon.right > copy.left + 1,
        copyState: copy.right > state.left + 1,
        nameText: name.width,
        stateLeft: state.left,
        nameRight: name.right,
      };
    }),
    needsScroll: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
    scrollHeight: scroll?.scrollHeight,
    clientHeight: scroll?.clientHeight,
    art: document.querySelector('.detail-art')?.getBoundingClientRect(),
    identity: document.querySelector('.detail-identity')?.getBoundingClientRect(),
    spell: document.querySelector('.detail-spell')?.getBoundingClientRect(),
    affixes: document.querySelector('.detail-affixes')?.getBoundingClientRect(),
  };
});
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-detail-lance-1600.png', fullPage: false });
await page.screenshot({
  path: 'artifacts/ux-phase-b/shots/weapons-detail-lance-affix.png',
  clip: { x: 520, y: 420, width: 1000, height: 280 },
});

await page.locator('[data-weapon-detail-close]').click();
await page.locator('[data-weapon-tab="owned"]').click();
await page.locator('[data-weapon-search]').fill('守护者之戟');
await page.locator('.weapons-workspace--owned .weapon-card').first().click();
await page.locator('.detail-art img').first().evaluate(async (image) => {
  if (!image.complete) await new Promise((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
  await image.decode();
});
const halberd = await page.evaluate(() => {
  const scroll = document.querySelector('.detail-scroll');
  const art = document.querySelector('.detail-art')?.getBoundingClientRect();
  const copy = document.querySelector('.detail-copy');
  return {
    title: document.querySelector('.detail-title')?.textContent,
    affixCount: document.querySelectorAll('.affix-card').length,
    needsScroll: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
    artWidth: art?.width,
    artHeight: art?.height,
    spellFont: copy ? parseFloat(getComputedStyle(copy).fontSize) : null,
  };
});
console.log('halberd', JSON.stringify(halberd, null, 2));
await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-detail-halberd-1600.png' });
await browser.close();
