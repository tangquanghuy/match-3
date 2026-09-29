import { describe, expect, it } from 'vitest';
import {
  battleIncomeView,
  levelUpSequence,
  levelUpStats,
  pendingMasteryOffer,
  preBattleXp,
  RESULT_RARITY_NAMES,
  resultSubtitle,
  resultSummaryArt,
  troopRewardView,
} from '../../src/meta/screens/resultScreen';
import { heroStatsAt, heroXpToNext } from '../../src/meta/data/classes';
import { addHeroXp } from '../../src/meta/systems/hero';
import { pickManaMastery } from '../../src/meta/systems/manaMastery';
import { newSave } from '../../src/meta/state/schema';

describe('结算屏奖励呈现', () => {
  it('使用六档部队稀有度口径并保留官方立绘入口', () => {
    expect(RESULT_RARITY_NAMES).toEqual(['普通', '精良', '稀有', '传说', '史诗', '神话']);
    const reward = troopRewardView({ troopId: 6169, note: '加尔凡尼亚任务 4/8 首通' });
    expect(reward.name).toBe('德拉古力斯');
    expect(reward.rarityIdx).toBe(5);
    expect(reward.rarityName).toBe('神话');
    expect(reward.art).toContain('/static/portraits/');
    expect(reward).not.toHaveProperty('attack');
    expect(reward).not.toHaveProperty('armor');
    expect(reward).not.toHaveProperty('health');
  });

  it('未知奖励不会让结算屏崩溃，并使用中性占位', () => {
    const reward = troopRewardView({ troopId: -1, note: '测试' });
    expect(reward.name).toBe('未知部队 #-1');
    expect(reward.rarityName).toBe('普通');
    expect(reward.art).toContain('/static/troops/');
  });

  it('王国结算使用主题图，非王国来源使用世界图', () => {
    expect(resultSummaryArt('破碎尖塔')).toBe('/static/kingdoms/spire.webp');
    expect(resultSummaryArt('竞技场')).toBe('/static/map/world-map.webp');
  });
});


describe('本场收益与额外奖励隔离', () => {
  const base = {
    victory: true, xpGained: 100, heroLevelsGained: 1,
    classLevelUp: null, classUnlocked: null, questProgress: null,
    troopRewards: [], firstWinClaimed: true,
  };
  it('只累计击杀、胜负基础和战斗收集，不混入首胜首通或活动奖励', () => {
    expect(battleIncomeView({ ...base, lines: [
      { key: 'kills', label: '', deltas: { gold: 40, souls: 8 } },
      { key: 'victory', label: '', deltas: { gold: 60, souls: 30 } },
      { key: 'battle-collect', label: '', deltas: { gold: 3, souls: 2 } },
      { key: 'first-win', label: '', deltas: { gems: 50 } },
      { key: 'kingdom-first-clear', label: '', deltas: { gems: 100 } },
      { key: 'quest', label: '', deltas: { gold: 1000, goldKeys: 1 } },
      { key: 'event-milestone', label: '', deltas: { gems: 500, souls: 500 } },
      { key: 'explore-drop', label: '', deltas: { gold: 999 } },
    ] })).toEqual({ victory: true, xp: 100, levelsGained: 1, gold: 103, souls: 40, gems: 0 });
  });
  it('宝石仅展示本场真实收集；重复读取不修改结算明细', () => {
    const detail = { ...base, lines: [
      { key: 'battle-collect' as const, label: '', deltas: { gems: 2 } },
      { key: 'first-win' as const, label: '', deltas: { gems: 50 } },
    ] };
    const before = structuredClone(detail);
    expect(battleIncomeView(detail).gems).toBe(2);
    expect(battleIncomeView(detail).gems).toBe(2);
    expect(detail).toEqual(before);
  });
  it('战败照常呈现本场经验和保底', () => {
    expect(battleIncomeView({ ...base, victory: false, xpGained: 20, heroLevelsGained: 0,
      lines: [{ key: 'defeat', label: '', deltas: { gold: 20, souls: 10 } }],
    })).toEqual({ victory: false, xp: 20, levelsGained: 0, gold: 20, souls: 10, gems: 0 });
  });
  it('竞技场整轮大奖不计入本场', () => {
    const detail = {
      kind: 'arena', battle: {}, settled: {
        victory: true, runOver: true,
        battleRewards: { gold: 60, souls: 30, xpGained: 100, heroLevelsGained: 0 },
        collected: { gold: 4, souls: 2, gems: 1, maps: 0 },
        rewards: { gold: 4000, souls: 750, gems: 50 },
      },
    } as unknown as import('../../src/meta/shell/screen').PvpSettlementView;
    expect(battleIncomeView(detail)).toEqual({ victory: true, xp: 100, levelsGained: 0, gold: 64, souls: 32, gems: 1 });
  });
  it('入侵只带本场悬赏、基础与收集，不带荣耀及赛季积分', () => {
    const detail = {
      kind: 'invasion', battle: {}, frenzy: false, settled: {
        victory: true, gold: 80, glory: 999, vpDelta: 100,
        battleRewards: { gold: 60, souls: 30, xpGained: 100, heroLevelsGained: 0 },
        collected: { gold: 4, souls: 2, gems: 0, maps: 0 },
      },
    } as unknown as import('../../src/meta/shell/screen').PvpSettlementView;
    expect(battleIncomeView(detail)).toEqual({ victory: true, xp: 100, levelsGained: 0, gold: 144, souls: 32, gems: 0 });
  });
});

