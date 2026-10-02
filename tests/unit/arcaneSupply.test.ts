import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { TROOP_PROGRESSION } from '../../src/data/leveling';
import { ARCANE_STONE_KEYS } from '../../src/meta/data/materials';
import { GEM_CHEST_BASE, GEM_CHEST_EXTRA, GEM_CHEST_WEIGHTS, GLORY_CHEST_LOOT, CHEST_LOOT_BASE, traitUnlockCost } from '../../src/meta/data/economy';
import { EVENT_ARCANE_STONES, EVENT_MILESTONES, EVENT_SHOP, EVENT_TYPES, EVENT_WEEKLY_GEM_CAP, EVENT_WEEKLY_RULES, WEEK_MS } from '../../src/meta/data/events';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { openGemChest, openGloryChest } from '../../src/meta/systems/gacha';
import { unlockTrait } from '../../src/meta/systems/troopProgress';
import { buyEventGoods, ensureEventWeek, eventAction, eventModeState, eventShopOf } from '../../src/meta/systems/events';
import { eventShopPeriodOf } from '../../src/meta/systems/eventShopClock';
import { eventBattle, settleEvent } from './helpers/eventDriver';

const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
const fresh = () => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gems: 1500, glory: 1000 } });
  s.hero.level = 20;
  return s;
};
afterEach(() => vi.restoreAllMocks());

