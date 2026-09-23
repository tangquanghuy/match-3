import { describe, expect, it } from 'vitest';
import { EVENT_MILESTONES } from '../../src/meta/data/events';
import { eventRailStatus } from '../../src/meta/screens/mapScreen';
import { ensureEventWeek, eventShopOf } from '../../src/meta/systems/events';
import { newSave } from '../../src/meta/state/schema';

const WEEK = 1_700_000_000_000;

describe('地图活动中心聚合角标', () => {
  it('没有达标奖励且代币不足时不制造“六活动进行中”提醒', () => {
    const save = newSave({ now: WEEK, starterTroopIds: [6000, 6097, 6457] });

    expect(eventRailStatus(save, WEEK)).toEqual({
      claimableActivities: 0,
      affordableShops: 0,
      actionableActivities: 0,
    });
  });

  it('按活动计数未领取里程碑，并与同活动可兑换状态去重', () => {
    const save = newSave({ now: WEEK, starterTroopIds: [6000, 6097, 6457] });
    const invasion = ensureEventWeek(save, WEEK, 'invasion');
    invasion.points = EVENT_MILESTONES.invasion[0]!.points;
    invasion.tokens = Math.min(...eventShopOf(save, WEEK, 'invasion').rows.map((row) => row.goods.cost));

    expect(eventRailStatus(save, WEEK)).toEqual({
      claimableActivities: 1,
      affordableShops: 1,
      actionableActivities: 1,
    });
  });

  it('只把代币够买且仍有库存的商店计入，并跨活动聚合', () => {
    const save = newSave({ now: WEEK, starterTroopIds: [6000, 6097, 6457] });
    const invasion = ensureEventWeek(save, WEEK, 'invasion');
    invasion.points = EVENT_MILESTONES.invasion[0]!.points;
    const raidShop = eventShopOf(save, WEEK, 'raidBoss');
    raidShop.week.tokens = Math.min(...raidShop.rows.map((row) => row.goods.cost));

    expect(eventRailStatus(save, WEEK)).toEqual({
      claimableActivities: 1,
      affordableShops: 1,
      actionableActivities: 2,
    });
  });
});
