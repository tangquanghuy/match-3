/**
 * 特殊宝石素材切割脚本（窗口 C）。
 *
 * 输入：`assets/Gemini_Generated_Image_bn9tk0bn9tk0bn9t.PNG`（实为 JPEG，Gemini 生成，
 * 扩展名与内容不符）。4 列 × 3 行网格，11 颗宝石（右下角空）：
 *   行1: doomSkull | uberDoomSkull | bomb | web
 *   行2: ghost     | wildcard2     | wildcard4 | wish
 *   行3: lightningCol(yellow/竖) | lightningRow(blue/横) | hourglass | (空)
 *
 * 处理：playwright 无头 chromium 解码（系统无 ImageMagick；ffmpeg 的全局 colorkey
 * 会把幽灵宝石本体一起抠掉，故用洪泛填充只清除与格边框连通的白色背景）→
 * 软边处理 → 内容裁切 → 居中缩放到 256×256（与 src/assets/gems/*.png 一致，
 * 即美术需求单的 128 逻辑像素 @2x）→ 输出 `src/assets/gems/special/<kind>.png`。
 *
 * 用法：node scripts/split_special_gems.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(root, 'assets/Gemini_Generated_Image_bn9tk0bn9tk0bn9t.PNG');
const OUT_DIR = resolve(root, 'src/assets/gems/special');

/** (row, col) → 文件名；(2,3) 为空格不产出 */
const CELLS = [
  { name: 'doomSkull', row: 0, col: 0 },
  { name: 'uberDoomSkull', row: 0, col: 1 },
  { name: 'bomb', row: 0, col: 2 },
  { name: 'web', row: 0, col: 3 },
  { name: 'ghost', row: 1, col: 0 },
  { name: 'wildcard2', row: 1, col: 1 },
  { name: 'wildcard4', row: 1, col: 2 },
  { name: 'wish', row: 1, col: 3 },
  { name: 'lightningCol', row: 2, col: 0 },
  { name: 'lightningRow', row: 2, col: 1 },
  { name: 'hourglass', row: 2, col: 2 },
];

const COLS = 4;
const ROWS = 3;
const TARGET_SIZE = 256;   // 输出画布边长（2x of 128）
const WHITE_CORE = 232;    // ≥ 此 min(r,g,b) 视为背景核心（洪泛）
const WHITE_SOFT = 190;    // 洪泛前沿的软边带下限
const MARGIN_RATIO = 0.05; // 裁切保留边距（占内容长边比例）

