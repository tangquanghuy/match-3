/**
 * 世界事件 · 庆典棋盘（2026-09-29 重做；2026-09-30 深化批：棋盘与战斗打通）。
 *
 * 战斗不直接给物资，而是给「骰子」；物资要在 20 格的庆典环形棋盘上掷骰走出来：
 *  - 每场胜利 +1 骰；护送商队（坚守 8 回合即胜）再 +1；队伍中有 ≥2 名本周加成种族部队再 +1；
 *  - 资源格：物资 / 大丰收 / 金币 / 灯会（下一格奖励翻倍）/ 商队（定向骰）/ 传送门；
 *  - 遭遇格（落点后弹出「出战 / 放弃」）：
 *      地精出没 → 追击宝藏地精（它攒够法力会施法逃跑；击倒得钱袋，低概率钻石与藏宝图）
 *      地精乐队 → 四只乐手地精（全灭有压箱钻石）
 *      宝箱     → 70% 直接开箱；30% 是宝箱怪（受击掉赃物宝石，击倒得整箱宝藏）
 *      强盗伏击 → 交出物资，或迎战夺回
 *      庆典擂台 → 预置通配/沙漏的规则战，物资大奖
 *  - 集市：花黄金买「下一场庆典祝福」（开局法力、烟花通配、护身屏障、篝火风暴、沙漏、主题色糖果）；
 *  - 常规战斗：本周主题色的糖果宝石会自然掉落（正反馈）；
 *  - 经过或停在起点 = 绕场一圈，物资 +6；里程碑按累计物资结算。
 */
import { fnv1a32 } from '../../data/hash';
import { getTroopById } from '../../../data/troops';
import { BaseColor } from '../../../engine/types';
import { fail } from '../../types';
import { earn, spend } from '../wallet';
import { activeTeam } from '../teamRules';
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { pickEnemies } from '../encounter';
import { festCandyCode } from '../../data/eventTraits';
import {
  SPECIAL_INFO, SPECIAL_TUNING, applySpecialEncounter, specialEncounterPlan, type SpecialEncounterId,
} from '../specialEncounters';
import {
  EVENT_BASE_LEVEL, addRules, injectTraits, int, isObj, pickN, rngOf, str,
  type EventModeImpl, type EventProgressLine, type ModeCtx, type TraitRef,
} from './common';

export type BoardTile =
  | 'start' | 'supply' | 'harvest' | 'gold' | 'chest' | 'lantern' | 'trap' | 'caravan' | 'portal'
  | 'gnome' | 'band' | 'market' | 'arena';

export const BOARD_SIZE = 20;
export const BOARD_LAP_BONUS = 6;

export const TILE_INFO: Record<BoardTile, { name: string; desc: string }> = {
  start: { name: '起点', desc: `绕场一圈：物资 +${BOARD_LAP_BONUS}` },
  supply: { name: '物资', desc: '物资 +3' },
  harvest: { name: '大丰收', desc: '物资 +6' },
  gold: { name: '金币', desc: '黄金 +300' },
  chest: { name: '宝箱', desc: '70% 开出灵魂/黄金/骰子；30% 是宝箱怪——击倒它奖励翻倍' },
  lantern: { name: '灯会', desc: '下一次落点奖励翻倍' },
  trap: { name: '强盗伏击', desc: '交出 2 物资，或迎战：胜利物资 +4' },
  caravan: { name: '商队', desc: '获得一枚定向骰（可自选 1~6 点）' },
  portal: { name: '传送门', desc: '传送到前方最近的大丰收并领取' },
  gnome: { name: '地精出没', desc: '追击宝藏地精：在它逃跑前击倒，得钱袋与稀有宝物' },
  band: { name: '地精乐队', desc: '四只乐手地精：全员击倒有压箱钻石' },
  market: { name: '集市', desc: '花黄金购买下一场战斗的庆典祝福' },
  arena: { name: '庆典擂台', desc: '通配与沙漏遍地的擂台战：胜利物资 +10' },
};

