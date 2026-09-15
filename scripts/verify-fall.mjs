/**
 * 下坠穿模验证脚本（临时，验证后可删）：headless Chromium 打开技能测试台，
 * 构造一次竖向 4 连（列 4 清 4 格 → 补充堆 stack=4 + 钳制场景），逐帧采样
 * 该列宝石中心间距，断言全程 ≥ 0.9 格；并保存下落中段的截图。
 *
 * 运行：node scripts/verify-fall.mjs [port]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const port = process.argv[2] ?? '5199';
const outDir = path.resolve('artifacts');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1780, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.goto(`http://localhost:${port}/skills-test.html`);
await page.waitForSelector('[data-testid="battle-wrapper"]', { timeout: 20000 });
await page.waitForTimeout(3500); // 等棋盘初始化 + 开局事件播完

// 构造竖向 4 连：列 4 rows 3/4/5 = 红，(2,3) = 红，(2,4) = 蓝；交换 (2,3)↔(2,4) 后
// 红入 (2,4) 成 rows 2-5 竖向 4 连 → 列 4 清 4 格（stack=4 补充 + 钳制 travel 场景）
await page.evaluate(() => {
  const app = window.__testPage.app;
  const engine = app.engine;
  const state = engine.state ?? engine._state;
  const board = state.board;
  const mk = (id, color) => ({ id, type: { kind: 'color', color } });
  const boardView = app.board;
  for (const [r, c, color] of [[3,4,'Red'],[4,4,'Red'],[5,4,'Red'],[2,4,'Blue'],[2,3,'Red']]) {
    const old = board.get({ row: r, col: c });
    board.set({ row: r, col: c }, mk(991000 + r * 8 + c, color));
    // 同步移除被覆盖宝石的旧精灵（真实对局由 clear 管线负责；直接改棋盘必须手动清）
    if (old) boardView.removeGem(old.id);
  }
  return { ok: true };
});

// 采样器：每帧记录棋盘各列宝石中心 y，跟踪列 4 的最小相邻间距
await page.evaluate(() => {
  const app = window.__testPage.app;
  const boardView = app.board;
  const cell = boardView.cellSize;
  // 宝石精灵在内层容器 board.children[1]
  const gemLayer = boardView.children.find((c) => c.children?.length > 10) ?? boardView;
  window.__fallSample = { minGap: Infinity, minGapAt: -1, frames: 0, col: 4, cell, maxOverlapFrames: 0 };
  const sample = () => {
    const s = window.__fallSample;
    s.frames += 1;
    const ys = [];
    for (const child of gemLayer.children) {
      if (typeof child.x !== 'number') continue;
      const col = Math.round(child.x / cell - 0.5);
      if (col === s.col) ys.push(child.y);
    }
    ys.sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      const gap = ys[i] - ys[i - 1];
      if (gap > 1 && gap < s.minGap) { s.minGap = gap; s.minGapAt = performance.now(); }
      if (gap > 1 && gap < cell * 0.9) s.maxOverlapFrames += 1;
    }
  };
  window.__fallTimer = setInterval(sample, 16);
});

await page.evaluate(() => window.__testPage.app.handleSwap({ row: 2, col: 3 }, { row: 2, col: 4 }));
await page.waitForTimeout(900); // 下落中段截图
const midShot = path.join(outDir, 'fall-midfall.png');
await page.screenshot({ path: midShot, clip: { x: 380, y: 0, width: 760, height: 900 } });
await page.waitForTimeout(2200); // 等动画全部落定

const stats = await page.evaluate(() => {
  clearInterval(window.__fallTimer);
  const s = window.__fallSample;
  const cell = s.cell;
  return { minGapPx: Math.round(s.minGap), minGapCells: +(s.minGap / cell).toFixed(3), overlapFrames: s.maxOverlapFrames, frames: s.frames, cell };
});
console.log('[verify-fall]', JSON.stringify(stats));
console.log(stats.minGapCells >= 0.9 && stats.overlapFrames === 0 ? 'PASS: 全程同列间距 ≥ 0.9 格，无穿模' : `FAIL: 最小间距 ${stats.minGapCells} 格，重叠帧 ${stats.overlapFrames}`);
console.log('中段截图:', midShot);

await browser.close();
process.exit(stats.minGapCells >= 0.9 ? 0 : 1);
