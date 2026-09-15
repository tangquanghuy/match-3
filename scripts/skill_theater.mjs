#!/usr/bin/env node
/**
 * 放映厅 runner（窗口 G · TASK-THEATER 阶段 1/2 + 用户扩展）。
 *
 * 三种放映模式，全部经 tests/e2e/theater.html 走主游戏真实装配/释放/演出链路：
 *   skills  —— 遍历技能库（registry 现场读取，E 落库即生效）：装到我方队首 → 充能 → 施放 →
 *              「施放中/结算后」两张截图 + 事件流 + 描述对账。
 *   traits  —— 遍历 traits.json 已实现 code：定制对局（特质挂满我方）→ 脚本化刺激
 *              （回合×2 / 六色三连 / 5 连 / 骷髅连 / 受击 / 自施法）→ 分段事件流 + 截图。
 *   enemies —— tier×种族枚举：敌队 skillId/traitIds 省略 → 分拣引擎自动编配 →
 *              敌方 AI 施放其技能 → 编配结果 + 截图（图鉴数据源）。
 *
 * 用法：
 *   node scripts/skill_theater.mjs --mode skills [--only 7004,7062] [--offset 0 --limit 60]
 *   node scripts/skill_theater.mjs --mode traits  [--only thickhide,frenzy]
 *   node scripts/skill_theater.mjs --mode enemies [--only boss-Dragon]
 *   node scripts/skill_theater.mjs --mode all
 *   node scripts/skill_theater.mjs --mode gallery   # 仅重建画廊
 * 通用参数：--port 5175 --headed --timeout 25000 --page-size 40 --no-shots --mana-cost 3
 *
 * 产物：artifacts/theater/{skills,traits,enemies}/<key>.{json,mid.jpg,end.jpg} + 画廊 html。
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { ensureServer, disposeServer } from './theater/server.mjs';
import {
  loadContentIndex, traitScenarioRequest, enemyScenarioRequest,
  encodeRequest, RACES, TIERS, raceForTrait,
} from './theater/requests.mjs';
import { auditSkillCast, auditTraitEvents } from './theater/reconcile.mjs';
import { buildGalleries } from './theater/gallery.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'artifacts', 'theater');
const DRIVER_SRC = await readFile(new URL('./theater/inject-driver.js', import.meta.url), 'utf8');

// —— CLI ——
const argv = process.argv.slice(2);
function argValue(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
const MODE = argValue('mode', 'skills');
const ONLY = argValue('only', '');
const OFFSET = Number(argValue('offset', 0));
const LIMIT = Number(argValue('limit', Infinity)) || Infinity;
const PAGE_SIZE = Number(argValue('page-size', 40));
const PORT = Number(argValue('port', 5175));
const TIMEOUT = Number(argValue('timeout', 25000));
const HEADED = argv.includes('--headed');
const NO_SHOTS = argv.includes('--no-shots');
const MANA_COST = Number(argValue('mana-cost', 3));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms, tag) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`超时(${ms}ms): ${tag}`)), ms)),
]);

async function main() {
  const index = loadContentIndex();
  if (MODE === 'gallery') {
    await buildGalleries(OUT, index);
    console.log('[gallery] 已重建画廊（仅画廊模式）');
    return;
  }

  const server = await ensureServer({ port: PORT });
  console.log(`[theater] dev 服务：${server.base}${server.reused ? '（复用现有）' : ''}`);
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 945 },
    deviceScaleFactor: 1,
  });

  try {
    const modes = MODE === 'all' ? ['skills', 'traits', 'enemies'] : [MODE];
    for (const m of modes) {
      if (m === 'skills') await runSkills(ctx, server.base, index);
      else if (m === 'traits') await runTraits(ctx, server.base, index);
      else if (m === 'enemies') await runEnemies(ctx, server.base, index);
      else throw new Error(`未知模式：${m}（skills|traits|enemies|all|gallery）`);
    }
  } finally {
    await browser.close().catch(() => {});
    disposeServer(server);
  }

  await buildGalleries(OUT, index);
  console.log('[theater] 画廊已重建 → artifacts/theater/index.html');
}

// —— 页面装配 ——

async function newTheaterPage(ctx, base, request) {
  const page = await ctx.newPage();
  await page.addInitScript(DRIVER_SRC);
  const url = new URL('/tests/e2e/theater.html', base);
  if (request) url.searchParams.set('req', encodeRequest(request));
  page.setDefaultTimeout(TIMEOUT);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.evaluate((mc) => window.__theater.install({ manaCost: mc }), MANA_COST);
  return page;
}

async function waitForReady(page) {
  await withTimeout(page.waitForFunction(() => {
    const el = document.querySelector('[data-test-ready]');
    return el && (el.dataset.testReady === 'true' || el.dataset.testReady === 'error');
  }, null, { polling: 120 }), 45_000, 'theater.html 就绪');
  const state = await page.evaluate(() => document.querySelector('[data-test-ready]')?.dataset.testReady);
  if (state === 'error') throw new Error('theater.html 初始化失败（详见页面控制台）');
}

async function shot(page, filePath, tag) {
  if (NO_SHOTS) return null;
  const box = await page.locator('[data-testid="battle-wrapper"]').boundingBox().catch(() => null);
  const vp = page.viewportSize();
  const clip = box ? {
    x: Math.max(0, Math.floor(box.x - 6)),
    y: Math.max(0, Math.floor(box.y - 6)),
    width: Math.min(Math.ceil(box.width + 12), vp.width),
    height: Math.min(Math.ceil(box.height + 12), vp.height),
  } : undefined;
  await page.screenshot({ path: filePath, type: 'jpeg', quality: 82, clip });
  return tag;
}

async function finishAct(page, { settleMs } = {}) {
  const events = await withTimeout(
    page.evaluate((ms) => window.__theater.finishAct(ms), settleMs),
    TIMEOUT, '演出完成',
  );
  return events;
}

/** 演出中途截图的施放：begin → 等 midMs → 截图（midPath 为空则不截）→ 等完成 */
async function actWithMidShot(page, action, midPath, { midMs = 550 } = {}) {
  const begun = await page.evaluate((a) => window.__theater.beginAct(a, undefined), action);
  if (!begun.accepted) return { begun, events: [], error: begun.reason || 'action-not-accepted' };
  if (midPath) {
    await sleep(midMs);
    await shot(page, midPath, 'mid');
  }
  let events = [];
  let error = null;
  try {
    const res = await finishAct(page);
    events = res.events; error = res.error;
  } catch (e) {
    error = String(e.message || e);
  }
  return { begun, events, error };
}