describe('结算副题（任务 · 王国 · 关卡 · 进度）', () => {
  const pve = {
    victory: true, lines: [], xpGained: 0, heroLevelsGained: 0, classLevelUp: null, classUnlocked: null,
    questProgress: { from: 3, to: 4 }, troopRewards: [], firstWinClaimed: false,
  };
  it('任务关带进度；未推进时用王国当前进度', () => {
    expect(resultSubtitle(pve, { kingdom: '破碎尖塔', sourceLabel: 'NORMAL 4' })).toBe('任务 · 破碎尖塔 · 第 4 关 · 进度：4/8');
    expect(resultSubtitle({ ...pve, victory: false, questProgress: null }, { kingdom: '破碎尖塔', sourceLabel: 'NORMAL 4' }, 3))
      .toBe('任务 · 破碎尖塔 · 第 4 关 · 进度：3/8');
  });
  it('探索关与活动战使用中文口径', () => {
    expect(resultSubtitle(pve, { kingdom: '白雪之城', sourceLabel: 'HARD 2' })).toBe('探索 · 白雪之城 · 困难 2');
    expect(resultSubtitle(pve, { kingdom: '白雪之城', sourceLabel: 'VERY HARD 1' })).toBe('探索 · 白雪之城 · 非常困难 1');
    expect(resultSubtitle(pve, { kingdom: '白雪之城', sourceLabel: '每周活动' })).toBe('每周活动 · 白雪之城');
  });
  it('竞技场显示本届战绩，入侵显示对手来源', () => {
    const arena = { kind: 'arena', battle: {}, settled: { victory: true, wins: 3, losses: 1, runOver: false } } as unknown as import('../../src/meta/shell/screen').PvpSettlementView;
    expect(resultSubtitle(arena, { kingdom: '竞技场', sourceLabel: '竞技场' })).toBe('竞技场 · 战绩 3 胜 1 负');
    const invasion = { kind: 'invasion', battle: {}, frenzy: false, settled: { victory: true } } as unknown as import('../../src/meta/shell/screen').PvpSettlementView;
    expect(resultSubtitle(invasion, { kingdom: '入侵战', sourceLabel: '入侵 · 影刃' })).toBe('入侵 · 影刃');
  });
});

describe('经验条与升级页数据', () => {
  it('战前经验可由战后状态倒推（含连升多级）', () => {
    const save = newSave({ now: 1 });
    save.hero.level = 4;
    save.hero.xp = 30;
    const gained = heroXpToNext(4) - 30 + heroXpToNext(5) + 55;
    const { levelsGained } = addHeroXp(save, gained);
    expect(levelsGained).toBe(2);
    expect(preBattleXp(save.hero.level, save.hero.xp, gained, levelsGained)).toEqual({ level: 4, xp: 30 });
  });
  it('异常数据夹到合法区间，不出现负经验', () => {
    expect(preBattleXp(1, 20, 100, 0)).toEqual({ level: 1, xp: 0 });
  });
  it('逐级呈现本场升级的每一级', () => {
    expect(levelUpSequence(7, 2)).toEqual([6, 7]);
    expect(levelUpSequence(7, 0)).toEqual([]);
    expect(levelUpSequence(2, 5)).toEqual([2]);
  });
  it('四维 = 等级曲线 + 淬炼加成；增量只来自等级曲线', () => {
    const stats = levelUpStats(7, { armor: 2 });
    const now = heroStatsAt(7);
    const before = heroStatsAt(6);
    expect(stats.map(s => s.key)).toEqual(['attack', 'health', 'armor', 'magic']);
    expect(stats.find(s => s.key === 'armor')).toMatchObject({ value: now.armor + 2, gain: now.armor - before.armor });
    expect(stats.find(s => s.key === 'health')).toMatchObject({ value: now.health, gain: now.health - before.health });
    expect(stats.some(s => s.gain > 0)).toBe(true);
  });
  it('升级页的二选一就是存档队首的精通点，选择后队列前移', () => {
    const save = newSave({ now: 1 });
    save.hero.level = 1;
    save.hero.xp = 0;
    save.hero.masteryOffers = [];
    addHeroXp(save, heroXpToNext(1) + heroXpToNext(2));
    expect(save.hero.masteryOffers).toHaveLength(2);
    const first = pendingMasteryOffer(save)!;
    expect(first).toEqual(save.hero.masteryOffers[0]);
    const result = pickManaMastery(save, first[1]);
    expect(result).toMatchObject({ ok: true, color: first[1], value: 1 });
    expect(pendingMasteryOffer(save)).toEqual(save.hero.masteryOffers[0]);
    pickManaMastery(save, save.hero.masteryOffers[0]![0]);
    expect(pendingMasteryOffer(save)).toBeNull();
  });
});
