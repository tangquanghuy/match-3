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

const save = (gems = 0) => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gems } });
  s.kingdoms['破碎尖塔'] = { level: 1, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
  return s;
};

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

describe('报名：每届1000黄金，不使用宝石或每周票', () => {
  it('黄金不足时不扣费、不创建草稿', () => {
    const s = save(9999); s.currencies.gold = 999;
    expect(entryArena(s, 1, WEEK1, WEEK1)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.currencies.gold).toBe(999); expect(s.currencies.gems).toBe(9999);
    expect(s.arena.activeDraft).toBeNull();
  });
  it('跨周和同周都按黄金收费，进行中重复报名不扣费', () => {
    const s = save(300); s.currencies.gold = 5000;
    expect(entryArena(s, 1, WEEK1, WEEK1)).toEqual({ ok: true, free: false });
    expect(s.currencies.gold).toBe(4000);
    expect(entryArena(s, 2, WEEK1, WEEK1)).toMatchObject({ ok: false });
    expect(s.currencies.gold).toBe(4000);
    forfeitArena(s);
    expect(entryArena(s, 3, WEEK1 + 7 * DAY, WEEK1 + 7 * DAY)).toEqual({ ok: true, free: false });
    expect(s.currencies.gold).toBe(3050); expect(s.currencies.gems).toBe(300);
  });
});

describe('draft：四轮 3 选 1，普通、稀有、超稀有、史诗', () => {
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
      expect(last.options.some((o) => o.rarityIdx === 3)).toBe(true);
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

  it('双方固定15级、四人、无特质；6 胜收官发大奖', () => {
    const s = save();
    const collectionBefore = JSON.stringify(s.collection);
    const teamsBefore = JSON.stringify(s.teams);
    entryArena(s, 99, WEEK1, WEEK1);
    autoDraft(s);
    startArenaBattles(s);

    for (let wins = 0; wins < 6; wins++) {
      const plan = planArenaBattle(s, 500 + wins);
      if (!plan.ok) throw new Error(plan.message);
      const level = ARENA.opponentLevels[wins]!;
      expect(plan.opponents.every((e) => e.level === level)).toBe(true);
      expect(plan.request.playerTeam).toHaveLength(4);
      for (const member of [...plan.request.playerTeam, ...plan.request.enemyTeam]) {
        expect(plan.registry.prototypes.has(String(member.skillId))).toBe(true);
      }
      // 官方口径：现开赛不吃王国加成/旗帜——请求不带 playerBanner
      expect(plan.request.playerBanner).toBeUndefined();
      for (const snap of plan.request.playerTeam) {
        const troopId = Number(snap.externalId.split('-')[1]);
        const rarity = getTroopById(troopId)!.rarityIdx;
        expect(snap.levelLabel).toBe(`Lv.${arenaDraftLevel(rarity)}`);
        expect(snap.traitIds).toEqual([]);
      }
      const settled = settleArenaBattle(s, mkResult('player'));
      if (!settled.ok) throw new Error(settled.message);
      expect(settled.victory).toBe(true);
      expect(settled.runOver).toBe(wins === 5);
    }

    expect(s.arena.activeDraft).toBeNull();
    expect(s.arena.bestRun).toBe(6);
    expect(s.arena.seasonWins).toBe(6);
    expect(s.currencies.gloryKeys).toBe(ARENA_REWARDS[6]!.gloryKeys);
    expect(s.currencies.trophies).toBe(ARENA_REWARDS[6]!.trophies); // 初始档自带 1 把
    // 卡即用即弃：收藏与预设队零污染
    expect(JSON.stringify(s.collection)).toBe(collectionBefore);
    expect(JSON.stringify(s.teams)).toBe(teamsBefore);
  });

  it('两败收官：按当前胜场发奖并清 draft', () => {
    const s = save();
    entryArena(s, 77, WEEK1, WEEK1);
    autoDraft(s);
    startArenaBattles(s);
    const first = settleArenaBattle(s, mkResult('player'));
    if (!first.ok) throw new Error(first.message);
    expect(first.runOver).toBe(false);
    const loss = settleArenaBattle(s, mkResult('enemy'));
    expect(loss).toMatchObject({ ok: true, runOver: false, losses: 1 });
    const settled = settleArenaBattle(s, mkResult('enemy'));
    if (!settled.ok) throw new Error(settled.message);
    expect(settled).toMatchObject({ victory: false, wins: 1, runOver: true });
    expect(s.arena.activeDraft).toBeNull();
    expect(s.currencies.gold).toBe(1000 + ARENA_REWARDS[1]!.gold + 60 + 20 + 20);
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
    expect(s.currencies.gold).toBe(1000 + ARENA_REWARDS[1]!.gold + 60);
  });
});

 describe('arena per-battle progression', () => {
  it('pays XP and base resources before the run is over, including defeats', () => {
    const s = save(); s.currencies.gold = 5000;
    entryArena(s, 1, WEEK1, WEEK1); autoDraft(s); startArenaBattles(s);
    const before = { ...s.currencies };
    const win = settleArenaBattle(s, mkResult('player'));
    expect(win).toMatchObject({ ok: true, runOver: false,
      battleRewards: { gold: 60, souls: 30, xpGained: 100, heroLevelsGained: 1 } });
    expect(s.currencies.gold - before.gold).toBe(60);
    expect(s.currencies.souls - before.souls).toBe(30);
    expect(s.hero.level).toBe(2); expect(s.hero.xp).toBe(20);
    const loss = settleArenaBattle(s, mkResult('enemy'));
    expect(loss).toMatchObject({ ok: true, runOver: false,
      battleRewards: { gold: 20, souls: 10, xpGained: 20 } });
    expect(s.currencies.gold - before.gold).toBe(80);
    expect(s.currencies.souls - before.souls).toBe(40);
    expect(s.hero.xp).toBe(40);
  });
});
