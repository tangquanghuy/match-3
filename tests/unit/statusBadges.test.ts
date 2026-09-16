import { describe, it, expect } from 'vitest';
import { statusBadge, statusBadgeIcon } from '../../src/render/statusBadges';

describe('statusBadge 映射（需求 6.5）', () => {
  it('覆盖各已知状态且图标可区分', () => {
    const ids = ['poison', 'burning', 'silence', 'frozen', 'stun', 'curse'];
    const icons = new Set<string>();
    const colors = new Set<string>();
    for (const id of ids) {
      const b = statusBadge(id);
      expect(b.label).toBeTruthy();
      expect(b.icon).toBeTruthy();
      icons.add(b.icon as string);
      colors.add(b.color);
    }
    // 各状态贴图/颜色互不相同（可区分）
    expect(icons.size).toBe(ids.length);
    expect(colors.size).toBe(ids.length);
  });

  it('未知状态返回兜底而非崩溃', () => {
    const b = statusBadge('unknown_xyz');
    expect(b.label).toBe('状态');
    expect(b.icon).toBeNull();
  });

  it('statusBadgeIcon 产出带无障碍标注的 img', () => {
    const html = statusBadgeIcon('poison');
    expect(html.startsWith('<img')).toBe(true);
    expect(html).toContain('alt="中毒"');
  });

  it('覆盖代码状态的新增图标，并兼容连字符别名', () => {
    for (const id of ['death_mark', 'death-mark', 'wolf', 'rage', 'mana_burn', 'mana-burn', 'charm', 'lycanthropy']) {
      const b = statusBadge(id);
      expect(b.label).not.toBe('状态');
      expect(b.icon).toBeTruthy();
    }
  });

  it('妖火/恐怖/织网有专属徽记（UX 审查 P1#5/P1#7 回归：不得落到灰?占位）', () => {
    for (const id of ['faerie-fire', 'faerie_fire', 'terror', 'web']) {
      const b = statusBadge(id);
      expect(b.label).not.toBe('状态');
      expect(b.icon).toBeTruthy();
    }
    // 三者图标互不相同（可区分）
    const set = new Set(['faerie-fire', 'terror', 'web'].map((id) => statusBadge(id).icon));
    expect(set.size).toBe(3);
  });
});
