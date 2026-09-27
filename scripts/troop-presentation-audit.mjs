#!/usr/bin/env node
/** End-to-end skill presentation acceptance, at actual 1x speed.
 * Usage:
 *   npx vitest run tests/unit/troopAcceptance.test.ts
 *   node scripts/troop-presentation-audit.mjs
 *   node scripts/troop-presentation-audit.mjs --only 6500,6746 --seed 42
 *   node scripts/troop-presentation-audit.mjs --all --no-video
 *   node scripts/troop-presentation-audit.mjs --stress-only
 * Every case has a fresh App/session, so deaths, summons and earlier casts cannot
 * leak into the next case. No page-load, preheat, screenshot or artificial settle
 * delay is added to the in-page action clock. Videos include setup; JSON gives offset.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { acceptanceSourceHash, checkpointDone } from './theater/acceptance-evidence.mjs';
import { readdir } from 'node:fs/promises';
import { ensureServer, disposeServer } from './theater/server.mjs';
import { encodeRequest } from './theater/requests.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const OUT = path.resolve(arg('out', 'artifacts/troop-audit/visual'));
const SEED = Number(arg('seed', '42'));
const TIMEOUT = Number(arg('timeout', '120000'));
const WORKERS = Math.max(1, Math.min(6, Number(arg('workers', '1'))));
const PAGE_BATCH = Math.max(1, Math.min(20, Number(arg('page-batch', '1'))));
const NO_VIDEO = args.includes('--no-video');
const ONLY = arg('only', '').split(',').filter(Boolean).map(Number);
const defaultIds = [6004, 6500, 6366, 6746, 6991, 7798, 6963, 7124, 6262, 6529, 6090, 6131];
const report = JSON.parse(await readFile('artifacts/troop-audit/roster.json', 'utf8'));
await mkdir(OUT, { recursive: true });
const server = await ensureServer({ port: Number(arg('port', '5175')) });
const browser = await chromium.launch({ headless: !args.includes('--headed') });
const sourceHash = await acceptanceSourceHash();
const results = [];
if (args.includes('--resume')) {
  // Per-case evidence is the durable checkpoint; aggregate snapshots may lag.
  for (const file of await readdir(OUT)) if (/^(troop-|trait-|stress-).+\.json$/.test(file)) {
    try { const r = JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
      if (r.sourceHash === sourceHash) results.push(r);
    } catch { /* a process crash can leave one incomplete checkpoint */ }
  }
}