// —— 模式一：技能 ——

async function runSkills(ctx, base, index) {
  const outDir = path.join(OUT, 'skills');
  await mkdir(outDir, { recursive: true });

  const probe = await newTheaterPage(ctx, base, null);
  const allIds = await page_skillIds(probe);
  await probe.close();
  let ids = allIds;
  if (ONLY) {
    const want = new Set(ONLY.split(',').map((s) => s.trim()));
    ids = ids.filter((id) => want.has(id) || want.has(String(Number(id))));
  }
  const slice = ids.slice(OFFSET, OFFSET === 0 ? LIMIT : OFFSET + LIMIT);
  console.log(`[skills] 库内技能共 ${allIds.length} 条，筛选后 ${ids.length} 条，本批 ${slice.length} 条（offset=${OFFSET}）`);

  let page = null;
  let sinceBoot = 0;
  let done = 0;
  for (const id of slice) {
    if (!page || sinceBoot >= PAGE_SIZE) {
      if (page) await page.close().catch(() => {});
      page = await newTheaterPage(ctx, base, null);
      sinceBoot = 0;
    }
    const info = index.spells.get(Number(id)) || { name: `(${id})`, desc: '', troopName: '', kingdom: '', rarity: '', troopTypes: [] };
    const meta = {
      mode: 'skills', id: Number(id), name: info.name, desc: info.desc,
      troopName: info.troopName, kingdom: info.kingdom, rarity: info.rarity,
      status: 'ok', error: null, events: [], audit: null, durationMs: 0,
    };
    const t0 = Date.now();
    try {
      await page.evaluate(() => { window.__theater.referee({ hp: 220 }); window.__theater.clearEvents(); });
      const set = await page.evaluate((sid) => {
        const ok = window.__theater.setSkillChar(0, sid);
        if (ok) window.__theater.fillManaAll();
        return ok;
      }, id);
      if (!set) throw new Error('registry 无此技能原型');

      const { events, error } = await actWithMidShot(
        page, { type: 'cast', characterId: 0 },
        path.join(outDir, `${id}.mid.jpg`),
      );
      if (error) throw new Error(error);
      meta.events = events;
      const stream = await page.evaluate(() => window.__theater.takeEvents());
      meta.events = mergeEvents(stream, events);
      await sleep(220);
      await shot(page, path.join(outDir, `${id}.end.jpg`), 'end');
      if (meta.events.length === 0) throw new Error('事件流为空（施放未生效）');
      meta.audit = auditSkillCast(info.desc, meta.events);
    } catch (e) {
      meta.status = 'failed';
      meta.error = String(e.message || e);
      // 页面可能处于坏态（超时/冻结）：整页重置，下一条换新页
      await page.close().catch(() => {});
      page = null;
    }
    meta.durationMs = Date.now() - t0;
    await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(meta, null, 1), 'utf8');
    done += 1;
    sinceBoot += 1;
    const flag = meta.status === 'ok' ? (meta.audit?.suspicious ? '⚠' : '✓') : '✗';
    console.log(`[skills ${done}/${slice.length}] ${flag} ${id} ${info.name} (${meta.durationMs}ms)${meta.error ? ' ' + meta.error : ''}`);
  }
  if (page) await page.close().catch(() => {});
}

