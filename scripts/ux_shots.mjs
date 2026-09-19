// UX 审查截图工具（TASK-UX.md 阶段 A · §2.1 截图规程）
//
// 两种用法：
//
// 1) CLI 批量常态截图：
//    node scripts/ux_shots.mjs --base http://localhost:5180 map:#map team:#team events-invasion:#events/invasion
//    → design/ux-audit/shots/<name>.png
//
// 2) 作为模块被自己的走查脚本消费（推荐——交互态需要点击）：
//    import { openShell, shot, closeShell } from './ux_shots.mjs';
//    const { browser, page } = await openShell({ hash: '#troop' });
//    await shot(page, 'troop-default');
//    await page.click('...'); await shot(page, 'troop-filter-open');
//    await closeShell(browser);
//
// 约定（踩坑记录）：
// - 同页 hash 跳转必须用 location.hash 赋值（page.goto 同页 hash 不触发路由）。
// - 视口固定 1600×900（与 fitStage 舞台缩放基准一致）。
// - 每个走查脚本用独立 chromium 实例即可并行；dev server 只需一个（勿各自另起）。

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const SHOT_DIR = 'design/ux-audit/shots';
export const VIEWPORT = { width: 1600, height: 900 };

/**
 * 打开游戏外壳（game.html）。首次进入自动铺演示存档（MockGateway.buildDemoSave）。
 * @param {{ base?: string, hash?: string, viewport?: {width:number,height:number}, headless?: boolean }} opts
 */
export async function openShell(opts = {}) {
  const base = opts.base ?? process.env.UX_BASE ?? 'http://localhost:5180';
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  const page = await browser.newPage({ viewport: opts.viewport ?? VIEWPORT });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/game.html${opts.hash ?? '#map'}`, { waitUntil: 'load' });
  await page.waitForSelector('#stage .screen, #stage > *', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { browser, page, errors, base };
}

/** 同页路由跳转（location.hash 赋值 + 等渲染） */
export async function go(page, hash, wait = 700) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(wait);
}

/** 截图到 design/ux-audit/shots/<name>.png（name 不带扩展名） */
export async function shot(page, name, opts = {}) {
  const file = path.join(opts.dir ?? SHOT_DIR, `${name}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  return file;
}

/** 打开独立页面（如 weapons-codex.html）而不是 game.html 外壳 */
export async function openPage(urlPath, opts = {}) {
  const base = opts.base ?? process.env.UX_BASE ?? 'http://localhost:5180';
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  const page = await browser.newPage({ viewport: opts.viewport ?? VIEWPORT });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/${urlPath.replace(/^\//, '')}`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  return { browser, page, errors, base };
}

export async function closeShell(browser) {
  await browser.close();
}

async function main() {
  const args = process.argv.slice(2);
  let base;
  const jobs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--base') { base = args[i + 1]; i += 1; continue; }
    const [name, hash] = args[i].split(/:(.+)/);
    if (name && hash) jobs.push({ name, hash });
  }
  if (!jobs.length) {
    console.log('用法: node scripts/ux_shots.mjs [--base http://localhost:5180] <name>:<#hash> ...');
    return;
  }
  const { browser, page, errors } = await openShell({ base, hash: jobs[0].hash });
  for (const job of jobs) {
    await go(page, job.hash);
    const file = await shot(page, job.name);
    console.log(`✔ ${job.name} ← ${job.hash} → ${file}`);
  }
  if (errors.length) console.log(`⚠ console 错误 ${errors.length} 条:\n  ${errors.slice(0, 10).join('\n  ')}`);
  await closeShell(browser);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('ux_shots.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