describe('秘法石真实需求与供给', () => {
  it('导入配方实际需要秘法石，食人魔和神话样本需求保持准确', () => {
    const rows = Object.values(TROOP_PROGRESSION);
    expect(rows).toHaveLength(1798);
    expect(rows.filter(r => r.traits.some(t => Object.keys(t).some(k => k.startsWith('arcane:'))))).toHaveLength(1794);
    expect(traitUnlockCost(3, 'blue', 6000).stones['arcane:blue:blue']).toBe(1);
    for (const key of ['arcane:blue:green', 'arcane:blue:red']) {
      expect([1, 2, 3].reduce((n, slot) => n + (traitUnlockCost(slot, 'blue', 6169).stones[key] ?? 0), 0)).toBe(21);
    }
  });

  it.each(['gem', 'glory'] as const)('%s 宝箱每一种秘法石都能真实入账，数量与概率表一致', kind => {
    const rows = kind === 'gem' ? GEM_CHEST_EXTRA : GLORY_CHEST_LOOT;
    const index = rows.findIndex(r => r.loot.type === 'stone' && r.loot.tier === 'arcane');
    const row = rows[index]!;
    const total = kind === 'gem' ? rows.reduce((n, r) => n + r.weight, 0) : CHEST_LOOT_BASE;
    const pick = (rows.slice(0, index).reduce((n, r) => n + r.weight, 0) + row.weight / 2) / total;
    expect(row.weight / CHEST_LOOT_BASE).toBe(kind === 'gem' ? .01 : .007);
    for (const [i, key] of ARCANE_STONE_KEYS.entries()) {
      const s = fresh();
      const spy = vi.spyOn(SeededRNG.prototype, 'next');
      if (kind === 'gem') {
        const troopWeight = GEM_CHEST_WEIGHTS.reduce((a, b) => a + b, 0);
        spy.mockReturnValueOnce((troopWeight + GEM_CHEST_BASE) / 2 / GEM_CHEST_BASE);
      }
      spy.mockReturnValueOnce(pick).mockReturnValueOnce((i + .5) / ARCANE_STONE_KEYS.length);
      const result = kind === 'gem' ? openGemChest(s, 42) : openGloryChest(s, 42);
      expect(result.ok).toBe(true);
      expect(s.materials.traitstones[key], key).toBe(1);
      spy.mockRestore();
    }
  });

  it('活动兑换覆盖全部21种，普通积分不冒充高难挑战，宝石与印记预算不变', () => {
    expect(Object.values(EVENT_ARCANE_STONES).flat().sort()).toEqual([...ARCANE_STONE_KEYS].sort());
    for (const { id } of EVENT_TYPES) {
      const keys = EVENT_ARCANE_STONES[id];
      const goods = EVENT_SHOP[id].find(g => g.id === `${id}_arcane`)!;
      expect(goods).toMatchObject({ cost: 48, stock: 2 });
      expect(goods.mats?.traitstones).toEqual(Object.fromEntries(keys.map(k => [k, 2])));
      EVENT_MILESTONES[id].forEach((row) => {
        for (const key of keys) expect(row.mats?.traitstones?.[key] ?? 0).toBe(0);
      });
    }
    expect(EVENT_WEEKLY_GEM_CAP).toBe(10960);
    expect(EVENT_WEEKLY_RULES).toMatchObject({ revision: 3, tokenCap: 360 });
  });

  it.each(EVENT_TYPES.map(t => t.id))('%s 兑换入库、两天补货、余额不足不扣除', type => {
    const s = fresh();
    const week = ensureEventWeek(s, WEEK, type);
    const goodsId = `${type}_arcane`;
    week.tokens = 47;
    const before = JSON.stringify(s.materials);
    expect(buyEventGoods(s, goodsId, WEEK, type).ok).toBe(false);
    expect(week.tokens).toBe(47);
    expect(JSON.stringify(s.materials)).toBe(before);
    week.tokens = 360;
    for (let i = 0; i < 2; i++) expect(buyEventGoods(s, goodsId, WEEK, type).ok).toBe(true);
    for (const key of EVENT_ARCANE_STONES[type]) expect(s.materials.traitstones[key]).toBe(4);
    expect(week.tokens).toBe(264);
    expect(buyEventGoods(s, goodsId, WEEK, type)).toMatchObject({ ok: false, code: 'SOLD_OUT' });
    const next = eventShopPeriodOf(WEEK).end;
    expect(eventShopOf(s, WEEK, type, next).rows.find(r => r.goods.id === goodsId)?.stockLeft).toBe(2);
  });

  it.each(EVENT_TYPES.map(t => t.id))('%s 低难战斗即使刷满积分也不发高难秘法奖励', type => {
    const s = fresh();
    // 先走各玩法自己的有效出战路径，再预置最后一档进度。
    const out = eventBattle(s, type, WEEK);
    const week = ensureEventWeek(s, WEEK, type);
    week.points = 1200;
    if (type === 'worldEvent') eventModeState(s, WEEK, type).supplies = 84;
    settleEvent(s, out, undefined, WEEK);
    for (const key of EVENT_ARCANE_STONES[type]) expect(s.materials.traitstones[key] ?? 0).toBe(0);
    expect(week.claimed).toEqual([0, 1, 2, 3, 4, 5]);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)));
    settleEvent(loaded, out, undefined, WEEK);
    for (const key of EVENT_ARCANE_STONES[type]) expect(loaded.materials.traitstones[key] ?? 0).toBe(0);
  });

  it('世界事件掷骰达标立即收到基础材料奖励，不必再打战斗', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'worldEvent');
    const week = ensureEventWeek(s, WEEK, 'worldEvent');
    week.claimed = [0, 1, 2];
    state.supplies = 41;
    state.pos = 0;
    state.lucky = 2;
    state.board[1] = 'supply';
    const result = eventAction(s, WEEK, 'worldEvent', 'lucky:1', 42);
    expect(result.ok).toBe(true);
    expect(state.supplies).toBe(44);
    expect(s.materials.traitstones['minor:yellow']).toBe(16);
    expect(week.claimed).toContain(3);
    if (result.ok) expect(result.lines?.some(line => line.mats?.traitstones?.['minor:yellow'] === 16)).toBe(true);
    state.board[2] = 'supply';
    expect(eventAction(s, WEEK, 'worldEvent', 'lucky:1', 43).ok).toBe(true);
    expect(s.materials.traitstones['minor:yellow']).toBe(16);
  });

  it('已领过的旧里程碑不追补；下一周重置领取账本', () => {
    const s = fresh();
    const out = eventBattle(s, 'invasion', WEEK);
    const week = ensureEventWeek(s, WEEK, 'invasion');
    week.points = 1200; week.claimed = [0, 1, 2, 3, 4, 5];
    settleEvent(s, out, undefined, WEEK);
    for (const key of EVENT_ARCANE_STONES.invasion) expect(s.materials.traitstones[key] ?? 0).toBe(0);
    const next = WEEK + WEEK_MS;
    const nextOut = eventBattle(s, 'invasion', next);
    ensureEventWeek(s, next, 'invasion').points = 1200;
    settleEvent(s, nextOut, undefined, next);
    expect(ensureEventWeek(s, next, 'invasion').claimed).toHaveLength(6);
    expect(s.materials.traitstones['minor:red']).toBe(16);
  });

  it('兑换得到的秘法石用于真实解锁并按配方扣除', () => {
    const s = fresh();
    s.collection['6000']!.traits = [true, true, false];
    const cost = traitUnlockCost(3, 'blue', 6000).stones;
    for (const [key, n] of Object.entries(cost)) if (!key.startsWith('arcane:')) s.materials.traitstones[key] = n;
    const before = structuredClone(s.materials);
    expect(unlockTrait(s, 6000, 3).ok).toBe(false);
    expect(s.materials).toEqual(before);
    ensureEventWeek(s, WEEK, 'invasion').tokens = 48;
    expect(buyEventGoods(s, 'invasion_arcane', WEEK, 'invasion').ok).toBe(true);
    expect(unlockTrait(s, 6000, 3).ok).toBe(true);
    expect(s.materials.traitstones['arcane:blue:blue']).toBe(1);
    expect(s.materials.traitstones['minor:blue']).toBe(0);
    expect(s.materials.traitstones['major:blue']).toBe(0);
    expect(s.collection['6000']!.traits).toEqual([true, true, true]);
  });
});
