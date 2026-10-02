/**
 * 活动深化批（2026-09-30）：战斗规则、特殊遭遇、额外奖励在各活动中的落地。
 */
import { describe, it, expect } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { EVENT_UNLOCK_HERO_LEVEL, WEEK_MS } from '../../src/meta/data/events';
import { eventAction, eventModeState } from '../../src/meta/systems/events';
import { BOARD_SIZE, WORLD_BLESSING_PRICE, type BoardTile } from '../../src/meta/systems/eventModes/world';
import { revalidateOutcome } from '../../src/meta/systems/battleBridge';
import { SPECIAL_TUNING } from '../../src/meta/systems/specialEncounters';
import type { MetaSave } from '../../src/meta/state/schema';
import { eventBattle, fakeResult, settleEvent } from './helpers/eventDriver';

const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
const fresh = (): MetaSave => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 5000 } });
  s.hero.level = EVENT_UNLOCK_HERO_LEVEL;
  return s;
};

/** 用定向骰精确落到某类格子 */
function landOn(s: MetaSave, tile: BoardTile): void {
  const state = eventModeState(s, WEEK, 'worldEvent');
  const idx = state.board.indexOf(tile);
  expect(idx, tile).toBeGreaterThan(0);
  state.pending = null;
  state.pos = (idx - 1 + BOARD_SIZE) % BOARD_SIZE;
  state.lucky = 1;
  const r = eventAction(s, WEEK, 'worldEvent', 'lucky:1', 7);
  expect(r.ok).toBe(true);
}

describe('世界事件 · 特殊遭遇', () => {
  it('地精出没：落点弹出遭遇，出战带击杀目标与补法力规则，击倒得钱袋', () => {
    const s = fresh();
    landOn(s, 'gnome');
    const state = eventModeState(s, WEEK, 'worldEvent');
    expect(state.pending).toMatchObject({ kind: 'encounter', enc: 'treasureGnome' });
    // 遭遇未处理不能掷骰
    state.dice = 1;
    expect(eventAction(s, WEEK, 'worldEvent', 'roll', 1).ok).toBe(false);

    const out = eventBattle(s, 'worldEvent', WEEK, 'enc');
    expect(revalidateOutcome(out)).toBeNull();
    const gnome = out.request.enemyTeam.find((e) => e.templateId === '6497')!;
    expect(gnome).toBeTruthy();
    expect(out.request.rules?.objective?.killTargets).toEqual([gnome.externalId]);
    expect(out.request.rules?.turnStart?.[0]).toMatchObject({ side: 'enemy', mana: { amount: SPECIAL_TUNING.gnome.manaPerTurn, targets: [gnome.externalId] } });
    expect(gnome.traitIds).toContain('ev_loot_booty');
    expect(out.plan.bonus?.length).toBeGreaterThan(0);

    const gold0 = s.currencies.gold;
    const detail = settleEvent(s, out, fakeResult(out), WEEK);
    const bonus = detail.lines.filter((l) => l.key === 'battle-bonus');
    expect(bonus.some((l) => l.deltas.gold === SPECIAL_TUNING.gnome.gold)).toBe(true);
    expect(s.currencies.gold).toBeGreaterThan(gold0 + SPECIAL_TUNING.gnome.gold);
    expect(state.pending).toBeNull();
    expect(state.specials).toBe(1);
  });

  it('地精逃跑：只拿零钱', () => {
    const s = fresh();
    landOn(s, 'gnome');
    const out = eventBattle(s, 'worldEvent', WEEK, 'enc');
    const gnome = out.request.enemyTeam.find((e) => e.templateId === '6497')!;
    const r = fakeResult(out);
    r.defeatedExternalIds = r.defeatedExternalIds.filter((id) => id !== gnome.externalId);
    r.fledExternalIds = [gnome.externalId];
    const detail = settleEvent(s, out, r, WEEK);
    const labels = detail.lines.filter((l) => l.key === 'battle-bonus').map((l) => l.label);
    expect(labels).toEqual(['地精掉落的零钱']);
  });

  it('宝箱怪 / 地精乐队出战请求均通过会话校验', () => {
    for (const tile of ['band', 'arena'] as const) {
      const s = fresh();
      landOn(s, tile);
      const out = eventBattle(s, 'worldEvent', WEEK, 'enc');
      expect(revalidateOutcome(out), tile).toBeNull();
    }
    const s = fresh();
    const state = eventModeState(s, WEEK, 'worldEvent');
    state.pending = { kind: 'encounter', enc: 'mimic', tier: 1 };
    const out = eventBattle(s, 'worldEvent', WEEK, 'enc');
    expect(revalidateOutcome(out)).toBeNull();
    expect(out.request.enemyTeam[0]!.templateId).toBe('7157');
    expect(out.request.rules?.board?.preset?.[0]?.gem.kind).toBe('bootyGem');
  });

  it('强盗：放弃交出 2 物资；迎战胜利物资 +4', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'worldEvent');
    state.supplies = 10;
    state.pending = { kind: 'encounter', enc: 'bandit', tier: 0 };
    expect(eventAction(s, WEEK, 'worldEvent', 'skip', 1).ok).toBe(true);
    expect(state.supplies).toBe(8);
    state.pending = { kind: 'encounter', enc: 'bandit', tier: 0 };
    const out = eventBattle(s, 'worldEvent', WEEK, 'enc');
    expect(out.request.enemyTeam.every((e) => e.traitIds?.includes('ev_bandit_cutpurse'))).toBe(true);
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(state.supplies).toBe(12);
  });

  it('集市：花黄金买祝福，下一场注入特质并消耗', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'worldEvent');
    state.pending = { kind: 'market', options: ['aegis', 'ink', 'wild'], bought: false };
    const gold0 = s.currencies.gold;
    expect(eventAction(s, WEEK, 'worldEvent', 'bless:0', 1).ok).toBe(true);
    expect(s.currencies.gold).toBe(gold0 - WORLD_BLESSING_PRICE);
    expect(state.blessing).toBe('aegis');
    const out = eventBattle(s, 'worldEvent', WEEK, 'survey');
    expect(out.request.playerTeam.every((p) => p.traitIds?.includes('ev_bless_aegis'))).toBe(true);
    expect(out.request.rules?.board?.specialDrops?.pool[0]?.gem.kind).toBe('candyGem');
    expect(revalidateOutcome(out)).toBeNull();
    settleEvent(s, out, fakeResult(out, false), WEEK);
    expect(state.blessing).toBeNull();
  });

  it('护送：坚守 8 回合即胜', () => {
    const s = fresh();
    const out = eventBattle(s, 'worldEvent', WEEK, 'escort');
    expect(out.request.rules?.turnLimit).toEqual({ turns: 8, onExpire: 'playerWins' });
  });
});

