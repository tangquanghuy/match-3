/**
 * 移动端横屏验收：模拟移动浏览器出图 + 运行时几何审计。
 *
 * 用法（需要先另开终端跑 `npm run dev`）：
 *   node scripts/mobile-acceptance-shots.mjs
 *   node scripts/mobile-acceptance-shots.mjs --url http://localhost:5173/
 *
 * 所有产物集中写到 artifacts/mobile-acceptance/（已在 .gitignore 中忽略）：
 *   - <宽>x<高>-{portrait,landscape}.png  截图
 *   - audit.json                          几何与卡面比例数据 + 控制台错误
 *
 * 环境固定为 Chromium + isMobile + hasTouch + DPR 3，与 tests/e2e/mobileLayout.spec.ts 对齐。
 * 注意：这是模拟移动端，不等价于 iOS Safari / Android Chrome 真机验收。
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const urlFlag = process.argv.indexOf('--url');
const BASE_URL = urlFlag >= 0 ? process.argv[urlFlag + 1] : 'http://localhost:5173/';
const OUT_DIR = path.join('artifacts', 'mobile-acceptance');

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 852, height: 393 },
  { width: 915, height: 412 },
];

/** 竖屏门禁：不应初始化战场，也不该留下渲染异常的装饰图形。 */
const auditPortrait = () => {
  const gate = document.querySelector('#orientation-gate');
  return {
    viewportBlocked: document.querySelector('#app').dataset.viewportBlocked,
    canvasCount: document.querySelectorAll('canvas').length,
    gateIconCount: document.querySelectorAll('.gate-icon').length,
    gateSvgCount: gate.querySelectorAll('svg').length,
    gateText: gate.innerText.replace(/\s+/g, ' ').trim(),
  };
};

/** 横屏：wrapper/卡片/控件的越界与重叠，HUD 间隙，以及卡面覆盖层占卡百分比。 */
const auditLandscape = () => {
  const round = (n, digits = 2) => Number(n.toFixed(digits));
  const overlapArea = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  const mount = document.querySelector('#app');
  const wrapper = document.querySelector('[data-testid="battle-wrapper"]');
  const fullscreen = document.querySelector('[data-testid="fullscreen-button"]');
  const teamToggle = document.querySelector('[data-testid="team-size-toggle"]');
  const hud = document.querySelector('.turn-hud');
  const allyCards = [...document.querySelectorAll('.gcard.ally')];
  const enemyCards = [...document.querySelectorAll('.gcard.enemy')];

  const mountRect = mount.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const scale = wrapperRect.width / Number.parseFloat(wrapper.style.width);
  const firstRowTop = wrapperRect.top + window.__app.root.y * scale;

  const card = allyCards[0];
  const cardRect = card.getBoundingClientRect();
  /** 覆盖层尺寸相对卡片的百分比：卡内比例与视口缩放无关，跨尺寸应完全一致。 */
  const overlayPct = (selector) => {
    const el = card.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: round(r.width, 1), h: round(r.height, 1),
      pctW: round(r.width / cardRect.width * 100, 1), pctH: round(r.height / cardRect.height * 100, 1) };
  };
  const fontOf = (selector) => {
    const el = card.querySelector(selector);
    return el ? getComputedStyle(el).fontSize : null;
  };

  return {
    viewportBlocked: mount.dataset.viewportBlocked,
    canvasCount: document.querySelectorAll('canvas').length,
    wrapperScale: round(scale, 4),
    cellSize: round(40 * scale),
    // 越界与重叠：全部应为 0 / true
    wrapperInsideMount: wrapperRect.left >= mountRect.left - 0.5 && wrapperRect.top >= mountRect.top - 0.5
      && wrapperRect.right <= mountRect.right + 0.5 && wrapperRect.bottom <= mountRect.bottom + 0.5,
    cardsOutsideWrapper: [...allyCards, ...enemyCards].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left < wrapperRect.left - 0.5 || r.right > wrapperRect.right + 0.5
        || r.top < wrapperRect.top - 0.5 || r.bottom > wrapperRect.bottom + 0.5;
    }).length,
    teamToggleCardOverlap: round(
      overlapArea(teamToggle.getBoundingClientRect(), allyCards[allyCards.length - 1].getBoundingClientRect()), 4),
    fullscreenCardOverlap: round(
      overlapArea(fullscreen.getBoundingClientRect(), enemyCards[enemyCards.length - 1].getBoundingClientRect()), 4),
    hudGapToFirstRow: round(firstRowTop - hud.getBoundingClientRect().bottom, 4),
    // 触控区：全屏与队伍人数按钮须 ≥44；法力宝石为二级入口，只守 ≥28
    touchTargets: Object.fromEntries(
      [['fullscreen', fullscreen], ['teamToggle', teamToggle], ['manaGem', card.querySelector('.gem')]]
        .map(([name, el]) => {
          const r = el.getBoundingClientRect();
          return [name, { w: round(r.width, 1), h: round(r.height, 1) }];
        }),
    ),
    card: { w: round(cardRect.width, 1), h: round(cardRect.height, 1) },
    cardOverlays: {
      manaGem: overlayPct('.gem'),
      magicBadge: overlayPct('.magic'),
      magicIcon: overlayPct('.ic-magic'),
      statIcon: overlayPct('.stat .ic'),
      ornament: overlayPct('.frame-ornament'),
      hpRow: overlayPct('.c-br'),
      atkRow: overlayPct('.c-bl'),
      atkFontSize: fontOf('.stat .v'),
      magicFontSize: fontOf('.magic .v'),
    },
  };
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const report = { capturedAt: new Date().toISOString(), baseUrl: BASE_URL, environment: 'chromium + isMobile + hasTouch + DPR3（模拟移动端，非真机）', viewports: {} };
const consoleIssues = [];

async function capture(viewport, label, audit) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  const tag = `${viewport.width}x${viewport.height}`;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleIssues.push(`[${tag}][error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleIssues.push(`[${tag}][pageerror] ${err.message}`));

  await page.goto(BASE_URL, { waitUntil: 'load' });
  if (label === 'portrait') {
    await page.waitForSelector('#orientation-gate', { state: 'visible' });
  } else {
    await page.waitForSelector('[data-testid="battle-wrapper"]', { state: 'visible' });
    // wrapper 早于 input/root 入 DOM，不等就绪会读到 undefined。
    await page.waitForFunction(() => Boolean(window.__app?.input) && Boolean(window.__app?.root));
  }
  await page.waitForTimeout(1800); // 让入场 tween 落定，避免截到过渡帧
  report.viewports[`${tag}-${label}`] = await page.evaluate(audit);
  const file = path.join(OUT_DIR, `${tag}-${label}.png`);
  await page.screenshot({ path: file });
  console.log(`已输出 ${file}`);
  await context.close();
}

await capture(PORTRAIT, 'portrait', auditPortrait);
for (const viewport of LANDSCAPE) await capture(viewport, 'landscape', auditLandscape);

await browser.close();
report.consoleIssues = consoleIssues;
const auditFile = path.join(OUT_DIR, 'audit.json');
fs.writeFileSync(auditFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`已输出 ${auditFile}`);