/** 在浏览器页面内执行：解码 → 逐格抠底/裁切/缩放 → 返回 PNG dataURL 列表 */
/* eslint-disable no-undef */
async function pageMain({ cells, cols, rows, target, core, soft, marginRatio }) {
  const img = document.querySelector('img');
  await img.decode().catch(() => {});
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const sheet = ctx.getImageData(0, 0, W, H).data;

  const cellW = W / cols;
  const cellH = H / rows;

  const out = [];
  for (const { name, row, col } of cells) {
    const x0 = Math.floor(col * cellW);
    const y0 = Math.floor(row * cellH);
    const x1 = Math.min(W, Math.floor((col + 1) * cellW));
    const y1 = Math.min(H, Math.floor((row + 1) * cellH));
    const cw = x1 - x0;
    const ch = y1 - y0;

    // 1. 取该格像素（RGBA 拷贝，后续就地改 alpha）
    const px = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      const srcStart = ((y0 + y) * W + x0) * 4;
      px.set(sheet.subarray(srcStart, srcStart + cw * 4), y * cw * 4);
    }
    const minOf = (i) => Math.min(px[i], px[i + 1], px[i + 2]);

    // 2. 从格边框洪泛填充白色背景（白底与格间隙都连通到边框）
    const total = cw * ch;
    const isBg = new Uint8Array(total);
    const queue = new Int32Array(total);
    let qh = 0;
    let qt = 0;
    const push = (idx) => {
      if (!isBg[idx] && minOf(idx * 4) >= core) {
        isBg[idx] = 1;
        queue[qt++] = idx;
      }
    };
    for (let x = 0; x < cw; x++) {
      push(x);
      push((ch - 1) * cw + x);
    }
    for (let y = 0; y < ch; y++) {
      push(y * cw);
      push(y * cw + cw - 1);
    }
    while (qh < qt) {
      const idx = queue[qh++];
      const x = idx % cw;
      const y = (idx / cw) | 0;
      if (x > 0) push(idx - 1);
      if (x < cw - 1) push(idx + 1);
      if (y > 0) push(idx - cw);
      if (y < ch - 1) push(idx + cw);
    }
    for (let i = 0; i < total; i++) {
      if (isBg[i]) px[i * 4 + 3] = 0;
    }

    // 3. 软边：与透明区相邻的不透明像素给部分透明，并做「白色反解」（unmix）——
    //    观察色 = α·前景 + (1-α)·白，反解出前景色 c' = (c - (1-α)·255)/α，
    //    否则深色宝石（末日骷髅/至尊/炸弹）边缘会留一圈半透明白晕，深底上非常显眼。
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = y * cw + x;
        if (isBg[idx] || px[idx * 4 + 3] === 0) continue;
        const nearTransparent =
          (x > 0 && px[(idx - 1) * 4 + 3] === 0) ||
          (x < cw - 1 && px[(idx + 1) * 4 + 3] === 0) ||
          (y > 0 && px[(idx - cw) * 4 + 3] === 0) ||
          (y < ch - 1 && px[(idx + cw) * 4 + 3] === 0);
        if (!nearTransparent) continue;
        const m = minOf(idx * 4);
        if (m >= core) {
          px[idx * 4 + 3] = 0;
          continue;
        }
        if (m <= soft) continue; // 实心边缘像素不动
        const a = 1 - (m - soft) / (core - soft); // 0..1 不透明度
        const alpha = Math.round(255 * a);
        if (alpha < 12) {
          px[idx * 4 + 3] = 0;
          continue;
        }
        const o = idx * 4;
        px[o] = Math.max(0, Math.min(255, Math.round((px[o] - (1 - a) * 255) / a)));
        px[o + 1] = Math.max(0, Math.min(255, Math.round((px[o + 1] - (1 - a) * 255) / a)));
        px[o + 2] = Math.max(0, Math.min(255, Math.round((px[o + 2] - (1 - a) * 255) / a)));
        px[o + 3] = alpha;
      }
    }

    // 3.5 二轮软边：上轮产生的半透明像素会使其不透明邻域成为新的"前沿"，
    //     再做一层更窄的过渡，避免半透明/不透明像素之间出现生硬台阶。
    for (let pass = 0; pass < 1; pass++) {
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const idx = y * cw + x;
          if (px[idx * 4 + 3] !== 255) continue;
          const nbAlpha = [
            x > 0 ? px[(idx - 1) * 4 + 3] : 255,
            x < cw - 1 ? px[(idx + 1) * 4 + 3] : 255,
            y > 0 ? px[(idx - cw) * 4 + 3] : 255,
            y < ch - 1 ? px[(idx + cw) * 4 + 3] : 255,
          ];
          const minNb = Math.min(...nbAlpha);
          if (minNb >= 255 || minNb === 0) continue;
          const m = minOf(idx * 4);
          if (m < soft) continue;
          const a = Math.max(0, 1 - (m - soft) / (core - soft)) * 0.5 + 0.5;
          px[idx * 4 + 3] = Math.min(px[idx * 4 + 3], Math.round(255 * a));
        }
      }
    }

    // 4. 最大连通域过滤：只保留宝石主体（上邻格边缘可能被划进本格，丢弃远处小碎块）
    {
      const comp = new Int32Array(total).fill(-1);
      const compQueue = new Int32Array(total);
      let bestId = -1;
      let bestSize = 0;
      let nextId = 0;
      for (let start = 0; start < total; start++) {
        if (comp[start] !== -1 || px[start * 4 + 3] <= 20) continue;
        let qh = 0;
        let qt = 0;
        compQueue[qt++] = start;
        comp[start] = nextId;
        while (qh < qt) {
          const idx = compQueue[qh++];
          const x = idx % cw;
          const y = (idx / cw) | 0;
          const tryN = (n) => {
            if (n >= 0 && n < total && comp[n] === -1 && px[n * 4 + 3] > 20) {
              comp[n] = nextId;
              compQueue[qt++] = n;
            }
          };
          tryN(x > 0 ? idx - 1 : -1);
          tryN(x < cw - 1 ? idx + 1 : -1);
          tryN(y > 0 ? idx - cw : -1);
          tryN(y < ch - 1 ? idx + cw : -1);
        }
        if (qt > bestSize) {
          bestSize = qt;
          bestId = nextId;
        }
        nextId++;
      }
      for (let i = 0; i < total; i++) {
        if (px[i * 4 + 3] > 20 && comp[i] !== bestId) px[i * 4 + 3] = 0;
      }
    }

    // 5. 内容 bbox + 边距裁切
    let minX = cw;
    let minY = ch;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (px[(y * cw + x) * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      out.push({ name, empty: true });
      continue;
    }
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const margin = Math.round(Math.max(contentW, contentH) * marginRatio);
    const cx0 = Math.max(0, minX - margin);
    const cy0 = Math.max(0, minY - margin);
    const cx1 = Math.min(cw, maxX + 1 + margin);
    const cy1 = Math.min(ch, maxY + 1 + margin);
    const cropW = cx1 - cx0;
    const cropH = cy1 - cy0;

    // 6. 居中缩放到 target×target 透明画布（浏览器高质量重采样）
    const scale = Math.min(target / cropW, target / cropH);
    const dw = Math.max(1, Math.round(cropW * scale));
    const dh = Math.max(1, Math.round(cropH * scale));
    const dx = (target - dw) >> 1;
    const dy = (target - dh) >> 1;
    const sCan = document.createElement('canvas');
    sCan.width = cw;
    sCan.height = ch;
    sCan.getContext('2d').putImageData(new ImageData(px, cw, ch), 0, 0);
    const dCan = document.createElement('canvas');
    dCan.width = target;
    dCan.height = target;
    const dCtx = dCan.getContext('2d');
    dCtx.imageSmoothingEnabled = true;
    dCtx.imageSmoothingQuality = 'high';
    dCtx.drawImage(sCan, cx0, cy0, cropW, cropH, dx, dy, dw, dh);
    out.push({ name, empty: false, png: dCan.toDataURL('image/png'), w: cropW, h: cropH });
  }
  return { size: [W, H], out };
}
/* eslint-enable no-undef */