describe('突袭首领 · 原型机制与战术补给', () => {
  it('首领挂原型与破绽特质；补给三选一下一场生效并消耗；重创彩头按伤害判定', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'raidBoss');
    expect(state.offer).toHaveLength(3);
    const idx = state.offer!.indexOf('giant') >= 0 ? state.offer!.indexOf('giant') : 0;
    const picked = state.offer![idx]!;
    expect(eventAction(s, WEEK, 'raidBoss', `supply:${idx}`, 1).ok).toBe(true);
    expect(state.supply).toBe(picked);
    const out = eventBattle(s, 'raidBoss', WEEK);
    expect(revalidateOutcome(out)).toBeNull();
    const boss = out.request.enemyTeam[0]!;
    expect(boss.traitIds).toContain('indestructible');
    expect(boss.displayTraitIds?.[0]).toBe('indestructible');
    expect(boss.traitIds?.some((c) => c.startsWith('ev_boss_weak_'))).toBe(true);
    expect(boss.traitIds?.some((c) => ['ev_boss_lava', 'ev_boss_lich', 'ev_boss_tempest', 'ev_boss_broodmother', 'ev_boss_frostwyrm'].includes(c))).toBe(true);
    // 打掉 20% 血池（未讨伐）
    const r = fakeResult(out, false);
    const bc = r.combatants.find((c) => c.externalId === boss.externalId)!;
    bc.hp = state.hp - Math.ceil(state.max * 0.2);
    settleEvent(s, out, r, WEEK);
    expect(state.supply).toBeNull();
    expect(state.offer).toHaveLength(3);
    expect(state.hp).toBe(bc.hp);
  });
});

describe('入侵 · 兵团特质 / 城防 / 城门坚守 / 辎重队', () => {
  it('兵团注入特质；城防点建城防并在下一场生效', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'invasion');
    const siege = state.squads.find((q) => q.kind === 'siege')!;
    const out = eventBattle(s, 'invasion', WEEK, `squad:${siege.id}`);
    expect(revalidateOutcome(out)).toBeNull();
    expect(out.request.enemyTeam.every((e) => e.traitIds?.includes('ev_inv_ram'))).toBe(true);
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(state.defense).toBeGreaterThanOrEqual(1);
    state.defense = 5;
    expect(eventAction(s, WEEK, 'invasion', 'build:arrow', 1).ok).toBe(true);
    expect(eventAction(s, WEEK, 'invasion', 'build:arrow', 1).ok).toBe(false);
    expect(state.defense).toBe(3);
    const next = state.squads[0]!;
    const out2 = eventBattle(s, 'invasion', WEEK, `squad:${next.id}`);
    expect(out2.request.playerTeam[0]!.traitIds).toContain('ev_def_arrow');
  });

  it('城门坚守：只允许兵临城下；胜利把兵团击退而不歼灭', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'invasion');
    expect(eventAction(s, WEEK, 'invasion', 'build:nope', 1).ok).toBe(false);
    // 失败动作会原地还原状态（数组换新），之后再取引用
    const squad = state.squads.find((q) => q.kind !== 'caravan')!;
    squad.dist = 1;
    const out = eventBattle(s, 'invasion', WEEK, `hold:${squad.id}`);
    expect(out.request.rules?.turnLimit).toEqual({ turns: 7, onExpire: 'playerWins' });
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(state.squads.find((q) => q.id === squad.id)?.dist).toBe(4);
  });

  it('辎重队是地精群遭遇，带额外奖励声明', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'invasion');
    state.wave = 2;
    state.squads.push({ id: 999, lane: 0, dist: 2, kind: 'caravan', troops: [6673, 6557] });
    const out = eventBattle(s, 'invasion', WEEK, 'squad:999');
    expect(revalidateOutcome(out)).toBeNull();
    expect(out.plan.bonus?.length).toBeGreaterThan(0);
    expect(out.request.rules?.turnStart?.[0]?.side).toBe('enemy');
  });
});

