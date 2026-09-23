import { describe, expect, it } from 'vitest';
import { RESULT_RARITY_NAMES, resultSummaryArt, troopRewardView } from '../../src/meta/screens/resultScreen';

describe('结算屏奖励呈现', () => {
  it('使用六档部队稀有度口径并保留官方立绘入口', () => {
    expect(RESULT_RARITY_NAMES).toEqual(['普通', '精良', '稀有', '传说', '史诗', '神话']);
    const reward = troopRewardView({ troopId: 6169, note: '加尔凡尼亚任务 4/8 首通' });
    expect(reward.name).toBe('德拉古力斯');
    expect(reward.rarityIdx).toBe(5);
    expect(reward.rarityName).toBe('神话');
    expect(reward.art).toContain('/meta/assets/portraits/');
    expect(reward).not.toHaveProperty('attack');
    expect(reward).not.toHaveProperty('armor');
    expect(reward).not.toHaveProperty('health');
  });

  it('未知奖励不会让结算屏崩溃，并使用中性占位', () => {
    const reward = troopRewardView({ troopId: -1, note: '测试' });
    expect(reward.name).toBe('未知部队 #-1');
    expect(reward.rarityName).toBe('普通');
    expect(reward.art).toContain('/meta/assets/troops/');
  });

  it('王国结算使用主题图，非王国来源使用世界图', () => {
    expect(resultSummaryArt('破碎尖塔')).toBe('/meta/assets/kingdom-spire.png');
    expect(resultSummaryArt('竞技场')).toBe('/meta/assets/world-map-mosaic-v2.webp');
  });
});
