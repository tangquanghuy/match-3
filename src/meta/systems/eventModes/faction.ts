/**
 * 阵营突袭 · 领地征服（2026-09-29 重做）。
 *
 * 本周目标王国的领土是一张 4×3 的地块图，从西侧边境向东推进，攻陷王城为一轮：
 *  - 只能进攻边境列或与己方地块相邻的敌方地块；
 *  - 每块地都有特性，占领后给之后**所有**阵营突袭战斗叠加战区加成（军营 +攻击、城塞 +护甲、
 *    粮仓 +生命、圣坛 +法力精通、瞭望塔让敌人残血开战、村落 +少量生命）；
 *  - 敌军每 4 场战斗发动一次反扑，夺回一块与敌占区接壤的己方地块——拖得越久丢得越多；
 *  - 王城只向「内应」开门：出战队伍中至少 2 名目标王国部队才能进攻；
 *  - 编入目标王国部队仍有阵营加成（每名全队攻击 +2 / 生命 +10）。
 * 核心决策：绕路吃加成，还是直取王城。
 *
 * 深化批（2026-09-30）：
 *  - 战斗发生在目标王国（BattleRequest.kingdom）：「战斗发生在X王国」类技能/特质真实生效；
 *  - 地块守军带专属词缀：军营狂暴、城塞开局屏障、圣坛 35% 法力开战、瞭望塔闪避、粮仓每回合回血；
 *  - 村落里藏着宝藏地精（每张图一处，地图上有传闻标记）：进攻该村落就是一场地精追击；
 *  - 王城斩首：击杀守将即攻陷，守将开局屏障、50% 几率浴火复活；
 *  - 反扑改为防守战：敌军指向一块接壤地块，下一场可选择「驰援」坚守 6 回合保住它，否则失守。
 */
import '../../data/eventTraits';
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { fnv1a32 } from '../../data/hash';
import { EVENT_WEEKLY_EPIC_INGOTS, EVENT_WEEKLY_PLAY_REWARD_CAP } from '../../data/events';
import { getTroopById } from '../../../data/troops';
import { BaseColor } from '../../../engine/types';
import type { MaterialDelta } from '../../data/materials';
import { fail } from '../../types';
import { earn, earnMaterials } from '../wallet';
import { pickEnemies, type EnemyTier } from '../encounter';
import { applySpecialEncounter, specialEncounterPlan } from '../specialEncounters';
import { activeTeam } from '../teamRules';
import {
  EVENT_BASE_LEVEL, EVENT_POINTS_CAP, addMastery, addRules, buffSnapshot, injectTraits, injectTraitsOn, protectEventBoss, int, isObj, pickN, rngOf,
  type EventModeImpl, type EventProgressLine, type ModeCtx,
} from './common';

export type DistrictKind = 'village' | 'barracks' | 'fort' | 'shrine' | 'watchtower' | 'granary' | 'capital';

export interface District {
  x: number;
  y: number;
  kind: DistrictKind;
  owner: 'enemy' | 'player';
  /** 村落里藏着宝藏地精（进攻即地精追击） */
  gnome?: boolean;
}

export interface FactionState {
  v: 1;
  round: number;
  districts: District[];
  /** 距下次反扑剩余战斗数 */
  counterIn: number;
  captures: number;
  conquered: number;
  /** 敌军反扑指向的己方地块（下一场可驰援） */
  threat: { x: number; y: number } | null;
}

/** 地块守军词缀（敌方） */
export const DISTRICT_AFFIX: Partial<Record<DistrictKind, { name: string; desc: string; trait?: string; attackPct?: number }>> = {
  barracks: { name: '狂暴', desc: '守军攻击 +20%', attackPct: 0.2 },
  fort: { name: '城塞', desc: '守军开局获得屏障', trait: 'ev_fac_fort' },
  shrine: { name: '圣坛', desc: '守军以 35% 法力开战', trait: 'ev_fac_shrine' },
  watchtower: { name: '瞭望', desc: '守军 20% 闪避骷髅', trait: 'ev_fac_watch' },
  granary: { name: '补给', desc: '守军每回合回复 3 生命', trait: 'ev_fac_granary' },
  capital: { name: '斩首', desc: '击杀守将即攻陷；守将开局屏障、50% 几率复活', trait: 'ev_fac_warden' },
};

