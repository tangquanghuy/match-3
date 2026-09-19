import { describe, it, expect } from 'vitest';
import type { BattleResult } from '../../src/session/contract';
import { getTroopById } from '../../src/data/troops';
import {
  ARENA,
  ARENA_REWARDS,
  arenaDraftLevel,
  arrangeArenaTeam,
  currentDraftChoices,
  entryArena,
  forfeitArena,
  newSave,
  pickDraftCard,
  planArenaBattle,
  settleArenaBattle,
  startArenaBattles,
} from '../../src/meta';

const WEEK1 = 1726500000000; // 本周起点（调用方按本地周历算好传入）
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const save = (gems = 0) =>
  newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gems } });

function mkResult(winner: 'player' | 'enemy'): BattleResult {
  return {
    schemaVersion: 1,
    battleId: 'b',
    requestId: 'r',
    rulesetVersion: '1.0.0',
    seed: 1,
    winner,
    turns: 2,
    combatants: [],
    defeatedExternalIds: [],
    summonedCount: 0,
    actionLogDigest: '00000000',
    eventSummary: [],
  };
}

/** 全自动走完 draft：每轮锁定第一个选项 */
function autoDraft(s: ReturnType<typeof save>) {
  for (let round = 0; round < ARENA.rounds; round++) {
    const state = currentDraftChoices(s)!;
    const picked = pickDraftCard(s, state.options[0]!.troopId);
    if (!picked.ok) throw new Error(picked.message);
  }
}

describe('报名：本周首场免费 + 宝石报名费', () => {
  it('新档首场免费；同周再次报名按 150 宝石收费', () => {
    const s = save(300);
    const first = entryArena(s, 1000, WEEK1 + HOUR, WEEK1);
    expect(first).toEqual({ ok: true, free: true });
    expect(s.arena.lastFreeEntryAt).toBe(WEEK1 + HOUR);
    expect(s.arena.activeDraft?.stage).toBe('picking');

    // 已有进行中 → 拒绝
    expect(entryArena(s, 1001, WEEK1 + 2 * HOUR, WEEK1)).toMatchObject({ ok: false, code: 'INVALID' });
    forfeitArena(s);

    // 同周第二场：收费
    const paid = entryArena(s, 1002, WEEK1 + 3 * HOUR, WEEK1);
    expect(paid).toEqual({ ok: true, free: false });
    expect(s.currencies.gems).toBe(300 - ARENA.entryFeeGems);
  });

  it('免费票已用且宝石不足 → INSUFFICIENT，且不建 draft', () => {
    const s = save(0);
    s.arena.lastFreeEntryAt = WEEK1;
    const r = entryArena(s, 1002, WEEK1 + HOUR, WEEK1);
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.arena.activeDraft).toBeNull();
  });

  it('下周免费票恢复；正常付费报名扣 150', () => {
    const s = save(300);
    s.arena.lastFreeEntryAt = WEEK1;
    const nextWeek = WEEK1 + 7 * DAY;
    expect(entryArena(s, 2000, nextWeek + HOUR, nextWeek)).toEqual({ ok: true, free: true });
    expect(s.currencies.gems).toBe(300);
    forfeitArena(s);
    expect(entryArena(s, 2001, nextWeek + 2 * HOUR, nextWeek)).toEqual({ ok: true, free: false });
    expect(s.currencies.gems).toBe(300 - ARENA.entryFeeGems);
  });
});

describe('draft：三轮 3 选 1，固定稀有度阶梯（低→中→高档，官方 3C/3R/3UR 结构的六档适配）', () => {
  it('选项确定可复现；每轮档位落在对应阶梯内；各轮不重复', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = save();
      entryArena(s, seed, WEEK1, WEEK1);
      const picked = new Set<number>();
      for (let round = 0; round < ARENA.rounds; round++) {
        const a = currentDraftChoices(s)!;
        const b = currentDraftChoices(s)!;
        expect(b).toEqual(a);
        expect(a.options).toHaveLength(ARENA.choicesPerRound);
        expect(a.round).toBe(round);
        const band = ARENA.roundBands[round]!;
        for (const o of a.options) {
          expect(o.rarityIdx).toBeGreaterThanOrEqual(band.min);
          expect(o.rarityIdx).toBeLessThanOrEqual(band.max);
          expect(picked.has(o.troopId)).toBe(false);
        }
        const r = pickDraftCard(s, a.options[0]!.troopId);
        if (!r.ok) throw new Error(r.message);
        for (const id of r.picked) picked.add(id);
      }
      expect(currentDraftChoices(s)).toBeNull(); // 选满进入编队阶段
      expect(s.arena.activeDraft?.stage).toBe('building');
    }
  });

  it('末轮必出 Epic+（阶梯结构自保证，不再依赖随机抬档）', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = save();
      entryArena(s, seed, WEEK1, WEEK1);
      for (let round = 0; round < ARENA.rounds - 1; round++) {
        pickDraftCard(s, currentDraftChoices(s)!.options[0]!.troopId);
      }
      const last = currentDraftChoices(s)!;
      expect(last.options.some((o) => o.rarityIdx >= 4)).toBe(true);
    }
  });

  it('锁定不在本轮选项中的卡 → INVALID', () => {
    const s = save();
    entryArena(s, 7, WEEK1, WEEK1);
    const inOptions = new Set(currentDraftChoices(s)!.options.map((o) => o.troopId));
    const outsider = inOptions.has(6000) ? 6097 : 6000; // 找一张不在选项里的 starter 卡
    expect(pickDraftCard(s, outsider)).toMatchObject({ ok: false, code: 'INVALID' });
  });
});

