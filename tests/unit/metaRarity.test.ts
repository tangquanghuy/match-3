import { describe, expect, it } from 'vitest';
import {
  RARITY_CLASS_NAMES,
  RARITY_COLORS,
  RARITY_NAMES,
  RARITY_ORDER,
  RARITY_ZH,
  rarityClassByIndex,
  rarityMetaByKey,
  rarityNameByIndex,
  rarityStyle,
} from '../../src/meta/data/rarity';

describe('玩家稀有度口径', () => {
  it('按 GOW 六档原始键映射统一中文名', () => {
    expect(RARITY_ORDER).toEqual(['Common', 'Uncommon', 'Rare', 'UltraRare', 'Epic', 'Legendary']);
    expect(RARITY_NAMES).toEqual(['普通', '精良', '稀有', '传说', '史诗', '神话']);
    expect(RARITY_CLASS_NAMES).toEqual(['common', 'fine', 'rare', 'legend', 'epic', 'mythic']);
    expect(RARITY_ZH).toMatchObject({
      Common: '普通',
      Uncommon: '精良',
      Rare: '稀有',
      UltraRare: '传说',
      Epic: '史诗',
      Legendary: '神话',
    });
  });

  it('六档边框色依次为中性、绿、紫、亮黄、暗橙、钻石蓝', () => {
    expect(RARITY_COLORS).toEqual([
      '#aab2ad',
      '#4caf6a',
      '#9a4fd4',
      '#ffe24a',
      '#c56b2d',
      '#56d8ff',
    ]);
    expect(rarityStyle('UltraRare')).toContain('--rarity-line:#ffe24a');
    expect(rarityStyle('Legendary')).toContain('--rarity-line:#56d8ff');
  });

  it('武器 Mythic 沿用神话视觉，Doomed 保留专属品类', () => {
    expect(rarityMetaByKey('Mythic')).toMatchObject({ label: '神话', className: 'mythic', color: '#56d8ff' });
    expect(rarityMetaByKey('Doomed')).toMatchObject({ label: '末日', className: 'doomed' });
  });

  it('数值索引在页面边界外安全收敛到首尾档', () => {
    expect(rarityNameByIndex(-3)).toBe('普通');
    expect(rarityNameByIndex(99)).toBe('神话');
    expect(rarityClassByIndex(2)).toBe('r-2');
    expect(rarityClassByIndex(Number.NaN)).toBe('r-0');
  });
});
