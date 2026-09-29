/**
 * 末日之塔 · 肉鸽爬塔（2026-09-29 重做，参照《杀戮尖塔》的地图楼层结构）。
 *
 * 一轮登塔 = 25 层，分三区（8/8/9 层），每区一张随机生成的分叉地图：
 *  - 玩家自己选路：只能走向当前节点连出的下一层节点；
 *  - 七种节点：战斗 / 精英（带词缀）/ 首领 / 营地 / 宝库 / 商人 / 奇遇；
 *  - 队伍在开跑时锁定，生命与阵亡跨层延续；
 *  - 塔金（本轮货币）来自战斗，花在商人处；遗物、符文、营地磨砺改变之后每一场战斗；
 *  - 打败区首领 → 首领遗物三选一 + 回复 40% → 进入下一区（新地图）；
 *  - 战败或主动放弃即结束本轮；周奖励按本周新到达的最高层补差（与旧版同口径）。
 */
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { fnv1a32 } from '../../data/hash';
import { EVENT_WEEKLY_PLAY_REWARD_CAP, EVENT_WEEKLY_RULES } from '../../data/events';
import {
  TOWER_AFFIXES, TOWER_BLESSINGS, TOWER_EVENTS, TOWER_LANES, TOWER_RELICS, TOWER_RUNES, TOWER_TUNING, TOWER_ZONES,
  relicById, type TowerAffix, type TowerBlessingId, type TowerNodeKind, type TowerRuneId,
} from '../../data/towerData';
import { BaseColor } from '../../../engine/types';
import type { SeededRNG } from '../../../engine/rng';
import { fail, type MetaFailure } from '../../types';
import { earn, earnMaterials } from '../wallet';
import { buildPlayerSnapshots, type BridgeOutcome } from '../battleBridge';
import { pickEnemies, type EnemyTier } from '../encounter';
import { activeTeam } from '../teamRules';
import type { EventWeekState } from '../../state/schema';
import {
  EVENT_BASE_LEVEL, addBanner, addMastery, buffSnapshot, int, isObj, pickN, rngOf, str, strArr,
  type EventActionResult, type EventModeImpl, type EventProgressLine, type ModeCtx, type ModePlan,
} from './common';

// ---------------------------------------------------------------------------
// 状态形态
// ---------------------------------------------------------------------------

export interface TowerNode {
  row: number;
  col: number;
  kind: TowerNodeKind;
  /** 下一行可达的列 */
  next: number[];
  affix?: TowerAffix;
}

export type TowerPending =
  | { kind: 'blessing'; options: TowerBlessingId[] }
  | { kind: 'reward'; source: 'battle' | 'elite' | 'boss'; gold: number; options: string[] }
  | { kind: 'camp' }
  | { kind: 'treasure'; relic: string | null; gold: number }
  | { kind: 'merchant'; stock: { relic: string; price: number; sold: boolean }[]; healUsed: boolean; purgeUsed: boolean }
  | { kind: 'event'; event: string };

export interface TowerRun {
  seed: number;
  zone: number;
  /** 当前区地图：rows[r] = 该行节点（按列排序） */
  rows: TowerNode[][];
  /** 已完成的最后一个节点（null = 刚进入本区） */
  at: { row: number; col: number } | null;
  /** 本区已走过的节点（r-c） */
  path: string[];
  pending: TowerPending | null;
  relics: string[];
  gold: number;
  /** 本轮永久加成（符文/营地/奇遇） */
  bonus: { attack: number; armor: number; magic: number; hpPct: number };
  /** 本轮已通过的层数（= 楼层号） */
  floor: number;
  elites: number;
  phoenixUsed: boolean;
}

export interface TowerState {
  v: 1;
  run: TowerRun | null;
  runs: number;
  last: { floor: number; reason: string } | null;
}

export const TOWER_FLOORS = EVENT_WEEKLY_RULES.towerFloors;

/** 第 zone 区第 row 行的楼层号（1 起） */
export function towerFloorOf(zone: number, row: number): number {
  let floor = 0;
  for (let z = 0; z < zone; z++) floor += TOWER_ZONES[z]!.rows;
  return floor + row + 1;
}

/** 第 floor 层（1 起）的敌人基础等级：Lv.20 起每层 +1.5，顶层 Lv.56 */
export function towerFloorLevel(floor: number): number {
  const f = Math.min(Math.max(Math.floor(floor), 1), TOWER_FLOORS);
  return EVENT_BASE_LEVEL + Math.round((f - 1) * 1.5);
}

// ---------------------------------------------------------------------------
// 地图生成（StS 式：多条随机路径叠加，禁止交叉，节点类型带约束加权）
// ---------------------------------------------------------------------------