/** 驰援防守战的回合数 */
export const FACTION_DEFEND_TURNS = 6;

export const FACTION_COLS = 4;
export const FACTION_ROWS = 3;
export const FACTION_COUNTER_EVERY = 4;
export const FACTION_CAPITAL_MIN_MATCH = 2;
export const FACTION_BUFF_ATTACK_PER = 2;
export const FACTION_BUFF_HP_PER = 10;

export const DISTRICT_INFO: Record<DistrictKind, { name: string; bonus: string; tiers: EnemyTier[]; levelBonus: number }> = {
  village: { name: '村落', bonus: '全队生命 +4%', tiers: ['elite', 'minion', 'minion'], levelBonus: 0 },
  barracks: { name: '军营', bonus: '全队攻击 +3', tiers: ['elite', 'minion', 'minion', 'minion'], levelBonus: 1 },
  fort: { name: '城塞', bonus: '全队护甲 +5', tiers: ['elite', 'elite', 'minion'], levelBonus: 2 },
  shrine: { name: '圣坛', bonus: '全色法力精通 +20', tiers: ['elite', 'minion', 'minion'], levelBonus: 1 },
  watchtower: { name: '瞭望塔', bonus: '敌人以 90% 生命开战', tiers: ['minion', 'minion', 'minion', 'elite'], levelBonus: 0 },
  granary: { name: '粮仓', bonus: '全队生命 +12%', tiers: ['elite', 'minion', 'minion'], levelBonus: 0 },
  capital: { name: '王城', bonus: '攻陷即完成本轮征服', tiers: ['boss', 'elite', 'elite', 'elite'], levelBonus: 4 },
};

export const FACTION_CAPITAL_REWARD = { glory: 80 } as const;

function kingdomOf(ctx: ModeCtx): string {
  const k = ctx.theme.kingdom ?? KINGDOM_ORDER[0]!;
  return kingdomTroopPool(k).length ? k : KINGDOM_ORDER[0]!;
}

function buildMap(ctx: ModeCtx, round: number): District[] {
  const rng = rngOf(fnv1a32(`faction-map-${ctx.weekStart}-${round}`));
  const kinds = pickN(rng, ['village', 'village', 'village', 'barracks', 'barracks', 'fort', 'fort', 'shrine', 'watchtower', 'granary', 'village'] as DistrictKind[], 11);
  const out: District[] = [];
  for (let x = 0; x < FACTION_COLS; x++) {
    for (let y = 0; y < FACTION_ROWS; y++) {
      const capital = x === FACTION_COLS - 1 && y === 1;
      out.push({ x, y, kind: capital ? 'capital' : kinds.pop()!, owner: 'enemy' });
    }
  }
  // 每张图一处村落藏着宝藏地精（不放在边境列，要推进才摸得到）
  const villages = out.filter((d) => d.kind === 'village' && d.x > 0);
  if (villages.length) villages[rng.nextInt(villages.length)]!.gnome = true;
  return out;
}

const adjacent = (a: District, b: District): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/** 当前可进攻的地块 */
export function factionTargets(state: FactionState): District[] {
  const mine = state.districts.filter((d) => d.owner === 'player');
  return state.districts.filter((d) => d.owner === 'enemy' && (d.x === 0 || mine.some((m) => adjacent(m, d))));
}

function districtOf(state: FactionState, action: string | undefined): District | undefined {
  const m = action?.match(/^tile:(\d)-(\d)$/);
  return m ? state.districts.find((d) => d.x === Number(m[1]) && d.y === Number(m[2])) : undefined;
}