const browser = await chromium.launch();
try {
  // 源文件是 Gemini 生成的变体 JPEG（.PNG 扩展名 + JP2 元数据盒），chromium 解不了；
  // 先用系统 ffmpeg 规范化为 PNG（更宽容的解码器）。
  // about:blank 的不透明 origin 既不能加载 file://，超大 data URL 也不可靠，
  // 因此用 route 拦截伪造 http 页面提供图片。
  const normalized = resolve(root, 'assets/_special_sheet_normalized.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', INPUT, '-frames:v', '1', normalized]);
  const page = await browser.newPage();
  await page.route('**/special-sheet.png', (route) =>
    route.fulfill({
      path: normalized,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }));
  await page.setContent('<body><img src="http://probe.local/special-sheet.png" crossorigin="anonymous"></body>');

  const runInPage = new Function(
    'cfg',
    `return (${pageMain.toString()})(cfg);`,
  );
  const result = await page.evaluate(runInPage, {
    cells: CELLS,
    cols: COLS,
    rows: ROWS,
    target: TARGET_SIZE,
    core: WHITE_CORE,
    soft: WHITE_SOFT,
    marginRatio: MARGIN_RATIO,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const [W, H] = result.size;
  console.log(`源图 ${W}x${H}，格 ${Math.floor(W / COLS)}x${Math.floor(H / ROWS)}`);
  for (const item of result.out) {
    if (item.empty) {
      console.log(`跳过空格: ${item.name}`);
      continue;
    }
    const file = resolve(OUT_DIR, `${item.name}.png`);
    writeFileSync(file, Buffer.from(item.png.slice('data:image/png;base64,'.length), 'base64'));
    console.log(`✓ ${item.name}.png  (源内容 ${item.w}x${item.h} → ${TARGET_SIZE}x${TARGET_SIZE})`);
  }
} finally {
  await browser.close();
  try {
    rmSync(resolve(root, 'assets/_special_sheet_normalized.png'));
  } catch {
    // 清理失败不影响产物
  }
}
