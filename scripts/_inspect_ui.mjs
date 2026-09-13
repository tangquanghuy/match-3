// UI 几何巡检：用无头浏览器加载页面，导出角色卡/魔力角标/法力宝石的真实包围盒，
// 检测重叠与越界，并存截图。供人工与 AI 核对视觉，而非盲改。
// 用法: node scripts/_inspect_ui.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle' });
// 等角色卡渲染
await page.waitForSelector('.gcard', { timeout: 10000 });
await page.waitForTimeout(600);

const data = await page.evaluate(() => {
  const rects = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy;
  };
  const cards = [...document.querySelectorAll('.gcard')].slice(0, 3).map((card, i) => {
    const cr = rects(card);
    const magic = card.querySelector('.magic');
    const gem = card.querySelector('.gem');
    const mr = magic ? rects(magic) : null;
    const gr = gem ? rects(gem) : null;
    const cs = magic ? getComputedStyle(magic) : null;
    return {
      i,
      card: cr,
      magic: mr,
      magicText: magic?.textContent?.trim(),
      magicStyle: cs ? { bg: cs.background.slice(0, 40), color: cs.color, border: cs.borderColor } : null,
      gem: gr,
      // 魔力角标是否超出卡片上/右边界
      magicOverflowTop: mr ? mr.y < cr.y - 1 : null,
      magicOverflowRight: mr ? mr.x + mr.w > cr.x + cr.w + 1 : null,
      // 魔力角标与法力宝石重叠面积（应为 0）
      magicGemOverlap: mr && gr ? overlap(mr, gr) : null,
    };
  });
  return { cards };
});

console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'scripts/_ui_shot.png', fullPage: false });

// 额外：裁剪首张卡片的上半区（法力宝石 + 魔力角标所在），放大看角标观感
const first = await page.$('.gcard');
if (first) {
  const box = await first.boundingBox();
  if (box) {
    await page.screenshot({
      path: 'scripts/_ui_card.png',
      clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: 70 },
    });
    // 2x 放大版：整卡
    await first.screenshot({ path: 'scripts/_ui_card_full.png' });
  }
}
console.log('screenshots -> scripts/_ui_shot.png, _ui_card.png, _ui_card_full.png');
await browser.close();
