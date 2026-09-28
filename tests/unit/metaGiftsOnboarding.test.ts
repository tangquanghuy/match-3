/**
 * 馈赠里程碑 + 新手十连（异界来客保底）+ 新手引导步骤推进。
 */
import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave } from '../../src/meta/state/save';
import { GIFTS, GIFT_TOTAL_GEMS, GIFT_STARTER_ID, GIFT_TROOP_COUNTS } from '../../src/meta/data/gifts';
import { claimAllGifts, claimGift, giftRows } from '../../src/meta/systems/gifts';
import { openGemChest, gemMultiCost, pickNoviceVisitor, NOVICE_SUMMON_COST } from '../../src/meta/systems/gacha';
import { GEM_CHEST } from '../../src/meta/data/economy';
import { COMMUNITY_KINGDOM } from '../../src/data/communityTroops';
import { getTroopById } from '../../src/data/troops';
import { SeededRNG } from '../../src/engine/rng';
import { MockGateway, memoryStorage } from '../../src/meta/gateway/mockGateway';

const tutorialSave = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], tutorial: true });

describe('馈赠里程碑', () => {
  it('总额一万多、阶梯够长、id 唯一，新手礼 1000，带传说/史诗/神话部队卡', () => {
    expect(GIFT_TOTAL_GEMS).toBeGreaterThan(12_000);
    expect(GIFT_TOTAL_GEMS).toBeLessThan(16_000);
    expect(GIFTS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(GIFTS.map((g) => g.id)).size).toBe(GIFTS.length);
    expect(GIFTS.find((g) => g.id === GIFT_STARTER_ID)?.gems).toBe(1000);
    expect(GIFT_TROOP_COUNTS[3]).toBeGreaterThan(0);
    expect(GIFT_TROOP_COUNTS[4]).toBeGreaterThan(0);
    expect(GIFT_TROOP_COUNTS[5]).toBeGreaterThan(0);
  });

  it('未达成拒领，达成可领一次；一键领取发宝石与对应稀有度的部队卡', () => {
    const s = tutorialSave();
    s.hero.level = 12;
    expect(claimGift(s, 'hero-15')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(claimGift(s, 'hero-5', 1)).toMatchObject({ ok: true });
    expect(claimGift(s, 'hero-5', 1)).toMatchObject({ ok: false });
    const expected = giftRows(s).filter((r) => r.status === 'ready');
    const before = s.currencies.gems;
    const all = claimAllGifts(s, 42);
    expect(all).toMatchObject({ ok: true });
    if (!all.ok) return;
    expect(all.ids.sort()).toEqual(expected.map((r) => r.gift.id).sort());
    expect(s.currencies.gems - before).toBe(expected.reduce((sum, r) => sum + r.gift.gems, 0));
    const troopGifts = expected.filter((r) => r.gift.troop);
    expect(all.cards.map((c) => c.rarityIdx)).toEqual(troopGifts.map((r) => r.gift.troop));
    for (const card of all.cards) expect(s.collection[String(card.troopId)]).toBeTruthy();
    expect(giftRows(s).filter((r) => r.status === 'ready')).toHaveLength(0);
  });

  it('旧档没有字段：引导视为已完成，活动累计从本周账本补齐', () => {
    const raw = JSON.parse(JSON.stringify(newSave({ now: 0 }))) as Record<string, unknown>;
    delete raw.onboarding; delete raw.gifts;
    const save = hydrateSave(raw);
    expect(save.onboarding.step).toBe('done');
    expect(save.onboarding.noviceSummonUsed).toBe(false);
    expect(save.gifts).toEqual({ claimed: [], eventWins: 0, towerBest: 0 });
  });
});

describe('新手十连', () => {
  it('首次十连 1000 宝石，第 10 张必为异界来客，之后恢复原价', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = tutorialSave();
      s.currencies.gems = NOVICE_SUMMON_COST;
      expect(gemMultiCost(s)).toBe(NOVICE_SUMMON_COST);
      const r = openGemChest(s, seed, 10);
      if (!r.ok) throw new Error(r.message);
      // 前 9 抽可能出材料（宝石箱 20%），最后一张恒为异界来客
      const items = Object.values({ ...r.materials.ingots, ...r.materials.traitstones }).reduce((a, n) => a + n!, 0);
      expect(r.cards.length + items).toBe(10);
      expect(r.spent.gems).toBe(NOVICE_SUMMON_COST);
      const lastCard = r.cards[r.cards.length - 1]!;
      const last = getTroopById(lastCard.troopId)!;
      expect(last.kingdom).toBe(COMMUNITY_KINGDOM);
      expect(last.rarityIdx).toBeGreaterThanOrEqual(3);
      expect(lastCard.noviceGuaranteed).toBe(true);
      expect(s.onboarding.noviceSummonUsed).toBe(true);
      expect(gemMultiCost(s)).toBe(GEM_CHEST.multiCost);
    }
  });

  it('保底档位权重 传说3 : 史诗2 : 神话1', () => {
    const rng = new SeededRNG(7);
    const counts: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
    const N = 6000;
    for (let i = 0; i < N; i++) counts[getTroopById(pickNoviceVisitor(rng))!.rarityIdx]!++;
    expect(counts[3]! / N).toBeCloseTo(3 / 6, 1);
    expect(counts[4]! / N).toBeCloseTo(2 / 6, 1);
    expect(counts[5]! / N).toBeCloseTo(1 / 6, 1);
  });
});

describe('新手引导', () => {
  it('全新档从试炼开始；领新手礼进入召唤，新手十连后完成', async () => {
    const gw = new MockGateway(memoryStorage());
    await gw.load();
    const { save } = await gw.resetToNewGame();
    expect(save.onboarding).toEqual({ step: 'battle', noviceSummonUsed: false });
    expect(save.teams[0]!.members[0]).toEqual({ kind: 'hero' }); // 新手队主角在第一位
    const plan = await gw.planTutorialBattle();
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.enemies).toHaveLength(2);
    expect(plan.plan.source).toMatchObject({ kind: 'quest', node: 1, tutorial: true });

    gw.current().onboarding.step = 'gift'; // 战斗结算推进由网关完成，这里跳过真实对战
    await gw.claimGift(GIFT_STARTER_ID);
    expect(gw.current().onboarding.step).toBe('summon');
    expect(gw.current().currencies.gems).toBeGreaterThanOrEqual(NOVICE_SUMMON_COST);
    const pull = await gw.openChest('gem', 10);
    expect(pull.result.ok).toBe(true);
    expect(gw.current().onboarding.step).toBe('done');
    expect((await gw.planTutorialBattle()).ok).toBe(false);
  });
});
