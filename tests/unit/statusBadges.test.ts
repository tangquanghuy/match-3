import { describe, it, expect } from 'vitest';
import { statusBadge, statusBadgeSvg } from '../../src/render/statusBadges';

describe('statusBadge 映射（需求 6.5）', () => {
  it('覆盖各已知状态且图标可区分', () => {
    const ids = ['poison', 'burning', 'silence', 'frozen', 'stun', 'curse'];
    const svgs = new Set<string>();
    const colors = new Set<string>();
    for (const id of ids) {
      const b = statusBadge(id);
      expect(b.label).toBeTruthy();
      expect(b.svg).toBeTruthy();
      svgs.add(b.svg);
      colors.add(b.color);
    }
    // 各状态 svg/颜色互不相同（可区分）
    expect(svgs.size).toBe(ids.length);
    expect(colors.size).toBe(ids.length);
  });

  it('未知状态返回兜底而非崩溃', () => {
    const b = statusBadge('unknown_xyz');
    expect(b.label).toBe('状态');
    expect(b.svg).toContain('?');
  });

  it('statusBadgeSvg 产出合法内联 SVG', () => {
    const svg = statusBadgeSvg('poison');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('aria-label="中毒"');
  });

  it('覆盖代码状态的新增图标，并兼容连字符别名', () => {
    for (const id of ['death_mark', 'death-mark', 'wolf', 'rage', 'mana_burn', 'mana-burn', 'charm', 'lycanthropy']) {
      const b = statusBadge(id);
      expect(b.label).not.toBe('状态');
      expect(b.svg).not.toContain('?');
    }
  });
});