/** 遭遇来源 → 出战种类 */
export type WorldEncounter = SpecialEncounterId | 'bandit' | 'arena';

export const ENCOUNTER_INFO: Record<WorldEncounter, { name: string; blurb: string }> = {
  ...SPECIAL_INFO,
  bandit: { name: '强盗伏击', blurb: '一伙强盗拦住去路，他们的骷髅攻击会顺走你的法力。打赢不但不丢物资，还能反抢一笔。' },
  arena: { name: '庆典擂台', blurb: '擂台上预置了通配与沙漏宝石，每回合还会冒出主题色糖果宝石。打赢拿物资大奖。' },
};

export type WorldBlessingId = 'ink' | 'wild' | 'aegis' | 'fire' | 'hourglass' | 'candy';

export const WORLD_BLESSINGS: Record<WorldBlessingId, { name: string; desc: string; icon: string }> = {
  ink: { name: '庆典彩带', desc: '全队以 30% 法力开战', icon: 'status:enchanted' },
  wild: { name: '烟花', desc: '回合开始 30% 几率创造 ×2 通配宝石', icon: 'gem:special/wildcard2' },
  aegis: { name: '护身符', desc: '每名队员开战获得屏障', icon: 'status:barrier' },
  fire: { name: '篝火', desc: '开战召唤火焰风暴（红色宝石更常掉落）', icon: 'gem:red' },
  hourglass: { name: '庆典沙漏', desc: '开战把 2 颗黄色宝石变成沙漏（匹配得额外回合）', icon: 'gem:special/hourglass' },
  candy: { name: '主题色糖果', desc: '回合开始 35% 几率把 1 颗主题色宝石变成糖果宝石', icon: 'gem:special/candy' },
};
export const WORLD_BLESSING_PRICE = 600;

export type WorldPending =
  | { kind: 'encounter'; enc: WorldEncounter; tier: number }
  | { kind: 'market'; options: WorldBlessingId[]; bought: boolean };

export interface WorldState {
  v: 1;
  board: BoardTile[];
  pos: number;
  dice: number;
  lucky: number;
  laps: number;
  supplies: number;
  doubleNext: boolean;
  rolls: number;
  wins: number;
  last: { roll: number; tile: BoardTile; text: string } | null;
  /** 落点后待处理（遭遇出战/放弃、集市） */
  pending: WorldPending | null;
  /** 已购的下一场庆典祝福（任意活动战斗后消耗） */
  blessing: WorldBlessingId | null;
  /** 本周已击倒的特殊遭遇数（展示用） */
  specials: number;
}

const COLORS = Object.values(BaseColor) as BaseColor[];

/** 本周庆典主题色（糖果宝石、主题祝福） */
export function worldThemeColor(weekStart: number): BaseColor {
  return COLORS[fnv1a32(`world-color-${weekStart >>> 0}`) % COLORS.length]!;
}

function buildBoard(weekStart: number): BoardTile[] {
  const rng = rngOf(fnv1a32(`world-board-v2-${weekStart >>> 0}`));
  const middle: BoardTile[] = [
    'supply', 'supply', 'supply', 'supply', 'harvest', 'harvest', 'gold', 'chest', 'chest',
    'lantern', 'trap', 'trap', 'caravan', 'portal', 'gnome', 'gnome', 'band', 'market', 'arena',
  ];
  return ['start', ...pickN(rng, middle, middle.length)];
}

/** 本场胜利获得的骰子数 */
export function worldDiceFor(ctx: ModeCtx, choice: string | undefined): { dice: number; matches: number } {
  const race = ctx.theme.bonusRace;
  const matches = race ? (activeTeam(ctx.save)?.members ?? []).filter((m) => m.kind === 'troop' && getTroopById(m.troopId)?.troopTypes.includes(race)).length : 0;
  return { dice: 1 + (choice === 'escort' ? 1 : 0) + (matches >= 2 ? 1 : 0), matches };
}

