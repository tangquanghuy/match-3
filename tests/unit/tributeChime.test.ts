import { afterEach, describe, expect, it } from 'vitest';
import { tributeChimeGain, tributeChimePlan } from '../../src/audio/TributeChime';
import { DEFAULT_PLAYER_PREFERENCES, setPlayerPreferences } from '../../src/preferences/playerPreferences';

afterEach(() => { setPlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES }); });

describe('收取进贡 · 金币入账音效', () => {
  it('金币枚数随收取量增加，6～14 枚封顶', () => {
    const small = tributeChimePlan({ gold: 10 });
    const mid = tributeChimePlan({ gold: 2000, souls: 200, glory: 38 });
    const huge = tributeChimePlan({ gold: 10_000_000 });
    expect(small.coins.length).toBeGreaterThanOrEqual(6);
    expect(mid.coins.length).toBeGreaterThan(small.coins.length);
    expect(huge.coins.length).toBe(14);
    expect(tributeChimePlan({ gold: 0 }).coins.length).toBe(6);
  });

  it('倾泻由密到疏，之后依次是闷响、钟声', () => {
    const plan = tributeChimePlan({ gold: 5000 });
    const gaps = plan.coins.slice(1).map((c, i) => c.at - plan.coins[i]!.at);
    expect(gaps.every((g) => g > 0)).toBe(true);
    expect(gaps[gaps.length - 1]!).toBeGreaterThan(gaps[0]!);
    expect(plan.thumpAt).toBeGreaterThan(plan.coins[plan.coins.length - 1]!.at);
    expect(plan.bellAt).toBeGreaterThan(plan.thumpAt);
    expect(plan.duration).toBeGreaterThan(plan.bellAt);
    expect(plan.duration).toBeLessThan(3);
    for (const c of plan.coins) {
      expect(c.freq).toBeGreaterThan(1500);
      expect(Math.abs(c.pan)).toBeLessThanOrEqual(0.55);
      expect(c.vel).toBeGreaterThan(0);
    }
  });

  it('只有收到宝石或金钥匙才加闪光琶音', () => {
    expect(tributeChimePlan({ gold: 500 }).sparkle).toEqual([]);
    expect(tributeChimePlan({ gold: 500, gems: 3 }).sparkle.length).toBe(4);
    expect(tributeChimePlan({ gold: 500, goldKeys: 1 }).sparkle.length).toBe(4);
  });

  it('同一种子结果一致', () => {
    expect(tributeChimePlan({ gold: 1234 }, 42)).toEqual(tributeChimePlan({ gold: 1234 }, 42));
  });

  it('音量 = 主音量 × 音效音量；任一开关关闭即静音', () => {
    setPlayerPreferences({ masterVolume: 0.5, soundEffectsVolume: 0.6 });
    expect(tributeChimeGain()).toBeCloseTo(0.3);
    setPlayerPreferences({ soundEffectsEnabled: false });
    expect(tributeChimeGain()).toBe(0);
    setPlayerPreferences({ soundEffectsEnabled: true, masterEnabled: false });
    expect(tributeChimeGain()).toBe(0);
  });
});
