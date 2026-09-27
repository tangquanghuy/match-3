import { describe, it, expect } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave, SaveStore } from '../../src/meta/state/save';
import { MockGateway } from '../../src/meta/gateway/mockGateway';
import { applySettlement } from '../../src/meta/systems/settlement';
import { planQuestEncounter, planExploreEncounter, type EncounterPlan } from '../../src/meta/systems/encounter';
import { KINGDOM_FIRST_CLEAR_GEMS, DAILY_FIRST_WIN_GEMS } from '../../src/meta/data/economy';
import { KINGDOM_ORDER, QUESTS_PER_KINGDOM, EXPLORE_MAX_TIER } from '../../src/meta/data/kingdoms';
import { remainingKingdomFirstClears } from '../../src/meta/systems/kingdomFirstClear';
import { questRewardsHtml } from '../../src/meta/screens/questRewards';
import type { BattleResult } from '../../src/session/contract';

const kingdom = KINGDOM_ORDER[0]!;
const win: BattleResult = { schemaVersion: 1, battleId: 'first-clear-test', requestId: 'r', rulesetVersion: '1',
  seed: 1, winner: 'player', turns: 1, combatants: [], defeatedExternalIds: [], summonedCount: 0,
  actionLogDigest: '', eventSummary: [] };
const ctx = (plan: EncounterPlan, todayStart = 1000) => ({ plan, todayStart, enemyByExternalId: new Map() });
const reward = (detail: ReturnType<typeof applySettlement>) => detail.lines.find(l => l.key === 'kingdom-first-clear');
const saveWithGems = () => newSave({ now: 0, currencies: { gems: 0 } });

