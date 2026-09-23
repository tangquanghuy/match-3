import { describe, expect, it } from 'vitest';
import { renderStats } from '@render/GameOverPanel';

describe('battle game-over stats', () => {
  it('always renders the three stable result categories', () => {
    const html = renderStats({
      turns: 8,
      survivors: 2,
      teamSize: 4,
      loot: { gold: 0, souls: 0, gems: 0 },
    });

    expect(html).toContain('回合');
    expect(html).toContain('我方存活');
    expect(html).toContain('战场收集');
    expect(html).toContain('本场无额外收集');
    expect(html).not.toMatch(/VICTORY|DEFEAT/);
  });

  it('lists only currencies actually collected', () => {
    const html = renderStats({
      turns: 3,
      survivors: 3,
      teamSize: 3,
      loot: { gold: 12, souls: 0, gems: 2 },
    });

    expect(html).toContain('<i>金币</i>12');
    expect(html).toContain('<i>宝石</i>2');
    expect(html).not.toContain('<i>灵魂</i>');
    expect(html).not.toContain('本场无额外收集');
  });
});