let saveQueue = Promise.resolve();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function save() {
  await writeFile(path.join(OUT, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), seed: SEED, sourceHash, workers: WORKERS, pageBatch: PAGE_BATCH, timingEnvironment: WORKERS > 1 ? "concurrent browser screening, not single-device latency benchmark" : "single worker",
    thresholds: { totalWarningMs: 6000, totalCriticalMs: 12000, visualTailWarningMs: 100, repeatedHeavyCount: 4 },
    scope: 'Fresh 4v4 fixtures; actual castPlayerSkill/session.resolve/player.play/restoreAfterCast; 1x desktop headless rendering. Timing includes ALL resulting events and finite visual tails. Smoke/binding inventory is separate.',
    results }, null, 2));
  await writeFile(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>部队整链演出验收</title>
<style>body{background:#141820;color:#eee;font:16px system-ui;margin:28px}article{border:1px solid #536072;padding:16px;margin:20px 0}img,video{max-width:48%;vertical-align:top}pre{white-space:pre-wrap}a{color:#9cceff}td,th{padding:8px;text-align:left;border-bottom:1px solid #555}.flag{color:#ffbd70}</style>
<h1>部队整链演出验收（1×）</h1><p>总时长包含伤害→爆破→下落补充→连消→法力→特质/状态→死亡/召唤→输入恢复与有限特效收尾。阈值是本次建议，不是游戏设计既定标准。</p>
<p>接线/逻辑冒烟、逐条浏览器执行与逐条视觉复核分开统计；自动选目标，4v4陪练，敌方200生命，非平衡测试。录像含加载，JSON记录 measurementVideoOffsetMs；帧间隔仅作当前测试机诊断。</p>
${results.map(r => `<article><h2>${esc(r.key)} · ${esc(r.troopName)}</h2><p>${esc(r.description)}</p>
<p>整链 ${Math.round(r.profile?.totalMs ?? 0)}ms · 输入恢复 ${Math.round(r.profile?.inputReadyMs ?? 0)}ms · 尾效 ${Math.round(r.profile?.visualTailMs ?? 0)}ms · 时间线 ${Math.round(r.profile?.timelineMs ?? 0)}ms</p>
<p class="flag">${esc((r.profile?.flags ?? []).join(' / '))} ${esc(r.error)}</p>
${r.video ? `<video controls preload="metadata" src="${esc(r.video)}#t=${Math.max(0, r.measurementVideoOffsetMs / 1000 - .3).toFixed(2)},${(r.measurementVideoOffsetMs / 1000 + (r.profile?.totalMs ?? 0) / 1000 + 1).toFixed(2)}"></video>` : ''}
${r.mid ? `<img loading="lazy" src="${esc(r.mid)}">` : ''}
<details><summary>阶段贡献/事件/特效统计</summary><pre>${esc(JSON.stringify({stageMs:r.profile?.stageMs,eventCounts:r.profile?.eventCounts,fxCounts:r.profile?.fxCounts,errors:r.profile?.errors},null,2))}</pre></details>
<a href="${esc(r.key)}.json">完整事件与时间线 JSON</a></article>`).join('')}`);
}
function requestFor(troop, key, quad) {
  const caster = i => ({ externalId: `p${i}`, name: troop.name, stats: { hp: troop.health, armor: troop.armor, attack: troop.attack, magic: troop.magic },
    manaColors: troop.manaColors.length ? troop.manaColors : ['Brown'], manaCost: troop.manaCost,
    skillId: String(troop.spell.id), traitIds: troop.traits.map(t => t.code), troopTypes: troop.troopTypes,
    ...(troop.kingdom ? { kingdom: troop.kingdom } : {}), spellName: troop.spell.name, spellDescription: troop.spell.description,
    ...(troop.artUrl || troop.portrait ? { portraitUrl: troop.artUrl ?? `/meta/assets/portraits/${troop.portrait}.webp` } : {}) });
  const dummy = (i, enemy) => ({ externalId: `${enemy ? 'e' : 'p'}${i}`, name: `${enemy ? '敌方' : '友方'}陪练${i}`,
    portraitUrl: troop.artUrl ?? `/meta/assets/portraits/${troop.portrait}.webp`,
    stats: { hp: 200, armor: 30, attack: 12, magic: 8 }, initialHp: enemy ? 200 : 120,
    manaColors: [['Red'], ['Blue'], ['Green'], ['Purple']][i], manaCost: 20,
    skillId: '7004', traitIds: [], troopTypes: enemy ? [['Daemon'], ['Undead'], ['Dragon'], ['Human']][i] : troop.troopTypes });
  return { schemaVersion: 1, rulesetVersion: '1.0.0', battleId: key, requestId: key, seed: SEED,
    playerTeam: [caster(0), ...[1, 2, 3].map(i => quad ? caster(i) : dummy(i, false))], enemyTeam: [0, 1, 2, 3].map(i => dummy(i, true)) };
}
try {
  const indexPage = await browser.newPage();
  await indexPage.goto(`${server.base}/tests/e2e/theater.html`);
  const troops = await indexPage.evaluate(async () => (await import('/src/data/troops.ts')).TROOPS);
  await indexPage.close();
  const ids = args.includes('--all') ? report.rows.filter(r => r.skillBound).map(r => r.troopId) : ONLY.length ? ONLY : defaultIds;
  let cases = ids.map(id => ({ id, key: `troop-${id}`, action: 'cast' }));
  if (args.includes('--stress-only')) cases = [];
  if ((!ONLY.length && !args.includes('--all')) || args.includes('--stress-only')) {
    cases.push({ id: 6262, key: 'stress-quad-loyalty', quad: true, action: 'cast' });
    cases.push({ id: 6004, key: 'stress-four-poison-burning', action: 'pass', stress: 'dot' });
    cases.push({ id: 7104, key: 'stress-four-defeats', action: 'cast', stress: 'defeat' });
  }
  if (arg('keys', null)) cases = cases.filter(c => arg('keys', '').split(',').includes(c.key));
  if (arg('offset', null)) cases = cases.slice(Number(arg('offset')));
  if (arg('limit', null)) cases = cases.slice(0, Number(arg('limit')));
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({generatedAt: new Date().toISOString(), expected: cases.length, sourceHash, workers: WORKERS, cases}, null, 2));
  const pending = cases.filter(c => !results.some(r => r.key === c.key && checkpointDone(r))).slice(0, Number(arg('max-cases', '100000')));
  let next = 0;
  async function worker() {
  let context, page, pageOpenedAt, pageUses = 0;
  while (next < pending.length) {
    const c = pending[next++];
    const troop = troops.find(t => t.id === c.id);
    if (!troop) throw new Error(`unknown troop ${c.id}`);
    const result = { sourceHash, attempt: (results.find(r => r.key === c.key)?.attempt ?? 0) + 1, startedAt: new Date().toISOString(), key: c.key, troopId: c.id, troopName: troop.name, spellId: troop.spell.id, description: troop.spell.description,
      action: c.action, stress: c.stress ?? (c.quad ? 'four-identical-trait-holders' : null), seed: SEED };
    if (!context) {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
      ...(!NO_VIDEO ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1440, height: 1000 } } } : {}) });
    page = await context.newPage();
    pageOpenedAt = Date.now();
    pageUses = 0;
    }
    const openedAt = pageOpenedAt;
    const pageErrors = [];
    page.removeAllListeners('pageerror');
    page.on('pageerror', e => pageErrors.push(String(e)));
    page.setDefaultTimeout(60000);
    try {
      const request = requestFor(troop, c.key, c.quad);
      result.request = request;
      if (pageUses === 0) await page.goto(`${server.base}/tests/e2e/theater.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#app')?.dataset.testReady === 'true');
      result.startupProfile = await page.evaluate(async request => {
        window.__theaterApp?.destroy(); delete window.__acceptance;
        const mount = document.querySelector('#app'); mount.replaceChildren(); delete mount.dataset.testReady;
        const { App } = await import('/src/render/App.ts');
        const { EventStreamPlayer } = await import('/src/render/EventStreamPlayer.ts');
        const play = EventStreamPlayer.prototype.play;
        const startup = {eventCounts:{}, playbackMs:0, timelineMs:0, inputWasLocked:true};
        EventStreamPlayer.prototype.play = async function(events) {
          const begin=performance.now();
          for(const e of events) startup.eventCounts[e.type]=(startup.eventCounts[e.type]??0)+1;
          startup.inputWasLocked &&= !window.__theaterApp.input.enabled && window.__theaterApp.startupPlaying;
          const promise=play.call(this,events);startup.timelineMs+=(this.timeline?.duration()??0)*1000;
          await promise;startup.playbackMs+=performance.now()-begin;
        };
        const a = new App(); window.__theaterApp = a;
        a.baseCellSize = Math.max(48, Math.min(88, Math.floor((innerHeight - 80) / 8), Math.floor((innerWidth - 60 - 2 * 142) / 8)));
        try { await a.init(mount, request); mount.dataset.testReady = 'true'; }
        finally { EventStreamPlayer.prototype.play=play; }
        return startup;
      },request);
      pageUses++;
      await page.waitForFunction(() => document.querySelector('#app')?.dataset.testReady === 'true');
      await page.waitForFunction(() => !window.__theaterApp.player.timeline);
      // Predecode all frame strips and let setup animations finish before starting clock.
      await page.evaluate(async () => {
        const a = window.__theaterApp;
        a.stopIdle();
        const { AnimConfig } = await import('/src/render/AnimationConfig.ts');
        await Promise.all(Object.keys(AnimConfig.frameFX).map(name => a.constructor.preloadFrameFX(name)));
      });
      await page.waitForTimeout(800);
      result.probe = await page.evaluate(async opts => (await import('/scripts/theater/acceptance-probe.js')).installAcceptanceProbe(opts), c);
      // Fixture cards and forced full-mana display can animate during preparation.
      // Await those BEFORE the clock; action-created animation tails still count.
      result.setupSettle = await page.evaluate(async () => (await import('/scripts/theater/acceptance-probe.js')).settleAcceptanceSetup());
      if (result.setupSettle.finiteAnimationsRemaining) throw new Error('Fixture setup failed to settle before action timing');
      result.measurementVideoOffsetMs = Date.now() - openedAt;
      await page.evaluate(() => { void window.__acceptance.run(); });
      // Evidence captures do not delimit timing; the probe follows the real completion.
      await page.waitForTimeout(550);
      result.mid = `${c.key}.mid.jpg`;
      await page.screenshot({ path: path.join(OUT, result.mid), type: 'jpeg', quality: 85 });
      await page.waitForFunction(() => window.__acceptance.done, null, { timeout: TIMEOUT });
      result.profile = await page.evaluate(() => {
        const { run, ...data } = window.__acceptance;
        return JSON.parse(JSON.stringify(data));
      });
      result.renderInspection = await page.evaluate(async () => (await import('/scripts/theater/presentation-assertions.js')).inspectPresentation(window.__theaterApp));
      await page.screenshot({ path: path.join(OUT, `${c.key}.end.jpg`), type: 'jpeg', quality: 85 });
    } catch (e) {
      result.error = String(e.stack ?? e);
      result.partialProfile = await page.evaluate(() => {
        const { run, ...data } = window.__acceptance ?? {};
        return JSON.parse(JSON.stringify(data));
      }).catch(() => null);
    } finally {
      result.pageErrors = pageErrors;
      const video = page.video();
      if (video) result.video = path.relative(OUT, await video.path()).replaceAll('\\', '/');
      if (pageUses >= PAGE_BATCH || result.error || next >= pending.length) { await context.close(); context = null; }
    }
    result.finishedAt = new Date().toISOString();
    result.acceptance = { execution: result.error || result.pageErrors.length || result.profile?.errors?.length ? 'failed' : 'completed', renderState: result.renderInspection?.errors.length ? 'failed' : result.renderInspection ? 'passed' : 'not-executed', visualReview: 'pending', scope: 'one seeded cast; conditional trait/branch coverage tracked separately' };
    const previous = results.findIndex(r => r.key === result.key);
    if (previous >= 0) results.splice(previous, 1);
    results.push(result);
    await writeFile(path.join(OUT, `${c.key}.json`), JSON.stringify(result, null, 2));
    if (results.length % 5 === 0 || next >= pending.length) {
      saveQueue = saveQueue.then(save); await saveQueue;
    }
    console.log(`[${results.length}/${cases.length}] ${c.key} ${troop.name}: ${Math.round(result.profile?.totalMs ?? 0)}ms ${result.error ? 'ERROR ' + result.error.split('\n')[0] : (result.profile?.flags ?? []).join(', ')}`);
  }
  if (context) await context.close();
  }
  await Promise.all(Array.from({length: WORKERS}, () => worker()));
} finally {
  await saveQueue; await save();
  await browser.close();
  disposeServer(server);
}
if (results.some(r => r.error || r.pageErrors.length || r.profile?.errors.length || r.renderInspection?.errors.length)) process.exitCode = 1;