describe('限定编队与连战', () => {
  it('站位列必须是 draft 卡的重排；确认后进入 fighting', () => {
    const s = save();
    entryArena(s, 42, WEEK1, WEEK1);
    autoDraft(s);
    const picked = [...s.arena.activeDraft!.picked];
    expect(arrangeArenaTeam(s, picked.slice(0, 2))).toMatchObject({ ok: false, code: 'INVALID' });
    expect(arrangeArenaTeam(s, [...picked].reverse())).toMatchObject({ ok: true });
    expect(s.arena.activeDraft!.picked).toEqual([...picked].reverse());
    expect(startArenaBattles(s)).toEqual({ ok: true });
    expect(s.arena.activeDraft!.stage).toBe('fighting');
  });

  it('对手递增（等级 10/14/18）；draft 卡按稀有度上限出战；3 胜收官发大奖', () => {
    const s = save();
    const collectionBefore = JSON.stringify(s.collection);
    const teamsBefore = JSON.stringify(s.teams);
    entryArena(s, 99, WEEK1, WEEK1);
    autoDraft(s);
    startArenaBattles(s);

    for (let wins = 0; wins < 3; wins++) {
      const plan = planArenaBattle(s, 500 + wins);
      if (!plan.ok) throw new Error(plan.message);
      const level = ARENA.opponentLevels[wins]!;
      expect(plan.opponents.every((e) => e.level === level)).toBe(true);
      expect(plan.request.playerTeam).toHaveLength(3);
      // 官方口径：现开赛不吃王国加成/旗帜——请求不带 playerBanner
      expect(plan.request.playerBanner).toBeUndefined();
      for (const snap of plan.request.playerTeam) {
        const troopId = Number(snap.externalId.split('-')[1]);
        const rarity = getTroopById(troopId)!.rarityIdx;
        expect(snap.levelLabel).toBe(`Lv.${arenaDraftLevel(rarity)}`);
        expect((snap.traitIds ?? []).length).toBeGreaterThan(0);
      }
      const settled = settleArenaBattle(s, mkResult('player'));
      if (!settled.ok) throw new Error(settled.message);
      expect(settled.victory).toBe(true);
      expect(settled.runOver).toBe(wins === 2);
    }

    expect(s.arena.activeDraft).toBeNull();
    expect(s.arena.bestRun).toBe(3);
    expect(s.arena.seasonWins).toBe(3);
    expect(s.currencies.gems).toBe(ARENA_REWARDS[3]!.gems);
    expect(s.currencies.goldKeys).toBe(1 + ARENA_REWARDS[3]!.goldKeys); // 初始档自带 1 把
    // 卡即用即弃：收藏与预设队零污染
    expect(JSON.stringify(s.collection)).toBe(collectionBefore);
    expect(JSON.stringify(s.teams)).toBe(teamsBefore);
  });

  it('败北即收官：按当前胜场发奖并清 draft', () => {
    const s = save();
    entryArena(s, 77, WEEK1, WEEK1);
    autoDraft(s);
    startArenaBattles(s);
    const first = settleArenaBattle(s, mkResult('player'));
    if (!first.ok) throw new Error(first.message);
    expect(first.runOver).toBe(false);
    const settled = settleArenaBattle(s, mkResult('enemy'));
    if (!settled.ok) throw new Error(settled.message);
    expect(settled).toMatchObject({ victory: false, wins: 1, runOver: true });
    expect(s.arena.activeDraft).toBeNull();
    expect(s.currencies.gold).toBe(2000 + ARENA_REWARDS[1]!.gold);
  });

  it('弃赛：按已得胜场结算', () => {
    const s = save();
    entryArena(s, 78, WEEK1, WEEK1);
    autoDraft(s);
    startArenaBattles(s);
    settleArenaBattle(s, mkResult('player'));
    const f = forfeitArena(s);
    if (!f.ok) throw new Error(f.message);
    expect(f.wins).toBe(1);
    expect(s.arena.activeDraft).toBeNull();
    expect(s.currencies.gold).toBe(2000 + ARENA_REWARDS[1]!.gold);
  });
});