function page_skillIds(page) {
  return page.evaluate(() => window.__theater.skillIds());
}

/** 事件流去重合并：takeEvents 全量为准（已含 beginAct 的旁路） */
function mergeEvents(stream, _fallback) {
  return stream;
}

// —— 模式二：特质 ——

const TRAIT_COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'];

async function runTraits(ctx, base, index) {
  const outDir = path.join(OUT, 'traits');
  await mkdir(outDir, { recursive: true });

  let codes = [...index.traitNames.keys()];
  if (ONLY) {
    const want = new Set(ONLY.split(',').map((s) => s.trim()));
    codes = codes.filter((c) => want.has(c));
  }
  const slice = codes.slice(OFFSET, OFFSET === 0 ? LIMIT : OFFSET + LIMIT);
  console.log(`[traits] traits.json 共 ${index.traitNames.size} code，本批 ${slice.length} 个（offset=${OFFSET}）`);

  let done = 0;
  for (const code of slice) {
    const tInfo = index.traitNames.get(code);
    const meta = {
      mode: 'traits', code, name: tInfo.name, desc: tInfo.description,
      race: raceForTrait(code), status: 'ok', error: null,
      segments: [], audit: null, state0: null, durationMs: 0, shots: [],
    };
    const t0 = Date.now();
    let page = null;
    try {
      const request = traitScenarioRequest(code, 20260916 + hashOf(code));
      page = await newTheaterPage(ctx, base, request);
      meta.state0 = await page.evaluate(() => window.__theater.stateSummary());
      await shot(page, path.join(outDir, `${code}.0-boot.jpg`), 'boot');
      meta.shots.push('0-boot');

      const stim = await traitStimuli(page, outDir, code, meta);
      meta.segments = stim.segments;

      // 收尾：裁判复位 + 终局照
      await page.evaluate(() => window.__theater.referee({ hp: 220 }));
      await sleep(200);
      await shot(page, path.join(outDir, `${code}.9-final.jpg`), 'final');
      meta.shots.push('9-final');

      const allEvents = meta.segments.flatMap((s) => s.events);
      meta.audit = auditTraitEvents(tInfo.description, allEvents);
    } catch (e) {
      meta.status = 'failed';
      meta.error = String(e.message || e);
    } finally {
      if (page) await page.close().catch(() => {});
    }
    meta.durationMs = Date.now() - t0;
    await writeFile(path.join(outDir, `${code}.json`), JSON.stringify(meta, null, 1), 'utf8');
    done += 1;
    const flag = meta.status === 'ok' ? (meta.audit?.suspicious ? '⚠' : '✓') : '✗';
    console.log(`[traits ${done}/${slice.length}] ${flag} ${code} ${tInfo.name} (${meta.durationMs}ms)${meta.error ? ' ' + meta.error : ''}`);
  }
}

