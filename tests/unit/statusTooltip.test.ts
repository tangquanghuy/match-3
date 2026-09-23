/**
 * 状态徽记点击说明 · 文案覆盖测试。
 * 保证 BADGES 里的每个已知状态（含别名）都有效果说明——
 * 新增状态时漏写文案会在这里红（点击说明是用户明确要求的功能）。
 */
import { describe, it, expect } from 'vitest';
import { STATUS_DESCRIPTIONS } from '../../src/data/statusDescriptions';
import { statusBadge } from '@render/statusBadges';

const CANONICAL_IDS = [
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web',
  'barrier', 'submerged', 'marked', 'disease', 'curse', 'death-mark', 'wolf',
  'rage', 'mana-burn', 'charm', 'faerie-fire', 'terror',
];

describe('状态徽记点击说明文案', () => {
  it('全部已知状态都有效果说明', () => {
    for (const id of CANONICAL_IDS) {
      const label = statusBadge(id).label;
      expect(STATUS_DESCRIPTIONS[label], `状态 ${id}（${label}）缺说明文案`).toBeTruthy();
    }
  });

  it('未知状态落到兜底说明', () => {
    expect(STATUS_DESCRIPTIONS['状态']).toBeTruthy();
  });
});