function worldLevel(state: WorldState, choice: string | undefined): number {
  const stage = Math.min(state.wins, 12);
  return EVENT_BASE_LEVEL + stage * 3 + (choice === 'escort' ? 5 : 0);
}

/** 走 steps 格并结算落点 */
function move(ctx: ModeCtx, state: WorldState, steps: number, seed: number): string {
  const parts: string[] = [];
  const before = state.pos;
  state.pos = (state.pos + steps) % BOARD_SIZE;
  if (before + steps >= BOARD_SIZE) {
    state.laps += 1;
    state.supplies += BOARD_LAP_BONUS;
    parts.push(`绕场一圈 物资 +${BOARD_LAP_BONUS}`);
  }
  let tile = state.board[state.pos]!;
  if (tile === 'portal') {
    let p = state.pos;
    for (let i = 1; i <= BOARD_SIZE; i++) {
      const q = (state.pos + i) % BOARD_SIZE;
      if (state.board[q] === 'harvest') { p = q; break; }
    }
    if (p < state.pos) { state.laps += 1; state.supplies += BOARD_LAP_BONUS; parts.push(`穿越起点 物资 +${BOARD_LAP_BONUS}`); }
    state.pos = p;
    tile = state.board[p]!;
    parts.push('传送门');
  }
  // 灯会只翻倍资源格；遭遇/集市格不消耗灯会
  const resource = tile === 'supply' || tile === 'harvest' || tile === 'gold' || tile === 'chest' || tile === 'caravan';
  const mult = state.doubleNext && resource ? 2 : 1;
  if (resource) state.doubleNext = false;
  const rng = rngOf(fnv1a32(`world-chest-${ctx.weekStart}-${state.rolls}-${seed}`));
  const tier = state.laps > 0 ? 1 : 0;
  switch (tile) {
    case 'start': break;
    case 'supply': state.supplies += 3 * mult; parts.push(`物资 +${3 * mult}`); break;
    case 'harvest': state.supplies += 6 * mult; parts.push(`大丰收 物资 +${6 * mult}`); break;
    case 'gold': earn(ctx.save, { gold: 300 * mult }); parts.push(`黄金 +${300 * mult}`); break;
    case 'chest': {
      if (rng.next() < 0.3) {
        state.pending = { kind: 'encounter', enc: 'mimic', tier };
        parts.push('宝箱张开了獠牙——是宝箱怪！');
        break;
      }
      const r = rng.nextInt(3);
      if (r === 0) { earn(ctx.save, { souls: 500 * mult }); parts.push(`宝箱 灵魂 +${500 * mult}`); }
      else if (r === 1) { earn(ctx.save, { gold: 500 * mult }); parts.push(`宝箱 黄金 +${500 * mult}`); }
      else { state.dice += mult; parts.push(`宝箱 骰子 +${mult}`); }
      break;
    }
    case 'lantern': state.doubleNext = true; parts.push('灯会 下一次落点翻倍'); break;
    case 'trap': state.pending = { kind: 'encounter', enc: 'bandit', tier }; parts.push('强盗拦路！'); break;
    case 'caravan': state.lucky += mult; parts.push(`商队 定向骰 +${mult}`); break;
    case 'gnome': {
      // 第二圈起 40% 遇到整群背着宝物的地精
      const party = tier > 0 && rng.next() < 0.4;
      state.pending = { kind: 'encounter', enc: party ? 'gnomeParty' : 'treasureGnome', tier };
      parts.push(party ? '一群背着宝物的地精正在赶路！' : '发现一只抱着钱袋的宝藏地精！');
      break;
    }
    case 'band': state.pending = { kind: 'encounter', enc: 'gnomeBand', tier }; parts.push('地精乐队正在街角演出'); break;
    case 'arena': state.pending = { kind: 'encounter', enc: 'arena', tier }; parts.push('庆典擂台开放挑战'); break;
    case 'market': {
      const pool = Object.keys(WORLD_BLESSINGS) as WorldBlessingId[];
      state.pending = { kind: 'market', options: pickN(rng, pool, 3), bought: false };
      parts.push('来到庆典集市');
      break;
    }
    case 'portal': break;
  }
  const text = parts.join(' · ') || TILE_INFO[tile].name;
  state.last = { roll: steps, tile, text };
  return text;
}