describe('王国逐关独立首通宝石', () => {
  it('普通八关逐关发放，越关、重复与失败不发，首胜可叠加', () => {
    const save = saveWithGems();
    expect(reward(applySettlement(save, win, ctx(planQuestEncounter(kingdom, 3, 1))))).toBeUndefined();
    for (let node = 1; node <= QUESTS_PER_KINGDOM; node++) {
      const context = ctx(planQuestEncounter(kingdom, node, 1));
      expect(reward(applySettlement(save, { ...win, winner: 'enemy' }, context))).toBeUndefined();
      expect(reward(applySettlement(save, win, context))?.deltas.gems).toBe(KINGDOM_FIRST_CLEAR_GEMS.normal);
      expect(reward(applySettlement(save, win, context))).toBeUndefined();
    }
    expect(save.currencies.gems).toBe(QUESTS_PER_KINGDOM * KINGDOM_FIRST_CLEAR_GEMS.normal + DAILY_FIRST_WIN_GEMS);
  });
  it('困难和非常困难六关跳打独立记录，选中档位不代表通关，隔天也不重复领', () => {
    const save = saveWithGems();
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: 6, lastTributeAt: 0 };
    for (const tier of [6, 3, 1, 4, 2, 5]) {
      const context = ctx(planExploreEncounter(kingdom, tier, 1));
      const expected = tier <= 3 ? KINGDOM_FIRST_CLEAR_GEMS.hard : KINGDOM_FIRST_CLEAR_GEMS.veryHard;
      expect(reward(applySettlement(save, { ...win, winner: 'enemy' }, context))).toBeUndefined();
      expect(save.kingdoms[kingdom]!.clearedExploreTiers ?? []).not.toContain(tier);
      expect(reward(applySettlement(save, win, context))?.deltas.gems).toBe(expected);
      expect(reward(applySettlement(save, win, { ...context, todayStart: 2000 }))).toBeUndefined();
    }
    expect(save.kingdoms[kingdom]!.clearedExploreTiers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(save.currencies.gems).toBe(3 * 200 + 3 * 300 + 2 * DAILY_FIRST_WIN_GEMS);
  });
  it('不同王国相同关号独立；活动胜利不借用王国首通奖励', () => {
    const save = saveWithGems();
    for (const k of KINGDOM_ORDER.slice(0, 2)) {
      expect(reward(applySettlement(save, win, ctx(planExploreEncounter(k, 1, 1))))?.deltas.gems).toBe(200);
    }
    const event: EncounterPlan = { ...planExploreEncounter(kingdom, 2, 1), source: { kind: 'event', weekStart: 1000, typeId: 'worldEvent' } };
    expect(reward(applySettlement(save, win, ctx(event)))).toBeUndefined();
    expect(save.kingdoms[kingdom]!.clearedExploreTiers).toEqual([1]);
  });
  it('存档清理重复/非法档位，旧档不会用exploreTier伪造通关，保留普通历史', () => {
    const save = saveWithGems();
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: 6, lastTributeAt: 0 };
    let hydrated = hydrateSave(JSON.parse(JSON.stringify(save)));
    expect(hydrated.kingdoms[kingdom]!.clearedExploreTiers).toEqual([]);
    expect(hydrated.kingdoms[kingdom]!.questsDone).toBe(8);
    const raw = JSON.parse(JSON.stringify(save));
    raw.kingdoms[kingdom].clearedExploreTiers = [6, 1, 1, 0, -1, 7, 2.5, '3', null];
    hydrated = hydrateSave(raw);
    expect(hydrated.kingdoms[kingdom]!.clearedExploreTiers).toEqual([1, EXPLORE_MAX_TIER]);
    expect(reward(applySettlement(hydrated, win, ctx(planQuestEncounter(kingdom, 8, 1))))).toBeUndefined();
  });
  it('gateway结算落盘后重新加载，同关不再发首通', async () => {
    const storageData = new Map<string, string>();
    const storage = { getItem: (k: string) => storageData.get(k) ?? null, setItem: (k: string, v: string) => { storageData.set(k, v); } };
    new SaveStore(storage).persist(saveWithGems());
    const gateway = new MockGateway(storage);
    await gateway.load();
    const context = ctx(planExploreEncounter(kingdom, 4, 1));
    expect(reward((await gateway.applyBattleSettlement(win, context)).result)?.deltas.gems).toBe(300);
    const reloaded = new MockGateway(storage);
    const { save } = await reloaded.load();
    expect(save.kingdoms[kingdom]!.clearedExploreTiers).toEqual([4]);
    const before = save.currencies.gems;
    expect(reward((await reloaded.applyBattleSettlement(win, context)).result)).toBeUndefined();
    expect(reloaded.current().currencies.gems).toBe(before);
  });
  it('模型剩余数量从实际普通和高难度进度推导，不受选中档位影响', () => {
    const save = saveWithGems();
    const before = remainingKingdomFirstClears(save);
    save.kingdoms[kingdom] = { level: 1, questsDone: 3, exploreTier: 6, lastTributeAt: 0, clearedExploreTiers: [2, 4] };
    expect(remainingKingdomFirstClears(save)).toEqual({ normal: before.normal - 3, hard: before.hard - 1, veryHard: before.veryHard - 1 });
  });
  it('奖励预览使用结算同源金额和实际首通状态，三个难度逐关呈现', () => {
    const entry = { level: 1, questsDone: 1, exploreTier: 6, lastTributeAt: 0, clearedExploreTiers: [2, 4] };
    expect(questRewardsHtml(kingdom, 'normal', 1, entry)).toContain('首通已完成');
    expect(questRewardsHtml(kingdom, 'normal', 2, entry)).toContain('首通 +100 宝石');
    expect(questRewardsHtml(kingdom, 'hard', 2, entry)).toContain('首通已完成');
    expect(questRewardsHtml(kingdom, 'hard', 3, entry)).toContain('首通 +200 宝石');
    expect(questRewardsHtml(kingdom, 'veryHard', 1, entry)).toContain('首通已完成');
    expect(questRewardsHtml(kingdom, 'veryHard', 3, entry)).toContain('首通 +300 宝石');
  });
});