/** 编队中来自目标王国的部队数 */
export function factionMatchCount(save: ModeCtx['save'], kingdom: string): number {
  let match = 0;
  for (const member of activeTeam(save)?.members ?? []) {
    if (member.kind !== 'troop') continue;
    if (getTroopById(member.troopId)?.kingdom === kingdom) match += 1;
  }
  return match;
}

/** 已占领地块汇总出的战区加成 */
export function factionBonuses(state: FactionState): { attack: number; armor: number; hpPct: number; mastery: number; enemyHp: number } {
  const owned = state.districts.filter((d) => d.owner === 'player');
  const n = (k: DistrictKind): number => owned.filter((d) => d.kind === k).length;
  return {
    attack: n('barracks') * 3,
    armor: n('fort') * 5,
    hpPct: n('granary') * 0.12 + n('village') * 0.04,
    mastery: n('shrine') * 20,
    enemyHp: n('watchtower') > 0 ? Math.max(0.7, 1 - 0.1 * n('watchtower')) : 1,
  };
}

export function factionLevel(state: FactionState, d: District): number {
  const owned = state.districts.filter((x) => x.owner === 'player').length;
  return EVENT_BASE_LEVEL + (state.round - 1) * 9 + owned * 2 + DISTRICT_INFO[d.kind].levelBonus + d.x;
}

