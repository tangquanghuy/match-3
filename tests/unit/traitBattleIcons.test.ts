import { describe, expect, it } from 'vitest';
import { traitCardGlyphs, traitBadgeSvg } from '@render/traitBadges';

describe('战斗卡面特质图标（game-icons）', () => {
  it('已实现与未实现 code 都出图，且是 512 视窗的 game-icons', () => {
    const glyphs = traitCardGlyphs(
      ['fasthealing', 'ferocity', 'not_a_real_trait_but_named'],
      { not_a_real_trait_but_named: '坚甲' },
      'Dummy',
      1,
    );
    expect(glyphs).toHaveLength(3);
    for (const glyph of glyphs) {
      expect(glyph.svg).toContain('viewBox="0 0 512 512"');
      expect(glyph.svg).not.toMatch(/stroke="#8a7c5c"/);
    }
    expect(glyphs[2]!.name).toBe('坚甲');
  });

  it('未知且无名的 code 仍走 traitBadgeSvg 空值', () => {
    expect(traitBadgeSvg('nonexistent_code_xyz')).toBeNull();
  });
});