export function generateTowerMap(seed: number, zone: number): TowerNode[][] {
  const rng = rngOf(fnv1a32(`tower-map-${seed}-${zone}`));
  const totalRows = TOWER_ZONES[zone]!.rows;
  const choiceRows = totalRows - 1;
  const edges = new Map<string, Set<number>>(); // `${r}-${c}` → 下一行列集合
  const nodes = new Set<string>();
  const key = (r: number, c: number): string => `${r}-${c}`;
  const hasEdge = (r: number, a: number, b: number): boolean => edges.get(key(r, a))?.has(b) ?? false;
  const starts: number[] = [];
  for (let p = 0; p < 4; p++) {
    let c = rng.nextInt(TOWER_LANES);
    if (p === 1) while (c === starts[0]) c = rng.nextInt(TOWER_LANES);
    starts.push(c);
    nodes.add(key(0, c));
    for (let r = 0; r < choiceRows - 1; r++) {
      let nc = Math.max(0, Math.min(TOWER_LANES - 1, c + rng.nextInt(3) - 1));
      // 禁止交叉：c→c+1 时不能已有 (c+1)→c，反之亦然
      if (nc === c + 1 && hasEdge(r, c + 1, c)) nc = c;
      if (nc === c - 1 && hasEdge(r, c - 1, c)) nc = c;
      if (!edges.has(key(r, c))) edges.set(key(r, c), new Set());
      edges.get(key(r, c))!.add(nc);
      nodes.add(key(r + 1, nc));
      c = nc;
    }
  }
  const bossCol = Math.floor(TOWER_LANES / 2);
  const rows: TowerNode[][] = [];
  for (let r = 0; r < choiceRows; r++) {
    const row: TowerNode[] = [];
    for (let c = 0; c < TOWER_LANES; c++) {
      if (!nodes.has(key(r, c))) continue;
      const next = r === choiceRows - 1 ? [bossCol] : [...(edges.get(key(r, c)) ?? [])].sort((a, b) => a - b);
      row.push({ row: r, col: c, kind: 'battle', next });
    }
    rows.push(row);
  }
  rows.push([{ row: choiceRows, col: bossCol, kind: 'boss', next: [], affix: undefined }]);

  // —— 节点类型 ——
  const treasureRow = Math.floor(choiceRows / 2);
  const parents = (node: TowerNode): TowerNode[] => node.row === 0 ? [] : rows[node.row - 1]!.filter((p) => p.next.includes(node.col));
  const weighted: [TowerNodeKind, number][] = Object.entries(TOWER_TUNING.weights) as [TowerNodeKind, number][];
  const roll = (): TowerNodeKind => {
    const total = weighted.reduce((s, [, w]) => s + w, 0);
    let x = rng.nextInt(total);
    for (const [kind, w] of weighted) { if ((x -= w) < 0) return kind; }
    return 'battle';
  };
  for (let r = 0; r < choiceRows; r++) {
    for (const node of rows[r]!) {
      if (r === 0) { node.kind = 'battle'; continue; }
      if (r === choiceRows - 1) { node.kind = 'camp'; continue; }
      if (r === treasureRow) { node.kind = 'treasure'; continue; }
      let kind: TowerNodeKind = 'battle';
      for (let attempt = 0; attempt < 6; attempt++) {
        kind = roll();
        const banned = (kind === 'elite' && r < 2) || (kind === 'merchant' && r < 2) || (kind === 'camp' && (r < 3 || r >= choiceRows - 2));
        const repeat = (kind === 'elite' || kind === 'camp' || kind === 'merchant') && parents(node).some((p) => p.kind === kind);
        if (!banned && !repeat) break;
        kind = 'battle';
      }
      node.kind = kind;
    }
  }
  // 保底：每区至少一名精英、一个商人
  const ensure = (kind: TowerNodeKind, minRow: number): void => {
    const all = rows.slice(minRow, choiceRows - 1).flat();
    if (all.some((n) => n.kind === kind)) return;
    const cand = all.filter((n) => n.kind === 'battle' && n.row !== treasureRow && !parents(n).some((p) => p.kind === kind));
    if (cand.length) cand[rng.nextInt(cand.length)]!.kind = kind;
  };
  ensure('elite', 2);
  ensure('merchant', 2);
  const affixes = Object.keys(TOWER_AFFIXES) as TowerAffix[];
  for (const node of rows.flat()) {
    if (node.kind === 'elite') node.affix = affixes[rng.nextInt(affixes.length)]!;
    if (node.kind === 'boss' && zone > 0) node.affix = affixes[rng.nextInt(affixes.length)]!;
  }
  return rows;
}

export function towerNodeAt(run: TowerRun, row: number, col: number): TowerNode | undefined {
  return run.rows[row]?.find((n) => n.col === col);
}

/** 当前可前往的节点（有待处理事项时为空） */
export function towerReachable(run: TowerRun): TowerNode[] {
  if (run.pending) return [];
  if (!run.at) return run.rows[0] ?? [];
  const cur = towerNodeAt(run, run.at.row, run.at.col);
  if (!cur) return [];
  return (run.rows[cur.row + 1] ?? []).filter((n) => cur.next.includes(n.col));
}