/** 特质刺激脚本：每个特质同一套标准化刺激，事件按段落标注 */
async function traitStimuli(page, outDir, code, meta) {
  const segments = [];
  let shotCount = 0;
  const MAX_STIM_SHOTS = 3;

  /**
   * 执行一段刺激：可选先预置棋盘（paint），再以 actionFn 动态求值行动
   * （五连/骷髅连的交换目标依赖预置后的盘面），事件以 takeEvents 全量落段。
   */
  const record = async (label, { paint, actionFn, midTag } = {}) => {
    await page.evaluate(() => window.__theater.clearEvents());
    if (paint) {
      const paintOk = await page.evaluate((changes) => window.__theater.paint(changes), paint.changes);
      if (!paintOk) {
        await sleep(600);
        const ok2 = await page.evaluate((changes) => window.__theater.paint(changes), paint.changes);
        if (!ok2) {
          segments.push({ label, events: [], note: 'paint 被拒（解析中）' });
          return;
        }
      }
      await sleep(420);
    }
    let note = null;
    if (actionFn) {
      const action = await actionFn();
      if (action) {
        const res = await actWithMidShot(page, action, null, { midMs: 400 });
        if (res.error && !res.begun?.accepted) note = res.error;
      } else {
        note = '无可用交换';
      }
    }
    const events = await page.evaluate(() => window.__theater.takeEvents());
    segments.push({ label, events, ...(note ? { note } : {}) });

    const interesting = events.some((e) => [
      'buff', 'status-apply', 'status-cleanse', 'status-tick', 'summon',
      'storm-change', 'extra-turn', 'special-gem-trigger',
    ].includes(e.type));
    if (midTag && interesting && shotCount < MAX_STIM_SHOTS && !NO_SHOTS) {
      const file = `${code}.s${++shotCount}-${midTag}.jpg`;
      await shot(page, path.join(outDir, file), midTag);
      meta.shots.push(file.replace(/\.jpg$/, ''));
    }
  };

  // S0 制造血量缺口：回合开始回复/受击系特质需要「有伤可回/可触发」才看得到事件
  await page.evaluate(() => {
    const st = window.__theater.stateSummary();
    for (const c of st.teams.Left.characters) window.__theater.setHp(c.id, c.hp - 12);
  });

  // S1 回合边界 ×2（开局光环 / 回合开始回复 / DoT 等）
  await page.evaluate(() => window.__theater.ensureActive('Left'));
  await record('回合×2a', { actionFn: async () => 'pass' });
  await record('回合×2b', { actionFn: async () => 'pass' });

  // S2 六色三连
  for (const color of TRAIT_COLORS) {
    const swap = await page.evaluate((c) => window.__theater.findSwapForColor(c), color);
    if (swap) await record(`配对·${color}`, { actionFn: async () => ({ type: 'swap', from: swap.from, to: swap.to }), midTag: `match-${color}` });
  }

  // S3 五连（预置一排同色 → 任意合法交换即受理并结算 → big-match/特殊宝石钩子）
  await record('五连·预置', {
    paint: {
      changes: [2, 3, 4, 5, 6].map((col) => ({
        pos: { row: 4, col }, type: { kind: 'color', color: 'Purple' },
      })),
    },
    actionFn: async () => {
      const swap = await page.evaluate(() => window.__theater.findAnySwap());
      return swap ? { type: 'swap', from: swap.from, to: swap.to } : null;
    },
    midTag: 'big-match',
  });

  // S4 骷髅连（我方配对骷髅 → 队首攻击敌方 → 攻击附带系/骷髅倍率系特质）
  await record('骷髅连', {
    paint: {
      changes: [3, 4, 5].map((col) => ({
        pos: { row: 5, col }, type: { kind: 'skull', variant: 'normal' },
      })),
    },
    actionFn: async () => {
      const swap = await page.evaluate(() => window.__theater.findAnySwap());
      return swap ? { type: 'swap', from: swap.from, to: swap.to } : null;
    },
    midTag: 'skull-match',
  });

  // S5 受击·骷髅（敌方视角配骷髅 → 我方队首=特质载体挨刀 → 受击系特质如狂暴/反伤）
  await page.evaluate(() => window.__theater.ensureActive('Right'));
  await record('受击·骷髅', {
    paint: {
      changes: [2, 3, 4].map((col) => ({
        pos: { row: 2, col }, type: { kind: 'skull', variant: 'normal' },
      })),
    },
    actionFn: async () => {
      const swap = await page.evaluate(() => window.__theater.findAnySwap());
      return swap ? { type: 'swap', from: swap.from, to: swap.to } : null;
    },
    midTag: 'damaged',
  });

  // S6 受击·法术（敌方施放狙击打我方队首 → 法术受击系/减伤系特质的对照样本）
  await page.evaluate(() => window.__theater.ensureActive('Right'));
  const enemyId = await page.evaluate(() => {
    const st = window.__theater.stateSummary();
    return st.teams.Right.characters[0].id;
  });
  await page.evaluate((id) => window.__theater.setMana(id, 99), enemyId);
  await record('受击·敌方施法', { actionFn: async () => ({ type: 'cast', characterId: enemyId }), midTag: 'spell-hit' });

  // S7 自施法（施法响应系特质）
  await page.evaluate(() => window.__theater.ensureActive('Left'));
  await page.evaluate(() => window.__theater.setMana(0, 99));
  await record('自施法', { actionFn: async () => ({ type: 'cast', characterId: 0 }), midTag: 'self-cast' });

  return { segments };
}

