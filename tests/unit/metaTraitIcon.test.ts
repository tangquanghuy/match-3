/**
 * 特质图标覆盖单测：锁定「任何特质都有图标」且「语义看效果不看触发条件」、
 * 「同一部队多个特质不重图」。扫 troops.json 全量特质（含引擎未实现 code）。
 */
import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { traitGlyph, traitGlyphsFor } from '../../src/meta/shell/traitIcon';
import { TRAIT_FAMILY_ICONS } from '../../src/meta/shell/traitIconsGameIcons';
import { traitBadgeSvg, traitCardGlyphs } from '../../src/render/traitBadges';

/** 收集 troops.json 全量去重特质 */
function allTraits(): Array<{ code: string; name: string; description: string }> {
  const byCode = new Map<string, { code: string; name: string; description: string }>();
  for (const troop of TROOPS) {
    for (const trait of troop.traits ?? []) {
      if (trait?.code && !byCode.has(trait.code)) {
        byCode.set(trait.code, { code: trait.code, name: trait.name, description: trait.description });
      }
    }
  }
  return [...byCode.values()];
}

const labelOf = (glyph: string): string => glyph.match(/aria-label="([^"]+)"/)![1]!;

describe('traitGlyph 特质图标全覆盖', () => {
  const traits = allTraits();

  it('全量特质（含未实现）都产出合法内联 SVG', () => {
    expect(traits.length).toBeGreaterThanOrEqual(700); // 数据规模护栏
    for (const { code, name, description } of traits) {
      const glyph = traitGlyph(code, name, description);
      expect(glyph, `${code} (${name}) 无图标`).toContain('<svg');
      expect(glyph, `${code} (${name}) SVG 未闭合`).toContain('</svg>');
      expect(glyph, `${code} (${name}) 缺少 aria-label`).toContain('aria-label=');
      expect(glyph, `${code} (${name}) 应使用 512 viewBox 图源`).toContain('viewBox="0 0 512 512"');
    }
  });

  it('语义按效果归类而非触发条件（庞然/食人魔之怒/狂暴/披甲 回归用例）', () => {
    // 庞然：配对宝石是触发条件，效果是获得生命 → 生命族，不是宝石族
    expect(labelOf(traitGlyph('big', '庞然', '在配对 4 或 5 颗宝石时，获得 1 点生命值。'))).toBe('生命');
    // 食人魔之怒：效果是获得攻击力 → 攻击族，不是宝石族
    expect(labelOf(traitGlyph('redrage', '食人魔之怒', '在配对红色宝石时获得 1 点攻击力。'))).toBe('攻击');
    // 狂暴：受到攻击时的成长 → 反伤族（报复性成长语义）
    expect(labelOf(traitGlyph('frenzy', '狂暴', '在受到攻击时获得 1 点攻击力。'))).toBe('反伤');
    // 披甲：降低来自骷髅头的伤害 → 减伤族，不是骷髅族
    expect(labelOf(traitGlyph('armored', '披甲', '降低来自骷髅头的伤害 25%。'))).toBe('减伤');
    // 造成伤害类仍归攻击；状态施加归各自族
    expect(labelOf(traitGlyph('x', '嗜骨', '对骷髅造成额外伤害。'))).toBe('攻击');
    expect(labelOf(traitGlyph('x', '剧毒牙', '攻击使敌人中毒，每回合受到伤害。'))).toBe('剧毒');
    expect(labelOf(traitGlyph('x', '聚灵', '战斗开始时获得额外法力。'))).toBe('法力');
  });

  it('同一部队的多个特质不重复图标', () => {
    const same = { name: '同质', description: '攻击使敌人中毒，每回合受到伤害。' };
    const glyphs = traitGlyphsFor([same, { ...same }, { ...same }]);
    const labels = glyphs.map(labelOf);
    expect(new Set(labels).size).toBe(labels.length); // 三个特质三个族

    // 三个真实特质也不应撞图
    const trio = traitGlyphsFor([
      { name: '狂暴', description: '在受到攻击时获得 1 点攻击力。' },
      { name: '庞然', description: '在配对 4 或 5 颗宝石时，获得 1 点生命值。' },
      { name: '食人魔之怒', description: '在配对红色宝石时获得 1 点攻击力。' },
    ]);
    const trioLabels = trio.map(labelOf);
    expect(new Set(trioLabels).size).toBe(trioLabels.length);
    expect(trioLabels).toEqual(['反伤', '生命', '攻击']);
  });

  it('细分族回归：转化/光环/魅惑/法力燃烧/流血/召唤', () => {
    expect(labelOf(traitGlyph('lycanthropy', '狼化', '在我的回合开始时，有 50% 的几率将一颗紫色宝石转换成狼化宝石。'))).toBe('转化');
    expect(labelOf(traitGlyph('iceaura', '冰之灵气', '所有蓝色盟友的全部状态值将增加 5 点。'))).toBe('光环');
    expect(labelOf(traitGlyph('temptation', '蛊惑', '在一名盟友身亡时，魅惑一名随机敌人。'))).toBe('魅惑');
    expect(labelOf(traitGlyph('creepinggloom', '阴霾笼罩', '在配对 4 或更多宝石时，耗掉一名随机敌人 3 点法力值。'))).toBe('法力燃烧');
    expect(labelOf(traitGlyph('vampirism', '吸血鬼', '回合开始时有 10% 的几率生成一个流血宝石。'))).toBe('流血');
    expect(labelOf(traitGlyph('stormflock', '百鸟朝凤', '在配对 4 或更多颗宝石时，有 35% 的几率召唤一只鸟妖法师。'))).toBe('召唤');
  });

  it('稀有度档决定质感：同一特质低稀有度朴素、高稀有度华丽', () => {
    const desc = '对骷髅造成额外伤害。';
    const simple = traitGlyph('x', '嗜骨', desc, 0);
    const normal = traitGlyph('x', '嗜骨', desc, 2);
    const ornate = traitGlyph('x', '嗜骨', desc, 5);
    expect(simple).not.toBe(normal);
    expect(normal).not.toBe(ornate);
    // 三档都是合法 SVG 且语义族不变
    for (const g of [simple, normal, ornate]) {
      expect(g).toContain('<svg');
      expect(labelOf(g)).toBe('攻击');
    }
  });

  it('辞旧在图鉴和战斗中使用蓝色法力水晶球，且不与其他特质撞图', () => {
    const troop = TROOPS.find((t) => t.name === '灰鸠')!;
    expect(troop).toBeDefined();
    const glyphs = traitGlyphsFor(troop.traits, 3);
    const index = troop.traits.findIndex((t) => t.code === 'huijiu_farewell');
    expect(index).toBeGreaterThanOrEqual(0);
    const glyph = glyphs[index]!;
    expect(labelOf(glyph)).toBe('法力');
    expect(glyph).toContain(TRAIT_FAMILY_ICONS['法力']!.normal.body);
    expect(glyph).toContain('fill="#8fb8ff"');
    expect(glyph).not.toContain(TRAIT_FAMILY_ICONS['亡语']!.normal.body);
    expect(new Set(glyphs.map(labelOf)).size).toBe(troop.traits.length);
    expect(traitBadgeSvg('huijiu_farewell')).toBe(glyph);
    expect(traitCardGlyphs(troop.traits.map((t) => t.code), undefined, troop.name, 3)[index]!.svg).toBe(glyph);
  });

  it('辞旧的定向换图不影响其他亡语特质', () => {
    const glyph = traitGlyph('other_death_trait', '遗愿', '自身身亡时触发。', 3);
    expect(labelOf(glyph)).toBe('亡语');
    expect(glyph).toContain(TRAIT_FAMILY_ICONS['亡语']!.normal.body);
  });

  it('空描述兜底星堆，绝不抛错、绝不返回空串', () => {
    const glyph = traitGlyph(undefined, '未知特质', '');
    expect(glyph).toContain('<svg');
    expect(glyph).toContain('aria-label="特质"');
  });
});