export const factionMode: EventModeImpl<FactionState> = {
  init(ctx) {
    return { v: 1, round: 1, districts: buildMap(ctx, 1), counterIn: FACTION_COUNTER_EVERY, captures: 0, conquered: 0, threat: null };
  },

  sanitize(raw) {
    if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.districts) || raw.districts.length !== FACTION_COLS * FACTION_ROWS) return null;
    const districts: District[] = [];
    for (const d of raw.districts) {
      if (!isObj(d) || !(typeof d.kind === 'string' && d.kind in DISTRICT_INFO)) return null;
      districts.push({ x: int(d.x, 0, 0, FACTION_COLS - 1), y: int(d.y, 0, 0, FACTION_ROWS - 1), kind: d.kind as DistrictKind, owner: d.owner === 'player' ? 'player' : 'enemy', ...(d.gnome === true ? { gnome: true } : {}) });
    }
    const t = isObj(raw.threat) ? districts.find((d) => d.x === (raw.threat as { x?: unknown }).x && d.y === (raw.threat as { y?: unknown }).y && d.owner === 'player') : undefined;
    return { v: 1, round: int(raw.round, 1, 1), districts, counterIn: int(raw.counterIn, FACTION_COUNTER_EVERY, 1, FACTION_COUNTER_EVERY),
      captures: int(raw.captures, 0, 0), conquered: int(raw.conquered, 0, 0), threat: t ? { x: t.x, y: t.y } : null };
  },

  ready(ctx, state, action) {
    if (action === 'defend' && !state.threat) return '当前没有需要驰援的地块';
    const d = districtOf(state, action);
    if (d?.kind === 'capital' && factionMatchCount(ctx.save, kingdomOf(ctx)) < FACTION_CAPITAL_MIN_MATCH) {
      return `王城只向内应开门：出战队伍需至少 ${FACTION_CAPITAL_MIN_MATCH} 名${kingdomOf(ctx)}部队`;
    }
    return null;
  },

  plan(ctx, state, seed, action) {
    const kingdom = kingdomOf(ctx);
    if (action === 'defend') {
      const t = state.threat && state.districts.find((d) => d.x === state.threat!.x && d.y === state.threat!.y);
      if (!t) return fail('INVALID', '当前没有需要驰援的地块');
      return { kingdom, enemies: pickEnemies(kingdom, factionLevel(state, t) + 2, ['elite', 'elite', 'minion'], rngOf(seed)), choice: 'defend' };
    }
    const targets = factionTargets(state);
    const d = districtOf(state, action) ?? (action === undefined ? targets.find((t) => t.kind !== 'capital') : undefined);
    if (!d || !targets.includes(d)) return fail('INVALID', '请在领地图上选择一块可进攻的地块');
    const choice = `tile:${d.x}-${d.y}`;
    if (d.gnome) {
      const sp = specialEncounterPlan('treasureGnome', kingdom, factionLevel(state, d), rngOf(seed), state.round > 1 ? 1 : 0);
      return { kingdom, enemies: sp.enemies, choice, bonus: sp.bonus };
    }
    const enemies = pickEnemies(kingdom, factionLevel(state, d), DISTRICT_INFO[d.kind].tiers, rngOf(seed));
    return { kingdom, enemies, choice };
  },

  modify(ctx, state, outcome) {
    const kingdom = kingdomOf(ctx);
    const match = factionMatchCount(ctx.save, kingdom);
    const b = factionBonuses(state);
    const req = outcome.request;
    // 战斗发生在目标王国：「战斗发生在X王国」条件生效
    req.kingdom = kingdom;
    const choice = outcome.plan.source.kind === 'event' ? outcome.plan.source.choice : undefined;
    if (choice === 'defend') {
      addRules(outcome, { turnLimit: { turns: FACTION_DEFEND_TURNS, onExpire: 'playerWins' } });
      injectTraits(req.playerTeam, [{ code: 'ev_fac_banner', on: 'all' }]);
    } else {
      const d = districtOf(state, choice);
      if (d?.gnome) applySpecialEncounter('treasureGnome', outcome);
      else if (d) {
        const affix = DISTRICT_AFFIX[d.kind];
        if (affix?.attackPct) for (const snap of req.enemyTeam) buffSnapshot(snap, { attackPct: affix.attackPct });
        if (d.kind === 'capital') {
          const boss = req.enemyTeam[0];
          injectTraitsOn(boss, ['ev_fac_warden', 'ev_fac_fort']);
          protectEventBoss(boss);
          if (boss) addRules(outcome, { objective: { killTargets: [boss.externalId] } });
        } else if (affix?.trait) injectTraits(req.enemyTeam, [{ code: affix.trait, on: 'all' }]);
      }
    }
    for (const snap of outcome.request.playerTeam) {
      buffSnapshot(snap, { attack: FACTION_BUFF_ATTACK_PER * match + b.attack, hp: FACTION_BUFF_HP_PER * match, armor: b.armor });
      if (b.hpPct) buffSnapshot(snap, { hpPct: b.hpPct });
    }
    if (b.mastery) addMastery(outcome, Object.values(BaseColor) as BaseColor[], b.mastery);
    if (b.enemyHp < 1) for (const snap of outcome.request.enemyTeam) snap.initialHp = Math.max(1, Math.round(snap.stats.hp * b.enemyHp));
  },

  points(_ctx, state, plan, _result, victory) {
    if (!victory) return 0;
    const d = districtOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    return Math.min(EVENT_POINTS_CAP, d?.kind === 'capital' ? 120 : d?.kind === 'fort' ? 110 : 100);
  },

  progress(ctx, state, plan, _result, victory) {
    const lines: EventProgressLine[] = [];
    const choice = plan.source.kind === 'event' ? plan.source.choice : undefined;
    // 反扑结算：驰援胜利保住地块；否则（没驰援或失败）失守
    if (state.threat) {
      const t = state.districts.find((x) => x.x === state.threat!.x && x.y === state.threat!.y);
      state.threat = null;
      if (t && t.owner === 'player') {
        if (choice === 'defend' && victory) {
          lines.push({ label: `驰援成功 · 守住${DISTRICT_INFO[t.kind].name}`, deltas: {}, note: '反扑被击退' });
        } else {
          t.owner = 'enemy';
          lines.push({ label: `敌军反扑 · 失去${DISTRICT_INFO[t.kind].name}`, deltas: {}, note: `${DISTRICT_INFO[t.kind].bonus} 失效` });
        }
      }
      if (choice === 'defend') return lines;
    }
    const d = districtOf(state, choice);
    if (!d) return lines;
    if (victory && d.owner === 'enemy') {
      d.owner = 'player';
      state.captures += 1;
      if (d.gnome) { d.gnome = false; lines.push({ label: '村落里的宝藏地精被找到了', deltas: {} }); }
      if (d.kind === 'capital') {
        state.conquered += 1;
        const week = ctx.week;
        if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.factionAssault) {
          const mats: MaterialDelta = { traitstones: { 'runic:green': 2, 'runic:brown': 2 }, ingots: { epic: EVENT_WEEKLY_EPIC_INGOTS.factionCapital } };
          earn(ctx.save, FACTION_CAPITAL_REWARD);
          earnMaterials(ctx.save, mats);
          week.playRewards += 1;
          lines.push({ label: `攻陷王城 · 第 ${state.round} 轮征服完成！`, deltas: { ...FACTION_CAPITAL_REWARD }, mats, note: '领地重整，下一轮守军更强' });
        } else {
          lines.push({ label: `攻陷王城 · 第 ${state.round} 轮征服完成！`, deltas: {}, note: '本周征服奖励已领满，积分与印记仍正常获得' });
        }
        state.round += 1;
        state.districts = buildMap(ctx, state.round);
        state.counterIn = FACTION_COUNTER_EVERY;
        return lines;
      }
      lines.push({ label: `占领${DISTRICT_INFO[d.kind].name}`, deltas: {}, note: `战区加成：${DISTRICT_INFO[d.kind].bonus}` });
    } else if (!victory) {
      lines.push({ label: `${DISTRICT_INFO[d.kind].name}进攻受挫`, deltas: {} });
    }
    state.counterIn -= 1;
    if (state.counterIn <= 0) {
      state.counterIn = FACTION_COUNTER_EVERY;
      // 反扑：夺回一块与敌占区接壤的己方地块（优先价值高的）
      const enemyTiles = state.districts.filter((x) => x.owner === 'enemy');
      const border = state.districts.filter((x) => x.owner === 'player' && enemyTiles.some((e) => adjacent(e, x)));
      const value: Record<DistrictKind, number> = { barracks: 5, fort: 5, shrine: 4, granary: 4, watchtower: 3, village: 1, capital: 0 };
      const lost = border.sort((a, b) => value[b.kind] - value[a.kind] || b.x - a.x)[0];
      if (lost) {
        state.threat = { x: lost.x, y: lost.y };
        lines.push({ label: `敌军反扑 · 目标${DISTRICT_INFO[lost.kind].name}`, deltas: {}, note: `下一场选择「驰援」坚守 ${FACTION_DEFEND_TURNS} 回合保住它，否则失守` });
      }
    } else {
      lines.push({ label: `敌军反扑倒计时 ${state.counterIn} 场`, deltas: {} });
    }
    return lines;
  },

  act(_ctx, state, action) {
    if (action !== 'abandon') return fail('INVALID', '未知操作');
    const t = state.threat && state.districts.find((x) => x.x === state.threat!.x && x.y === state.threat!.y);
    if (!t) return fail('INVALID', '当前没有被反扑的地块');
    t.owner = 'enemy';
    state.threat = null;
    return { ok: true, message: `放弃了${DISTRICT_INFO[t.kind].name}` };
  },

  nextLevel(_ctx, state) {
    const t = factionTargets(state)[0];
    return t ? factionLevel(state, t) : EVENT_BASE_LEVEL;
  },

  summary(_ctx, state) {
    const owned = state.districts.filter((d) => d.owner === 'player').length;
    return `第 ${state.round} 轮 · 占领 ${owned}/${state.districts.length} · 反扑 ${state.counterIn} 场后`;
  },
};
