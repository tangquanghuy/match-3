/**
 * 术语表与术语高亮通道校验。
 *
 * - termGlossary：别名非空唯一、TERM_PATTERN 最长优先（「超级末日骷髅头」先于
 *   「末日骷髅头」）、TERM_BY_ID 覆盖全部条目；
 * - spellText：renderSpell 输出的 html 中术语包成 `.spell-term` span、
 *   terms 按首现去重、公式按钮文本不被二次包装、interactive 两种模式一致；
 * - 全量 TROOPS 描述 + 特质描述跑一遍渲染不抛错（数据管道回归）。
 */
import { describe, it, expect } from 'vitest';
import { TERM_GLOSSARY, TERM_BY_ALIAS, TERM_BY_ID } from '../../src/data/termGlossary';
import { applyTermMarkup, renderSpell } from '../../src/meta/shell/spellText';
import { TROOPS } from '../../src/data/troops';

describe('termGlossary 数据完整性', () => {
  it('条目字段齐全：id 唯一、别名非空', () => {
    const ids = new Set<string>();
    for (const entry of TERM_GLOSSARY) {
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.body.trim().length).toBeGreaterThan(0);
      expect(['status', 'gem', 'combat']).toContain(entry.category);
    }
    expect(TERM_GLOSSARY.length).toBeGreaterThan(40);
  });

  it('别名表无冲突，且包含每条的 title', () => {
    for (const entry of TERM_GLOSSARY) {
      expect(TERM_BY_ALIAS.get(entry.title)?.id).toBe(entry.id);
      for (const alias of entry.aliases) {
        expect(alias.trim().length).toBeGreaterThan(0);
        expect(TERM_BY_ALIAS.get(alias)?.id).toBe(entry.id);
      }
    }
  });

  it('TERM_BY_ID 覆盖全部条目', () => {
    expect(TERM_BY_ID.size).toBe(TERM_GLOSSARY.length);
  });
});

describe('TERM_PATTERN 最长优先', () => {
  it('超级末日骷髅头整体命中 uberdoomskull，而不是先吃掉末日骷髅头', () => {
    const html = applyTermMarkup('创造 2 颗超级末日骷髅头。');
    expect(html).toContain('data-term="uberdoomskull"');
    expect(html).not.toContain('data-term="doomskull"');
  });

  it('裸末日骷髅命中 doomskull', () => {
    expect(applyTermMarkup('将所有黄色宝石转换成末日骷髅。')).toContain('data-term="doomskull"');
  });

  it('别名变体都解析到同一 id（法印→附魔、下潮→下潜）', () => {
    expect(applyTermMarkup('获得屏障和法印效果。')).toContain('data-term="enchanted"');
    expect(applyTermMarkup('使自己下潜。')).toContain('data-term="submerged"');
  });

  it('妖火状态与妖火宝石分别命中', () => {
    expect(applyTermMarkup('随机使一名敌人陷入妖火状态。')).toContain('data-term="faeriefire"');
    expect(applyTermMarkup('创造 1 颗妖火宝石。')).toContain('data-term="statusgem"');
  });

  it('状态词与宝石后缀互不误伤（燃烧 vs 燃烧宝石）', () => {
    const gem = applyTermMarkup('创造 3 颗燃烧宝石。');
    expect(gem).toContain('data-term="statusgem"');
    const status = applyTermMarkup('燃烧所有敌人。');
    expect(status).toContain('data-term="burning"');
    expect(status).not.toContain('data-term="statusgem"');
  });
});

describe('renderSpell 术语通道', () => {
  it('描述文本里的术语包成 .spell-term，terms 记录首现去重', () => {
    const parsed = renderSpell('对所有敌人造成 [魔法 + 2] 点真实伤害。使他们陷入中毒和疾病状态。再燃烧所有敌人。', 5);
    expect(parsed.html).toContain('data-term="poison"');
    expect(parsed.html).toContain('data-term="disease"');
    expect(parsed.html).toContain('data-term="burning"');
    expect(parsed.html).toContain('data-term="truedamage"');
    expect(parsed.terms.map((t) => t.id)).toEqual(['truedamage', 'poison', 'disease', 'burning']);
  });

  it('非 interactive 模式同样输出术语 span（数值保持 <b>）', () => {
    const parsed = renderSpell('创造 9 颗诅咒宝石。对所有敌人造成 [魔法 + 3] 点伤害。', 5, { interactive: false });
    expect(parsed.html).toContain('<b>8 点伤害</b>');
    expect(parsed.html).toContain('data-term="statusgem"');
    expect(parsed.html).not.toContain('<button');
  });

  it('公式按钮内部文本不被二次包装', () => {
    const parsed = renderSpell('获得 [魔法 + 5] 点生命值。', 5);
    // 「点生命值」按钮文本里没有术语，保持原样；整段无嵌套标记
    expect(parsed.html).toMatch(/<button type="button" class="spell-stat"[^>]*>10 点生命值<\/button>/);
    expect((parsed.html.match(/spell-term/g) ?? []).length).toBe(0);
  });

  it('已有 HTML 标签不被破坏（先公式后术语两通道叠加）', () => {
    const parsed = renderSpell('窃取所有敌人 [魔法 + 5] 点生命值。', 5);
    expect(() => applyTermMarkup(parsed.html)).not.toThrow();
    const twice = applyTermMarkup(parsed.html);
    expect(twice).not.toContain('spell-term'); // 已包过术语的 html 不重复包
  });

  it('applyTermMarkup 对空串安全', () => {
    expect(applyTermMarkup('')).toBe('');
  });
});

describe('全量数据回归', () => {
  it('TROOPS 全部法术描述渲染不抛错、无未闭合 span', () => {
    for (const troop of TROOPS) {
      const parsed = renderSpell(troop.spell.description, 5, { interactive: false });
      const opens = (parsed.html.match(/<span\b/g) ?? []).length;
      const closes = (parsed.html.match(/<\/span>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it('TROOPS 全部特质描述跑 applyTermMarkup 不抛错', () => {
    for (const troop of TROOPS) {
      for (const trait of troop.traits) {
        expect(() => applyTermMarkup(trait.description)).not.toThrow();
      }
    }
  });

  it('正则无灾难回溯：长文本一次渲染在时限内', () => {
    const long = '燃烧中毒诅咒冻结缠绕织网沉默击晕恐怖'.repeat(200);
    const start = performance.now();
    applyTermMarkup(long);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