function blessingRefs(id: WorldBlessingId, weekStart: number): TraitRef[] {
  switch (id) {
    case 'ink': return [{ code: 'ev_bless_ink', on: 'lead' }];
    case 'wild': return [{ code: 'ev_bless_wild', on: 'lead' }];
    case 'aegis': return [{ code: 'ev_bless_aegis', on: 'all' }];
    case 'fire': return [{ code: 'ev_bless_fire', on: 'lead' }];
    case 'hourglass': return [{ code: 'ev_bless_hourglass', on: 'lead' }];
    case 'candy': return [{ code: festCandyCode(worldThemeColor(weekStart)), on: 'lead' }];
  }
}

const isBlessing = (v: unknown): v is WorldBlessingId => typeof v === 'string' && v in WORLD_BLESSINGS;
const isEncounter = (v: unknown): v is WorldEncounter => typeof v === 'string' && v in ENCOUNTER_INFO;

function sanitizePending(raw: unknown): WorldPending | null {
  if (!isObj(raw)) return null;
  if (raw.kind === 'encounter' && isEncounter(raw.enc)) return { kind: 'encounter', enc: raw.enc, tier: int(raw.tier, 0, 0, 1) };
  if (raw.kind === 'market' && Array.isArray(raw.options)) {
    const options = raw.options.filter(isBlessing);
    if (options.length > 0) return { kind: 'market', options, bought: raw.bought === true };
  }
  return null;
}

/** 当前遭遇战的动作名（视图出战按钮用） */
export const WORLD_ENCOUNTER_ACTION = 'enc';

