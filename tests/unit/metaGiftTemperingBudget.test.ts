import { describe, expect, it } from 'vitest';
import { GIFTS } from '../../src/meta/data/gifts';
import { EVENT_SHARED_GOALS } from '../../src/meta/data/events';
import { temperingCost, temperingMaxLevel } from '../../src/meta/systems/forge';
import { claimAllGifts, claimGift } from '../../src/meta/systems/gifts';
import { claimEventWeeklyGems, ensureEventWeek } from '../../src/meta/systems/events';
import { hydrateSave } from '../../src/meta/state/save';
import { newSave } from '../../src/meta/state/schema';
import { weekStartOf } from '../../src/meta/gateway/clock';

const ingotsToMax = (rarity: string) => Array.from({ length: temperingMaxLevel(rarity) }, (_, level) => temperingCost(rarity, level).ingots)
  .reduce((sum, cost) => sum + cost, 0);

/** Only the starter + hero ladder are counted; other gift paths and random drops are not required. */
describe('武器淬炼馈赠和每周远征预算', () => {
  it('前期足够精良与稀有升满，后 20 档循环给史诗逐级成本的 50%', () => {
    const early = GIFTS.filter(g => g.id === 'starter' || g.metric === 'heroLevel' && g.target <= 10);
    expect(early.reduce((sum, g) => sum + (g.mats?.ingots?.common ?? 0), 0)).toBeGreaterThanOrEqual(ingotsToMax('Uncommon'));
    expect(early.reduce((sum, g) => sum + (g.mats?.ingots?.rare ?? 0), 0)).toBeGreaterThanOrEqual(ingotsToMax('Rare'));
    const later = GIFTS.filter(g => g.metric === 'heroLevel' && g.target > 10);
    expect(later).toHaveLength(20);
    later.forEach((g, i) => {
      const cost = temperingCost('Epic', i % 8).ingots;
      const reward = g.mats?.ingots?.epic ?? 0;
      expect(reward).toBeGreaterThanOrEqual(Math.ceil(cost * 0.5));
      expect(reward).toBeLessThanOrEqual(Math.ceil(cost * 0.5));
    });
  });

  it('完整成长馈赠 + 一周 30 场活动胜利恰好够两把史诗 +8', () => {
    const heroGifts = GIFTS.filter(g => g.metric === 'heroLevel' || g.id === 'starter');
    const giftEpic = heroGifts.reduce((sum, g) => sum + (g.mats?.ingots?.epic ?? 0), 0);
    const weeklyEpic = EVENT_SHARED_GOALS.reduce((sum, g) => sum + g.epicIngots, 0);
    expect(giftEpic).toBe(46);
    expect(weeklyEpic).toBe(26);
    expect(giftEpic + weeklyEpic).toBeGreaterThanOrEqual(2 * ingotsToMax('Epic'));
  });

  it('单领、一键领以及读旧档补发均只入账一次', () => {
    const save = newSave({ now: 0 });
    save.hero.level = 12;
    const first = claimGift(save, 'hero-12');
    expect(first).toMatchObject({ ok: true, mats: { ingots: { epic: 1 } } });
    expect(claimGift(save, 'hero-12').ok).toBe(false);
    const all = claimAllGifts(save);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(save.materials.ingots.epic).toBe(1);
    expect(save.materials.ingots.rare).toBe(ingotsToMax('Rare'));
    expect(save.materials.ingots.common).toBe(ingotsToMax('Uncommon'));
    const old = newSave({ now: 0 });
    old.gifts.claimed = ['starter', 'hero-12'];
    old.gifts.materialBonusVersion = 0;
    const migrated = hydrateSave(JSON.parse(JSON.stringify(old)), 0);
    expect(migrated.materials.ingots.rare).toBe(4);
    expect(migrated.materials.ingots.epic).toBe(1);
    expect(hydrateSave(JSON.parse(JSON.stringify(migrated)), 0).materials.ingots.epic).toBe(1);
  });

  it('共享周胜场钢锭自动入账，每档每周只领一次，旧已领胜场补领材料不重发货币', () => {
    const save = newSave({ now: 0 });
    save.hero.level = 20;
    const week = ensureEventWeek(save, 0, 'invasion');
    week.wins = 30;
    const goldBefore = save.currencies.gold;
    const first = claimEventWeeklyGems(save, 0, 'invasion');
    expect(first.filter(line => line.mats?.ingots?.epic)).toHaveLength(4);
    expect(save.materials.ingots.epic).toBe(26);
    const goldAfter = save.currencies.gold;
    expect(goldAfter).toBeGreaterThan(goldBefore);
    expect(claimEventWeeklyGems(save, 0, 'invasion')).toHaveLength(0);
    expect(save.materials.ingots.epic).toBe(26);
    week.eventData.sharedClaim0 = 1;
    week.eventData.sharedCurrencyPaid0 = 1;
    delete week.eventData.sharedIngotsPaid0;
    expect(claimEventWeeklyGems(save, 0, 'invasion')).toMatchObject([{ mats: { ingots: { epic: 3 } } }]);
    expect(save.currencies.gold).toBe(goldAfter);
    expect(claimEventWeeklyGems(save, 0, 'invasion')).toHaveLength(0);
    const now = 10 * 24 * 60 * 60 * 1000;
    const old = newSave({ now });
    const currentWeek = ensureEventWeek(old, weekStartOf(now), 'invasion');
    currentWeek.eventData.sharedClaim0 = 1;
    currentWeek.eventData.sharedCurrencyPaid0 = 1;
    const migrated = hydrateSave(JSON.parse(JSON.stringify(old)), now);
    expect(migrated.materials.ingots.epic).toBe(3);
    expect(hydrateSave(JSON.parse(JSON.stringify(migrated)), now).materials.ingots.epic).toBe(3);
    const nextWeek = 7 * 24 * 60 * 60 * 1000;
    ensureEventWeek(save, nextWeek, 'invasion').wins = 6;
    claimEventWeeklyGems(save, nextWeek, 'invasion');
    expect(save.materials.ingots.epic).toBe(32);
  });
});