// —— 模式三：敌人（分拣编配 + 敌方施放）——

async function runEnemies(ctx, base, index) {
  const outDir = path.join(OUT, 'enemies');
  await mkdir(outDir, { recursive: true });

  let combos = TIERS.flatMap((tier) => RACES.map((race) => ({ tier, race, key: `${tier}-${race}` })));
  const totalCombos = combos.length;
  if (ONLY) {
    const want = new Set(ONLY.split(',').map((s) => s.trim()));
    combos = combos.filter((c) => want.has(c.key) || [...want].some((w) => c.key.includes(w)));
  }
  const slice = combos.slice(OFFSET, OFFSET === 0 ? LIMIT : OFFSET + LIMIT);
  console.log(`[enemies] tier×种族 共 ${totalCombos} 组，筛选后 ${combos.length} 组，本批 ${slice.length} 组（offset=${OFFSET}）`);

  let done = 0;
  for (const { tier, race, key } of slice) {
    const meta = {
      mode: 'enemies', tier, race, key, status: 'ok', error: null,
      enemy: [], events: [], durationMs: 0, shots: [],
    };
    const t0 = Date.now();
    let page = null;
    try {
      const request = enemyScenarioRequest(tier, race, 20260916 + hashOf(key));
      page = await newTheaterPage(ctx, base, request);
      const sum0 = await page.evaluate(() => window.__theater.stateSummary());
      meta.enemy = sum0.teams.Right.characters.map((c) => ({
        id: c.id, name: c.name, hp: c.maxHp, attack: c.attack, armor: c.armor, magic: c.magic,
        skillId: c.skillId,
        skillName: index.spells.get(Number(c.skillId))?.name || c.skillId,
        traitIds: c.traitIds,
        traitNames: c.traitIds.map((t) => index.traitNames.get(t)?.name || t),
      }));
      await shot(page, path.join(outDir, `${key}.0-boot.jpg`), 'boot');
      meta.shots.push('0-boot');

      // 敌方施放：换边 → 充能 → 队首敌人施放其编配技能
      await page.evaluate(() => window.__theater.ensureActive('Right'));
      const castInfo = await page.evaluate(() => {
        const st = window.__theater.stateSummary();
        const front = st.teams.Right.characters.find((c) => !c.defeated);
        if (!front) return { id: null };
        window.__theater.setMana(front.id, 99);
        window.__theater.clearEvents();
        return { id: front.id, skillId: front.skillId };
      });
      if (castInfo.id !== null) {
        const res = await actWithMidShot(
          page, { type: 'cast', characterId: castInfo.id },
          path.join(outDir, `${key}.1-cast.jpg`),
        );
        meta.caster = castInfo;
        meta.events = res.events;
        if (res.error && res.events.length === 0) meta.castError = res.error;
        meta.shots.push('1-cast');
        const stream = await page.evaluate(() => window.__theater.takeEvents());
        if (meta.events.length === 0) meta.events = stream;
      }
      await sleep(200);
      await shot(page, path.join(outDir, `${key}.2-end.jpg`), 'end');
      meta.shots.push('2-end');
    } catch (e) {
      meta.status = 'failed';
      meta.error = String(e.message || e);
    } finally {
      if (page) await page.close().catch(() => {});
    }
    meta.durationMs = Date.now() - t0;
    await writeFile(path.join(outDir, `${key}.json`), JSON.stringify(meta, null, 1), 'utf8');
    done += 1;
    const flag = meta.status === 'ok' ? '✓' : '✗';
    console.log(`[enemies ${done}/${slice.length}] ${flag} ${key} (${meta.durationMs}ms)${meta.error ? ' ' + meta.error : ''}`);
  }
}

function hashOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

main().catch((e) => {
  console.error('[theater] 失败：', e);
  process.exitCode = 1;
});