function parseNodeAction(action: string | undefined): { row: number; col: number } | null {
  const m = action?.match(/^go:(\d+)-(\d+)$/);
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

// ---------------------------------------------------------------------------
// 队伍与遗物
// ---------------------------------------------------------------------------

type RunMember = NonNullable<EventWeekState['runTeam']>[number];

function alive(week: EventWeekState): RunMember[] {
  return (week.runTeam ?? []).filter((m) => !m.defeated && m.hp > 0);
}

function healAlive(week: EventWeekState, pct: number): void {
  for (const m of alive(week)) m.hp = Math.min(m.maxHp, m.hp + Math.ceil(m.maxHp * pct));
}

function hurtAlive(week: EventWeekState, pctOfCurrent: number): void {
  for (const m of alive(week)) m.hp = Math.max(1, m.hp - Math.floor(m.hp * pctOfCurrent));
}

function reviveOne(week: EventWeekState, pct: number): RunMember | null {
  const dead = (week.runTeam ?? []).find((m) => m.defeated || m.hp <= 0);
  if (!dead) return null;
  dead.defeated = false;
  dead.hp = Math.max(1, Math.ceil(dead.maxHp * pct));
  return dead;
}

const has = (run: TowerRun, id: string): boolean => run.relics.includes(id);

function gainRelic(run: TowerRun, id: string): void {
  if (id === 'curse_frailty' || !run.relics.includes(id)) run.relics.push(id);
}

function relicPool(run: TowerRun, rarity: 'common' | 'rare' | 'boss'): string[] {
  return TOWER_RELICS.filter((r) => r.rarity === rarity && !run.relics.includes(r.id)).map((r) => r.id);
}

function randomRelic(run: TowerRun, rng: SeededRNG, rarity: 'common' | 'rare'): string | null {
  const pool = relicPool(run, rarity);
  const fallback = relicPool(run, rarity === 'rare' ? 'common' : 'rare');
  const src = pool.length ? pool : fallback;
  return src.length ? src[rng.nextInt(src.length)]! : null;
}

/** 本轮全部遗物 + 永久加成 → 战斗快照 */
function applyRun(run: TowerRun, node: TowerNode, outcome: BridgeOutcome): void {
  const req = outcome.request;
  const bigFight = node.kind === 'elite' || node.kind === 'boss';
  let attackPct = 0;
  let hpPct = run.bonus.hpPct;
  if (has(run, 'vital_chalice')) hpPct += 0.12;
  if (has(run, 'glass_blade')) { attackPct += 0.4; hpPct -= 0.2; }
  if (has(run, 'titan_heart')) { hpPct += 0.3; attackPct -= 0.1; }
  if (bigFight && has(run, 'hunter_mark')) attackPct += 0.25;
  for (const snap of req.playerTeam) {
    buffSnapshot(snap, {
      attack: run.bonus.attack + (has(run, 'ember_sigil') ? 4 : 0),
      armor: run.bonus.armor + (has(run, 'iron_bulwark') ? 6 : 0),
      magic: run.bonus.magic + (has(run, 'sage_quill') ? 3 : 0),
    });
    buffSnapshot(snap, { attackPct, hpPct });
  }
  if (has(run, 'prism_flame')) addBanner(outcome, { [BaseColor.Red]: 1, [BaseColor.Yellow]: 1 });
  if (has(run, 'prism_tide')) addBanner(outcome, { [BaseColor.Blue]: 1, [BaseColor.Green]: 1 });
  if (has(run, 'prism_dusk')) addBanner(outcome, { [BaseColor.Purple]: 1, [BaseColor.Brown]: 1 });
  const all = Object.values(BaseColor) as BaseColor[];
  if (has(run, 'surge_orb')) addMastery(outcome, all, 25);
  if (has(run, 'storm_crown')) {
    addMastery(outcome, all, 50);
    addBanner(outcome, Object.fromEntries(all.map((c) => [c, 1])));
  }

  let enemyAttackPct = 0;
  if (has(run, 'curse_doll')) enemyAttackPct -= 0.15;
  if (has(run, 'storm_crown')) enemyAttackPct += 0.1;
  enemyAttackPct += 0.12 * run.relics.filter((r) => r === 'curse_frailty').length;
  const affix = node.affix ? TOWER_AFFIXES[node.affix] : null;
  for (const snap of req.enemyTeam) {
    snap.eventTarget = 'tower';
    buffSnapshot(snap, {
      attackPct: enemyAttackPct + (affix && 'attackPct' in affix ? affix.attackPct : 0),
      armorPct: affix && 'armorPct' in affix ? affix.armorPct : 0,
      hpPct: affix && 'hpPct' in affix ? affix.hpPct : 0,
      magicPct: affix && 'magicPct' in affix ? affix.magicPct : 0,
    });
    if (has(run, 'ambush_horn')) snap.initialHp = Math.max(1, Math.round(snap.stats.hp * 0.88));
  }
}

// ---------------------------------------------------------------------------
// 收尾结算（周奖励按新到达的最高层补差：每层荣耀 2、每 5 层一张符卷）
// ---------------------------------------------------------------------------

export function finishTowerRun(ctx: ModeCtx, state: TowerState, floorReached: number, reason: string): EventProgressLine {
  const week = ctx.week;
  const best = Math.max(week.eventData.floorBest ?? 0, floorReached);
  week.eventData.floorBest = best;
  const paid = week.eventData.towerPaidFloors ?? 0;
  const reached = Math.min(TOWER_FLOORS, Math.max(paid, floorReached));
  const scrolls = Math.floor(reached / 5) - Math.floor(paid / 5);
  const glory = (reached - paid) * 2;
  week.eventData.towerPaidFloors = reached;
  if (reached > paid) {
    earn(ctx.save, { glory });
    earnMaterials(ctx.save, { forgeScrolls: scrolls });
    week.playRewards = Math.min(EVENT_WEEKLY_PLAY_REWARD_CAP.towerOfDoom, week.playRewards + 1);
  }
  ctx.save.gifts.towerBest = Math.max(ctx.save.gifts.towerBest, best);
  state.run = null;
  state.last = { floor: floorReached, reason };
  week.runTeam = null;
  return {
    label: `登塔结束（${reason}）· 到达第 ${floorReached} 层`,
    deltas: glory > 0 ? { glory } : {},
    ...(scrolls > 0 ? { mats: { forgeScrolls: scrolls } } : {}),
    note: `本周最高 第 ${best} 层 · ${reached > paid ? '新高层数奖励已入账' : '本轮未超过已领奖励层数'}`,
  };
}

function battleGold(run: TowerRun, rng: SeededRNG, kind: TowerNodeKind): number {
  const [lo, hi] = kind === 'elite' ? TOWER_TUNING.goldElite : kind === 'boss' ? [TOWER_TUNING.goldBoss, TOWER_TUNING.goldBoss] : TOWER_TUNING.goldBattle;
  let gold = lo + rng.nextInt(hi - lo + 1);
  if (has(run, 'gold_idol')) gold = Math.round(gold * 1.5);
  if (has(run, 'leech_fang')) gold = Math.round(gold / 2);
  return gold;
}

function enterZone(run: TowerRun, zone: number): void {
  run.zone = zone;
  run.rows = generateTowerMap(run.seed, zone);
  run.at = null;
  run.path = [];
}

// ---------------------------------------------------------------------------
// 非战斗节点与待处理事项
// ---------------------------------------------------------------------------

function nodeRng(run: TowerRun, tag: string): SeededRNG {
  return rngOf(fnv1a32(`tower-${run.seed}-${run.zone}-${run.at?.row ?? -1}-${run.at?.col ?? -1}-${tag}-${run.floor}`));
}

function enterNode(ctx: ModeCtx, run: TowerRun, node: TowerNode): EventActionResult {
  run.at = { row: node.row, col: node.col };
  run.path.push(node.row + '-' + node.col);
  run.floor = towerFloorOf(run.zone, node.row);
  ctx.week.eventData.floorBest = Math.max(ctx.week.eventData.floorBest ?? 0, run.floor);
  ctx.save.gifts.towerBest = Math.max(ctx.save.gifts.towerBest, run.floor);
  const rng = nodeRng(run, 'enter');
  switch (node.kind) {
    case 'camp':
      run.pending = { kind: 'camp' };
      return { ok: true, message: '抵达营地' };
    case 'treasure': {
      const [lo, hi] = TOWER_TUNING.treasureGold;
      run.pending = { kind: 'treasure', relic: randomRelic(run, rng, rng.next() < 0.35 ? 'rare' : 'common'), gold: lo + rng.nextInt(hi - lo + 1) };
      return { ok: true, message: '发现宝库' };
    }
    case 'merchant': {
      const commons = pickN(rng, relicPool(run, 'common'), 2);
      const rares = pickN(rng, relicPool(run, 'rare'), 1);
      run.pending = {
        kind: 'merchant', healUsed: false, purgeUsed: false,
        stock: [...commons.map((relic) => ({ relic, price: TOWER_TUNING.price.common, sold: false })),
          ...rares.map((relic) => ({ relic, price: TOWER_TUNING.price.rare, sold: false }))],
      };
      return { ok: true, message: '遇到塔中商人' };
    }
    case 'event': {
      const ev = TOWER_EVENTS[rng.nextInt(TOWER_EVENTS.length)]!;
      run.pending = { kind: 'event', event: ev.id };
      return { ok: true, message: ev.title };
    }
    default:
      return { ok: true, message: '' };
  }
}

function applyRune(ctx: ModeCtx, run: TowerRun, id: TowerRuneId): string {
  switch (id) {
    case 'rune_atk': run.bonus.attack += 2; break;
    case 'rune_arm': run.bonus.armor += 3; break;
    case 'rune_hp': run.bonus.hpPct += 0.06; break;
    case 'rune_mag': run.bonus.magic += 2; break;
    case 'rune_heal': healAlive(ctx.week, 0.2); break;
    case 'rune_gold': run.gold += 30; break;
  }
  return TOWER_RUNES[id].name;
}

function resolvePick(ctx: ModeCtx, state: TowerState, run: TowerRun, index: number | null): EventActionResult | MetaFailure {
  const pending = run.pending;
  if (!pending) return fail('INVALID', '没有待选择的奖励');
  if (pending.kind === 'blessing') {
    if (index === null) return fail('INVALID', '请选择一项开局祝福');
    const id = pending.options[index];
    if (!id) return fail('INVALID', '无效选项');
    const rng = nodeRng(run, 'bless');
    if (id === 'bless_gold') run.gold += 70;
    if (id === 'bless_hp') run.bonus.hpPct += 0.1;
    if (id === 'bless_atk') run.bonus.attack += 3;
    if (id === 'bless_relic') { const r = randomRelic(run, rng, 'common'); if (r) gainRelic(run, r); }
    if (id === 'bless_rare') { const r = randomRelic(run, rng, 'rare'); if (r) gainRelic(run, r); gainRelic(run, 'curse_frailty'); }
    run.pending = null;
    return { ok: true, message: `祝福 · ${TOWER_BLESSINGS[id].name}` };
  }
  if (pending.kind !== 'reward') return fail('INVALID', '当前事项不是奖励选择');
  let message = '放弃了奖励';
  if (index !== null) {
    const id = pending.options[index];
    if (!id) return fail('INVALID', '无效选项');
    if (id in TOWER_RUNES) message = `获得 ${applyRune(ctx, run, id as TowerRuneId)}`;
    else { gainRelic(run, id); message = `获得遗物 · ${relicById(id)?.name ?? id}`; }
  }
  const bossDone = pending.source === 'boss';
  run.pending = null;
  if (bossDone) {
    if (run.zone >= TOWER_ZONES.length - 1) {
      const line = finishTowerRun(ctx, state, run.floor, '登顶');
      return { ok: true, message: `${message} · 末日之塔已登顶`, lines: [line] };
    }
    enterZone(run, run.zone + 1);
    message += ` · 进入第 ${run.zone + 1} 区「${TOWER_ZONES[run.zone]!.name}」`;
  }
  return { ok: true, message };
}

function resolveEvent(ctx: ModeCtx, run: TowerRun, eventId: string, option: number): EventActionResult | MetaFailure {
  const rng = nodeRng(run, 'event');
  const week = ctx.week;
  const done = (message: string): EventActionResult => { run.pending = null; return { ok: true, message }; };
  switch (`${eventId}:${option}`) {
    case 'altar:0': { hurtAlive(week, 0.15); const r = randomRelic(run, rng, 'rare'); if (r) gainRelic(run, r); return done(`鲜血换来了 ${relicById(r ?? '')?.name ?? '空无'}`); }
    case 'spring:0': healAlive(week, 0.3); return done('泉水治愈了伤口');
    case 'spring:1': run.bonus.hpPct += 0.08; return done('生命上限 +8%');
    case 'gambler:0': {
      if (run.gold < 40) return fail('INSUFFICIENT', '塔金不足 40');
      run.gold -= 40;
      if (rng.next() < 0.5) { run.gold += 100; return done('赢了！塔金 +100'); }
      return done('骰子幽灵笑着收走了 40 塔金');
    }
    case 'cursed_chest:0': { const r = randomRelic(run, rng, 'rare'); if (r) gainRelic(run, r); gainRelic(run, 'curse_frailty'); return done(`获得 ${relicById(r ?? '')?.name ?? '空无'}，但被诅咒缠身`); }
    case 'dummy:0': hurtAlive(week, 0.1); run.bonus.attack += 3; return done('全队攻击 +3');
    case 'dummy:1': healAlive(week, 0.1); return done('小憩片刻，回复 10% 生命');
    case 'remains:0': run.gold += 45; return done('塔金 +45');
    case 'remains:1': run.bonus.magic += 2; return done('全队魔法 +2');
    case 'echo:0': { const m = reviveOne(week, 0.4); if (!m) healAlive(week, 0.15); return done(m ? '倒下的同伴回来了' : '回响抚平了伤痛，全队回复 15%'); }
    case 'mirror:0': { const r = randomRelic(run, rng, 'common'); if (r) gainRelic(run, r); run.bonus.armor -= 2; return done(`获得 ${relicById(r ?? '')?.name ?? '空无'}，护甲 -2`); }
    case 'mirror:1': run.gold += 20; return done('镜片碎了一地，塔金 +20');
    case 'altar:1': case 'gambler:1': case 'cursed_chest:1': case 'echo:1': return done('你离开了');
    default: return fail('INVALID', '无效选项');
  }
}

// ---------------------------------------------------------------------------
// 模式实现
// ---------------------------------------------------------------------------

function sanitizeNode(v: unknown, row: number): TowerNode | null {
  if (!isObj(v)) return null;
  const kind = str(v.kind, '') as TowerNodeKind;
  if (!['battle', 'elite', 'boss', 'camp', 'treasure', 'merchant', 'event'].includes(kind)) return null;
  const affix = typeof v.affix === 'string' && v.affix in TOWER_AFFIXES ? (v.affix as TowerAffix) : undefined;
  return { row, col: int(v.col, 0, 0, TOWER_LANES - 1), kind, next: (Array.isArray(v.next) ? v.next : []).filter((n): n is number => Number.isInteger(n)), ...(affix ? { affix } : {}) };
}

function sanitizeRun(v: unknown): TowerRun | null {
  if (!isObj(v) || !Array.isArray(v.rows) || !isObj(v.bonus)) return null;
  const zone = int(v.zone, 0, 0, TOWER_ZONES.length - 1);
  const rows = v.rows.map((row, r) => (Array.isArray(row) ? row.map((n) => sanitizeNode(n, r)) : []));
  if (rows.length !== TOWER_ZONES[zone]!.rows || rows.some((row) => row.length === 0 || row.some((n) => !n))) return null;
  const at = isObj(v.at) ? { row: int(v.at.row, 0, 0), col: int(v.at.col, 0, 0) } : null;
  const pending = isObj(v.pending) && typeof v.pending.kind === 'string' ? (JSON.parse(JSON.stringify(v.pending)) as TowerPending) : null;
  return {
    seed: int(v.seed, 1, 0), zone, rows: rows as TowerNode[][], at, path: strArr(v.path), pending,
    relics: strArr(v.relics).filter((id) => relicById(id)),
    gold: int(v.gold, 0, 0),
    bonus: { attack: int(v.bonus.attack, 0), armor: int(v.bonus.armor, 0), magic: int(v.bonus.magic, 0),
      hpPct: typeof v.bonus.hpPct === 'number' && Number.isFinite(v.bonus.hpPct) ? v.bonus.hpPct : 0 },
    floor: int(v.floor, 0, 0, TOWER_FLOORS), elites: int(v.elites, 0, 0), phoenixUsed: v.phoenixUsed === true,
  };
}

function towerPlanNode(state: TowerState, action: string | undefined): { run: TowerRun; node: TowerNode } | MetaFailure {
  const run = state.run;
  if (!run) return fail('INVALID', '请先开始一轮登塔');
  if (run.pending) return fail('INVALID', '请先处理当前节点的事项');
  const pos = parseNodeAction(action);
  const node = pos && towerReachable(run).find((n) => n.row === pos.row && n.col === pos.col);
  if (!node) return fail('INVALID', '请在地图上选择一个可前往的节点');
  if (node.kind !== 'battle' && node.kind !== 'elite' && node.kind !== 'boss') return fail('INVALID', '该节点无需战斗');
  return { run, node };
}

export const towerMode: EventModeImpl<TowerState> = {
  init: () => ({ v: 1, run: null, runs: 0, last: null }),

  sanitize(raw) {
    if (!isObj(raw) || raw.v !== 1) return null;
    const run = raw.run === null || raw.run === undefined ? null : sanitizeRun(raw.run);
    if (raw.run && !run) return null;
    const last = isObj(raw.last) ? { floor: int(raw.last.floor, 0, 0), reason: str(raw.last.reason, '') } : null;
    return { v: 1, run, runs: int(raw.runs, 0, 0), last };
  },

  ready(ctx, state, action) {
    if (!state.run) return action === 'start' || action === undefined ? null : '请先开始一轮登塔';
    const tower = ctx.week;
    if (tower.runTeam) {
      const ids = (activeTeam(ctx.save)?.members ?? []).map((m, i) => `p${i}-${m.kind === 'hero' ? 'hero' : m.troopId}`);
      if (tower.runTeam.length !== ids.length || tower.runTeam.some((m) => !ids.includes(m.externalId))) {
        return '本轮登塔阵容已锁定，请恢复原队伍与站位，或放弃本轮后重新编队';
      }
    }
    return null;
  },

  plan(_ctx, state, seed, action) {
    const picked = towerPlanNode(state, action);
    if ('ok' in picked) return picked;
    const { run, node } = picked;
    const floor = towerFloorOf(run.zone, node.row);
    const rng = rngOf(seed);
    const zoneKingdom = KINGDOM_ORDER[(fnv1a32(`tower-k-${run.seed}-${run.zone}`)) % KINGDOM_ORDER.length]!;
    let kingdom = node.kind === 'battle' ? zoneKingdom : KINGDOM_ORDER[fnv1a32(`tower-k-${run.seed}-${run.zone}-${node.row}-${node.col}`) % KINGDOM_ORDER.length]!;
    if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
    const big = run.zone > 0;
    let tiers: EnemyTier[];
    let level = towerFloorLevel(floor);
    let mult = 1;
    if (node.kind === 'boss') {
      tiers = run.zone === TOWER_ZONES.length - 1 ? ['elite', 'boss', 'boss', 'elite'] : big ? ['elite', 'boss', 'elite', 'minion'] : ['elite', 'boss', 'elite'];
      level += 3; mult = run.zone === TOWER_ZONES.length - 1 ? 1.3 : 1.2;
    } else if (node.kind === 'elite') {
      tiers = big ? ['elite', 'elite', 'minion', 'minion'] : ['elite', 'elite', 'minion'];
      level += 2; mult = 1.1;
    } else {
      tiers = floor <= 2 ? ['minion', 'minion'] : big ? ['elite', 'minion', 'minion', 'minion'] : ['elite', 'minion', 'minion'];
    }
    const enemies = pickEnemies(kingdom, level, tiers, rng).map((e) => (mult > 1 ? { ...e, statMultiplier: mult } : e));
    return { kingdom, enemies, choice: `go:${node.row}-${node.col}` } satisfies ModePlan;
  },

  modify(ctx, state, outcome) {
    const run = state.run;
    const pos = parseNodeAction(outcome.plan.source.kind === 'event' ? outcome.plan.source.choice : undefined);
    const node = run && pos ? towerNodeAt(run, pos.row, pos.col) : undefined;
    if (!run || !node) return;
    const week = ctx.week;
    if (!week.runTeam) {
      week.runTeam = outcome.request.playerTeam.map((snap) => ({ externalId: snap.externalId, hp: snap.stats.hp, maxHp: snap.stats.hp, defeated: false }));
    }
    const states = new Map(week.runTeam.map((m) => [m.externalId, m]));
    outcome.request.playerTeam = outcome.request.playerTeam.filter((snap) => {
      const st = states.get(snap.externalId);
      if (!st || st.defeated || st.hp <= 0) return false;
      // 跨层生命按「当前/上限」比例带入（遗物改上限时比例不变）
      snap.stats.hp = st.maxHp;
      snap.initialHp = Math.min(st.maxHp, st.hp);
      return true;
    });
    applyRun(run, node, outcome);
  },

  points(_ctx, state, plan, _result, victory) {
    if (!victory || plan.source.kind !== 'event') return 0;
    const pos = parseNodeAction(plan.source.choice);
    const node = state.run && pos ? towerNodeAt(state.run, pos.row, pos.col) : undefined;
    return node && node.kind !== 'battle' ? 120 : 100;
  },

  progress(ctx, state, plan, result, victory) {
    const run = state.run;
    const pos = plan.source.kind === 'event' ? parseNodeAction(plan.source.choice) : null;
    const node = run && pos ? towerNodeAt(run, pos.row, pos.col) : undefined;
    if (!run || !node) return [];
    const week = ctx.week;
    const floor = towerFloorOf(run.zone, node.row);
    if (!victory) return [finishTowerRun(ctx, state, floor - 1, '败北')];

    // 生命按比例写回（遗物放大的上限不跨场保存）
    const byId = new Map((week.runTeam ?? []).map((m) => [m.externalId, m]));
    let fell = 0;
    for (const c of result.combatants.filter((x) => x.side === 'player')) {
      const m = byId.get(c.externalId);
      if (!m) continue; // 召唤物不成为跨层资产
      const ratio = c.maxHp > 0 ? Math.max(0, c.hp) / c.maxHp : 0;
      const dead = c.defeated || c.hp <= 0;
      if (dead && !m.defeated) fell += 1;
      m.defeated = dead;
      m.hp = dead ? 0 : Math.max(1, Math.min(m.maxHp, Math.round(m.maxHp * ratio)));
    }
    const lines: EventProgressLine[] = [];
    if (fell > 0 && has(run, 'phoenix_feather') && !run.phoenixUsed) {
      run.phoenixUsed = true;
      while (reviveOne(week, 0.3)) { /* 全部复活 */ }
      lines.push({ label: '不死鸟之羽燃尽', deltas: {}, note: '阵亡成员以 30% 生命复活' });
    }
    if (has(run, 'mending_moss')) healAlive(week, 0.12);
    if (has(run, 'leech_fang')) healAlive(week, 0.25);
    if (node.kind === 'boss') healAlive(week, TOWER_TUNING.bossHealPct);

    run.at = { row: node.row, col: node.col };
    run.path.push(node.row + '-' + node.col);
    run.floor = floor;
    week.eventData.floorBest = Math.max(week.eventData.floorBest ?? 0, floor);
    ctx.save.gifts.towerBest = Math.max(ctx.save.gifts.towerBest, week.eventData.floorBest);
    if (node.kind === 'elite') run.elites += 1;
    const rng = nodeRng(run, 'reward');
    const gold = battleGold(run, rng, node.kind);
    run.gold += gold;
    const options = node.kind === 'battle'
      ? pickN(rng, Object.keys(TOWER_RUNES), 3)
      : pickN(rng, node.kind === 'boss' ? relicPool(run, 'boss') : [...relicPool(run, 'common'), ...relicPool(run, 'rare'), ...relicPool(run, 'rare')].filter((id, i, a) => a.indexOf(id) === i), 3);
    run.pending = { kind: 'reward', source: node.kind === 'boss' ? 'boss' : node.kind === 'elite' ? 'elite' : 'battle', gold, options };
    const aliveCount = alive(week).length;
    lines.push({
      label: `第 ${floor} 层 · ${node.kind === 'boss' ? '首领' : node.kind === 'elite' ? '精英' : '战斗'}通过`,
      deltas: {},
      note: `塔金 +${gold} · 存活 ${aliveCount} 人 · 回到塔中挑选${node.kind === 'battle' ? '符文' : '遗物'}`,
    });
    return lines;
  },

  act(ctx, state, action, seed) {
    const [verb, arg] = action.split(':');
    if (verb === 'start') {
      if (state.run) return fail('INVALID', '已有进行中的登塔');
      const built = buildPlayerSnapshots(ctx.save);
      if (!built.ok) return built;
      const runSeed = fnv1a32(`tower-run-${ctx.weekStart}-${state.runs}-${seed}`);
      const run: TowerRun = {
        seed: runSeed, zone: 0, rows: [], at: null, path: [], pending: null, relics: [], gold: 0,
        bonus: { attack: 0, armor: 0, magic: 0, hpPct: 0 }, floor: 0, elites: 0, phoenixUsed: false,
      };
      enterZone(run, 0);
      run.pending = { kind: 'blessing', options: pickN(nodeRng(run, 'bless-opt'), Object.keys(TOWER_BLESSINGS) as TowerBlessingId[], 3) };
      state.run = run;
      state.runs += 1;
      ctx.week.runTeam = built.playerTeam.map((snap) => ({ externalId: snap.externalId, hp: snap.stats.hp, maxHp: snap.stats.hp, defeated: false }));
      return { ok: true, message: '登塔开始：队伍已锁定，请选择开局祝福' };
    }
    const run = state.run;
    if (!run) return fail('INVALID', '没有进行中的登塔');
    if (verb === 'abandon') {
      const line = finishTowerRun(ctx, state, run.floor, '主动放弃');
      return { ok: true, message: line.label, lines: [line] };
    }
    const pending = run.pending;
    switch (verb) {
      case 'go': {
        if (pending) return fail('INVALID', '请先处理当前节点的事项');
        const pos = parseNodeAction(action);
        const node = pos && towerReachable(run).find((n) => n.row === pos.row && n.col === pos.col);
        if (!node) return fail('INVALID', '该节点当前不可前往');
        if (node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss') return fail('INVALID', '战斗节点请点击「出战」');
        return enterNode(ctx, run, node);
      }
      case 'pick': return resolvePick(ctx, state, run, Number(arg));
      case 'skip': return resolvePick(ctx, state, run, null);
      case 'camp': {
        if (pending?.kind !== 'camp') return fail('INVALID', '不在营地');
        if (arg === 'rest') healAlive(ctx.week, TOWER_TUNING.campRestPct);
        else if (arg === 'train') run.bonus.attack += TOWER_TUNING.campTrainAttack;
        else if (arg === 'revive') { if (!reviveOne(ctx.week, TOWER_TUNING.campRevivePct)) return fail('INVALID', '没有阵亡成员'); }
        else return fail('INVALID', '无效选项');
        run.pending = null;
        return { ok: true, message: arg === 'rest' ? '篝火旁休整，存活成员回复 35% 生命' : arg === 'train' ? '磨砺兵刃，全队攻击 +3' : '招魂成功，阵亡成员以 25% 生命归队' };
      }
      case 'claim': {
        if (pending?.kind !== 'treasure') return fail('INVALID', '没有可领取的宝物');
        if (pending.relic) gainRelic(run, pending.relic);
        run.gold += pending.gold;
        run.pending = null;
        return { ok: true, message: `获得 ${relicById(pending.relic ?? '')?.name ?? '塔金'} · 塔金 +${pending.gold}` };
      }
      case 'buy': {
        if (pending?.kind !== 'merchant') return fail('INVALID', '附近没有商人');
        if (arg === 'heal') {
          if (pending.healUsed) return fail('SOLD_OUT', '治疗已用过');
          if (run.gold < TOWER_TUNING.healPrice) return fail('INSUFFICIENT', '塔金不足');
          run.gold -= TOWER_TUNING.healPrice; pending.healUsed = true; healAlive(ctx.week, TOWER_TUNING.healPct);
          return { ok: true, message: '存活成员回复 35% 生命' };
        }
        if (arg === 'purge') {
          const idx = run.relics.indexOf('curse_frailty');
          if (pending.purgeUsed || idx < 0) return fail('INVALID', '没有可驱除的诅咒');
          if (run.gold < TOWER_TUNING.purgePrice) return fail('INSUFFICIENT', '塔金不足');
          run.gold -= TOWER_TUNING.purgePrice; pending.purgeUsed = true; run.relics.splice(idx, 1);
          return { ok: true, message: '诅咒已驱除' };
        }
        const item = pending.stock[Number(arg)];
        if (!item || item.sold) return fail('SOLD_OUT', '该商品已售出');
        if (run.gold < item.price) return fail('INSUFFICIENT', '塔金不足');
        run.gold -= item.price; item.sold = true; gainRelic(run, item.relic);
        return { ok: true, message: `购得 ${relicById(item.relic)?.name ?? item.relic}` };
      }
      case 'leave': {
        if (pending?.kind !== 'merchant') return fail('INVALID', '无需离开');
        run.pending = null;
        return { ok: true, message: '离开商人' };
      }
      case 'event': {
        if (pending?.kind !== 'event') return fail('INVALID', '没有进行中的奇遇');
        return resolveEvent(ctx, run, pending.event, Number(arg));
      }
      default: return fail('INVALID', '未知操作');
    }
  },

  nextLevel(_ctx, state) {
    const run = state.run;
    return towerFloorLevel(run ? Math.min(TOWER_FLOORS, run.floor + 1) : 1);
  },

  summary(ctx, state) {
    const run = state.run;
    if (!run) return `最高 ${ctx.week.eventData.floorBest ?? 0} / ${TOWER_FLOORS} 层 · 本周 ${state.runs} 轮`;
    return `第 ${run.zone + 1} 区 · 第 ${run.floor} 层 · 遗物 ${run.relics.length} · 塔金 ${run.gold}`;
  },
};

/** 主动放弃（网关旧端点保留）：按已到达层数结算 */
export function abandonTower(ctx: ModeCtx, state: TowerState): { ok: true; floorReached: number; glory: number; scrolls: number } | MetaFailure {
  if (!state.run) return fail('INVALID', '没有进行中的登塔');
  const floorReached = state.run.floor;
  const line = finishTowerRun(ctx, state, floorReached, '主动放弃');
  return { ok: true, floorReached, glory: line.deltas.glory ?? 0, scrolls: line.mats?.forgeScrolls ?? 0 };
}