export const worldMode: EventModeImpl<WorldState> = {
  init(ctx) {
    return {
      v: 1, board: buildBoard(ctx.weekStart), pos: 0, dice: 0, lucky: 0, laps: 0, supplies: 0, doubleNext: false,
      rolls: 0, wins: 0, last: null, pending: null, blessing: null, specials: 0,
    };
  },

  sanitize(raw, ctx) {
    if (!isObj(raw) || raw.v !== 1) return null;
    const last = isObj(raw.last) && typeof raw.last.tile === 'string' && raw.last.tile in TILE_INFO
      ? { roll: int(raw.last.roll, 1, 1, 6), tile: raw.last.tile as BoardTile, text: str(raw.last.text, '') } : null;
    return {
      v: 1, board: buildBoard(ctx.weekStart), pos: int(raw.pos, 0, 0, BOARD_SIZE - 1), dice: int(raw.dice, 0, 0), lucky: int(raw.lucky, 0, 0),
      laps: int(raw.laps, 0, 0), supplies: int(raw.supplies, 0, 0), doubleNext: raw.doubleNext === true, rolls: int(raw.rolls, 0, 0),
      wins: int(raw.wins, 0, 0), last, pending: sanitizePending(raw.pending), blessing: isBlessing(raw.blessing) ? raw.blessing : null,
      specials: int(raw.specials, 0, 0),
    };
  },

  ready(_ctx, state, action) {
    if (action === WORLD_ENCOUNTER_ACTION && state.pending?.kind !== 'encounter') return '当前没有可挑战的遭遇';
    return null;
  },

  plan(_ctx, state, seed, action) {
    const rng = rngOf(seed);
    let kingdom = KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;
    if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
    if (action === WORLD_ENCOUNTER_ACTION) {
      const pending = state.pending;
      if (pending?.kind !== 'encounter') return fail('INVALID', '当前没有可挑战的遭遇');
      const level = worldLevel(state, 'survey') + pending.tier * 3;
      const choice = `enc:${pending.enc}`;
      if (pending.enc === 'bandit') return { kingdom, enemies: pickEnemies(kingdom, level, ['elite', 'minion', 'minion'], rng), choice };
      if (pending.enc === 'arena') {
        return {
          kingdom, enemies: pickEnemies(kingdom, level + 2, ['elite', 'elite', 'minion'], rng), choice,
          bonus: [{ id: 'arena-fast', label: '擂台速胜彩头', when: { kind: 'turnsAtMost', n: 8 }, chance: 0.15, deltas: { gems: SPECIAL_TUNING.gems } }],
        };
      }
      const sp = specialEncounterPlan(pending.enc, kingdom, level, rng, pending.tier);
      return { kingdom, enemies: sp.enemies, choice, bonus: sp.bonus };
    }
    const choice = action === 'escort' ? 'escort' : 'survey';
    return { kingdom, enemies: pickEnemies(kingdom, worldLevel(state, choice), ['elite', 'minion', 'minion'], rng), choice };
  },

  modify(ctx, state, outcome) {
    const choice = outcome.plan.source.kind === 'event' ? outcome.plan.source.choice ?? '' : '';
    const color = worldThemeColor(ctx.weekStart);
    const req = outcome.request;
    if (state.blessing) injectTraits(req.playerTeam, blessingRefs(state.blessing, ctx.weekStart));
    if (choice === 'survey') {
      // 常规搜寻：主题色糖果宝石自然掉落
      addRules(outcome, { board: { specialDrops: { chance: 0.04, pool: [{ gem: { kind: 'candyGem', color }, weight: 1 }] } } });
    } else if (choice === 'escort') {
      // 护送：坚守 8 个我方回合即胜
      addRules(outcome, { turnLimit: { turns: 8, onExpire: 'playerWins' } });
    } else if (choice.startsWith('enc:')) {
      const enc = choice.slice(4) as WorldEncounter;
      if (enc === 'bandit') injectTraits(req.enemyTeam, [{ code: 'ev_bandit_cutpurse', on: 'all' }]);
      else if (enc === 'arena') {
        addRules(outcome, {
          board: { preset: [{ gem: { kind: 'wildcard', tier: 2 }, count: 2 }, { gem: { kind: 'hourglass' }, count: 2 }] },
          turnStart: [{ side: 'player', createGems: [{ gem: { kind: 'candyGem', color }, count: 1 }] }],
        });
      } else applySpecialEncounter(enc, outcome);
    }
  },

  points(_ctx, _state, plan, _result, victory) {
    if (!victory || plan.source.kind !== 'event') return 0;
    const choice = plan.source.choice ?? '';
    return choice === 'escort' || choice.startsWith('enc:') ? 120 : 100;
  },

  progress(ctx, state, plan, result, victory) {
    const choice = plan.source.kind === 'event' ? plan.source.choice ?? '' : '';
    const lines: EventProgressLine[] = [];
    const usedBlessing = state.blessing;
    state.blessing = null;
    if (choice.startsWith('enc:')) {
      const enc = choice.slice(4) as WorldEncounter;
      state.pending = null;
      if (!victory) {
        if (enc === 'bandit') {
          const loss = Math.min(state.supplies, 2);
          state.supplies -= loss;
          lines.push({ label: `强盗得手 · 物资 -${loss}`, deltas: {} });
        } else lines.push({ label: `${ENCOUNTER_INFO[enc].name}失败`, deltas: {}, note: '遭遇已离开棋盘' });
        return lines;
      }
      state.wins += 1;
      state.dice += 1;
      let note = '骰子 +1';
      if (enc === 'bandit') { state.supplies += 4; note += ' · 反抢物资 +4'; }
      if (enc === 'arena') { state.supplies += 10; note += ' · 擂台物资 +10'; }
      if (enc === 'mimic') { state.supplies += 6; state.dice += 1; note += ' · 宝箱加倍：物资 +6、骰子 +1'; }
      if (enc === 'treasureGnome' || enc === 'gnomeBand' || enc === 'gnomeParty') {
        const fled = (result.fledExternalIds ?? []).length;
        note += fled > 0 ? ` · ${fled} 只地精溜走了` : ' · 一只也没跑掉！';
      }
      if (enc !== 'bandit' && enc !== 'arena') state.specials += 1;
      lines.push({ label: `${ENCOUNTER_INFO[enc].name} · 胜利`, deltas: {}, note: `${note}${usedBlessing ? ` · 已用祝福「${WORLD_BLESSINGS[usedBlessing].name}」` : ''}` });
      return lines;
    }
    if (!victory) return usedBlessing ? [{ label: `祝福「${WORLD_BLESSINGS[usedBlessing].name}」已消耗`, deltas: {} }] : [];
    const { dice, matches } = worldDiceFor(ctx, choice);
    state.dice += dice;
    state.wins += 1;
    return [{ label: `庆典骰子 +${dice}`, deltas: {}, note: `回到活动页掷骰前进${matches >= 2 ? ' · 加成种族 +1' : ''}${choice === 'escort' ? ' · 护送 +1' : ''}` }];
  },

  act(ctx, state, action, seed) {
    const [verb, arg] = action.split(':');
    if (verb === 'skip') {
      if (!state.pending) return fail('INVALID', '没有待处理的事项');
      const p = state.pending;
      state.pending = null;
      if (p.kind === 'encounter' && p.enc === 'bandit') {
        const loss = Math.min(state.supplies, 2);
        state.supplies -= loss;
        return { ok: true, message: `交出物资 ${loss}，强盗放行` };
      }
      return { ok: true, message: p.kind === 'market' ? '离开集市' : `放弃了${ENCOUNTER_INFO[p.enc].name}` };
    }
    if (verb === 'bless') {
      const p = state.pending;
      if (p?.kind !== 'market') return fail('INVALID', '不在集市');
      if (p.bought) return fail('SOLD_OUT', '本次集市已购买过祝福');
      const id = p.options[Number(arg)];
      if (!id) return fail('INVALID', '无效选项');
      const paid = spend(ctx.save, { gold: WORLD_BLESSING_PRICE });
      if (!paid.ok) return paid;
      p.bought = true;
      state.blessing = id;
      state.pending = null;
      return { ok: true, message: `购得祝福「${WORLD_BLESSINGS[id].name}」：下一场战斗生效` };
    }
    if (state.pending) return fail('INVALID', state.pending.kind === 'market' ? '请先离开集市' : '请先处理眼前的遭遇（出战或放弃）');
    if (action === 'roll') {
      if (state.dice <= 0) return fail('INSUFFICIENT', '没有骰子：赢下活动战斗获得');
      state.dice -= 1;
      state.rolls += 1;
      const roll = 1 + rngOf(fnv1a32(`world-roll-${ctx.weekStart}-${state.rolls}-${seed}`)).nextInt(6);
      return { ok: true, message: `掷出 ${roll} 点 · ${move(ctx, state, roll, seed)}` };
    }
    const m = action.match(/^lucky:([1-6])$/);
    if (m) {
      if (state.lucky <= 0) return fail('INSUFFICIENT', '没有定向骰');
      state.lucky -= 1;
      state.rolls += 1;
      const roll = Number(m[1]);
      return { ok: true, message: `定向骰 ${roll} 点 · ${move(ctx, state, roll, seed)}` };
    }
    return fail('INVALID', '未知操作');
  },

  nextLevel: (_ctx, state) => worldLevel(state, 'survey'),

  summary: (_ctx, state) => `物资 ${state.supplies} · 骰子 ${state.dice}${state.lucky ? ` + 定向 ${state.lucky}` : ''} · 第 ${state.laps + 1} 圈${state.pending?.kind === 'encounter' ? ` · 待挑战：${ENCOUNTER_INFO[state.pending.enc].name}` : ''}`,

  metric: (_ctx, state) => ({ label: '物资', value: state.supplies }),
};