describe('阵营突袭 · 王国战场 / 地块词缀 / 斩首 / 驰援 / 村落地精', () => {
  it('请求带战斗王国；城塞守军有屏障词缀；王城为斩首', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'factionAssault');
    const border = state.districts.find((d) => d.x === 0)!;
    border.kind = 'fort';
    border.gnome = false;
    const out = eventBattle(s, 'factionAssault', WEEK, `tile:0-${border.y}`);
    expect(out.request.kingdom).toBeTruthy();
    expect(out.request.enemyTeam.every((e) => e.traitIds?.includes('ev_fac_fort'))).toBe(true);
    expect(revalidateOutcome(out)).toBeNull();
    // 王城：全部己方 + 满足内应条件时直接构造（绕过 ready）
    for (const d of state.districts) if (d.kind !== 'capital') d.owner = 'player';
    const cap = eventBattle(s, 'factionAssault', WEEK, 'tile:3-1');
    const boss = cap.request.enemyTeam[0]!;
    expect(cap.request.rules?.objective?.killTargets).toEqual([boss.externalId]);
    expect(boss.traitIds).toContain('ev_fac_warden');
  });

  it('村落地精：进攻即地精追击，带额外奖励', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'factionAssault');
    const border = state.districts.find((d) => d.x === 0)!;
    border.kind = 'village';
    border.gnome = true;
    const out = eventBattle(s, 'factionAssault', WEEK, `tile:0-${border.y}`);
    expect(out.request.enemyTeam.some((e) => e.templateId === '6497')).toBe(true);
    expect(out.plan.bonus?.length).toBeGreaterThan(0);
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(border.owner).toBe('player');
    expect(border.gnome).toBe(false);
  });

  it('反扑：驰援坚守保住地块；不驰援则失守', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'factionAssault');
    const a = state.districts.find((d) => d.x === 0 && d.y === 0)!;
    a.owner = 'player';
    state.threat = { x: 0, y: 0 };
    const out = eventBattle(s, 'factionAssault', WEEK, 'defend');
    expect(out.request.rules?.turnLimit).toEqual({ turns: 6, onExpire: 'playerWins' });
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(a.owner).toBe('player');
    expect(state.threat).toBeNull();
    state.threat = { x: 0, y: 0 };
    const other = state.districts.find((d) => d.x === 0 && d.y === 1)!;
    other.gnome = false;
    const out2 = eventBattle(s, 'factionAssault', WEEK, 'tile:0-1');
    settleEvent(s, out2, fakeResult(out2), WEEK);
    expect(a.owner).toBe('enemy');
  });
});

describe('职业试炼 · 机制规则与每周词条', () => {
  it('新机制试炼的请求全部通过会话校验，并带词条与速胜彩头', async () => {
    const { TRIAL_POOL, trialAffixOf, TRIAL_AFFIXES } = await import('../../src/meta/systems/eventModes/trials');
    const s = fresh();
    s.hero.classId = s.hero.unlockedClasses[0] ?? s.hero.classId;
    const state = eventModeState(s, WEEK, 'classTrials');
    for (const def of TRIAL_POOL) {
      state.trials = [def.id];
      const out = eventBattle(s, 'classTrials', WEEK, `trial:${def.id}`);
      expect(revalidateOutcome(out), def.id).toBeNull();
      const affix = TRIAL_AFFIXES[trialAffixOf(WEEK, def.id)];
      const team = affix.side === 'player' ? out.request.playerTeam : out.request.enemyTeam;
      expect(team.some((m) => m.traitIds?.includes(affix.trait)), def.id).toBe(true);
      expect(out.plan.bonus?.[0]?.when).toEqual({ kind: 'turnsAtMost', n: 6 });
      if (def.id === 'behead') expect(out.request.rules?.objective?.killTargets).toEqual([out.request.enemyTeam.at(-1)!.externalId]);
      if (def.id === 'blitz') expect(out.request.rules?.turnLimit?.onExpire).toBe('enemyWins');
    }
  });
});
