import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { EVENT_UNLOCK_HERO_LEVEL, WEEK_MS } from '../../src/meta/data/events';
import { INGOT_KEYS } from '../../src/meta/data/materials';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { eventAction, ensureEventWeek, planEventEncounter } from '../../src/meta/systems/events';
import { RAID_INGOT_REWARDS, raidIngotKey, raidIngotLevel, rollRaidIngotReward, type RaidState } from '../../src/meta/systems/eventModes/raid';
import { applySettlement } from '../../src/meta/systems/settlement';
import { planExploreEncounter } from '../../src/meta/systems/encounter';
import type { BattleResult } from '../../src/session/contract';
import type { EncounterPlan } from '../../src/meta/systems/encounter';

const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
const save = () => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  s.hero.level = EVENT_UNLOCK_HERO_LEVEL;
  return s;
};
const result = (seed: number, winner: 'player' | 'enemy'): BattleResult => ({
  schemaVersion: 1, battleId: `raid-ingot-${seed}-${winner}`, requestId: 'r', rulesetVersion: '1',
  seed, winner, turns: 4, combatants: [], defeatedExternalIds: [], summonedCount: 0,
  actionLogDigest: '', eventSummary: [],
});
const settle = (s: ReturnType<typeof save>, plan: EncounterPlan, seed: number, winner: 'player' | 'enemy') =>
  applySettlement(s, result(seed, winner), { plan, todayStart: 0, enemyByExternalId: new Map() });

describe('repeatable raid boss ingot challenge', () => {
  it('each of 12 selectable difficulties maps to the correct ingot; invalid selections do not mutate the state', () => {
    const s = save();
    const week = ensureEventWeek(s, WEEK, 'raidBoss');
    expect((week.mode as RaidState).ingotTier).toBe(1);
    for (let tier = 1; tier <= 12; tier++) {
      expect(eventAction(s, WEEK, 'raidBoss', `ingot-tier:${tier}`, tier)).toMatchObject({ ok: true });
      const plan = planEventEncounter(s, WEEK, tier, 'raidBoss', 'ingot') as EncounterPlan;
      expect(plan.source).toMatchObject({ kind: 'event', typeId: 'raidBoss', choice: `ingot:${tier}` });
      expect(plan.enemies[0]!.level).toBe(raidIngotLevel(tier));
      expect(raidIngotKey(tier)).toBe((['common', 'rare', 'ultraRare', 'epic', 'mythic', 'mythic'] as const)[Math.floor((tier - 1) / 2)]);
      const before = { ...s.materials.ingots };
      const detail = settle(s, plan, tier, 'player');
      const reward = RAID_INGOT_REWARDS[tier - 1]!;
      const mats = rollRaidIngotReward(tier, tier);
      expect(mats.ingots?.[reward.guaranteed.key]).toBe(reward.guaranteed.count);
      expect(detail.lines.find(line => line.mats?.ingots)?.mats).toEqual(mats);
      for (const key of INGOT_KEYS) expect((s.materials.ingots[key] ?? 0) - (before[key] ?? 0)).toBeGreaterThanOrEqual(mats.ingots?.[key] ?? 0);
    }
    expect(eventAction(s, WEEK, 'raidBoss', 'ingot-tier:13', 1)).toMatchObject({ ok: false });
    expect(eventAction(s, WEEK, 'raidBoss', 'ingot-tier:1.5', 1)).toMatchObject({ ok: false });
    expect((week.mode as RaidState).ingotTier).toBe(12);
  });

  it('repeated wins award materials without consuming the normal raid boss pool, fatigue, supplies or weekly slay cap', () => {
    const s = save();
    const week = ensureEventWeek(s, WEEK, 'raidBoss');
    eventAction(s, WEEK, 'raidBoss', 'ingot-tier:7', 1);
    const before = structuredClone(week.mode);
    for (let seed = 110; seed < 113; seed++) {
      const plan = planEventEncounter(s, WEEK, seed, 'raidBoss', 'ingot') as EncounterPlan;
      expect(settle(s, plan, seed, 'player').lines.some(line => line.label.includes('首领锻材挑战胜利'))).toBe(true);
    }
    expect(s.materials.ingots.rare).toBe(15);
    expect(s.materials.ingots.ultraRare).toBe([110, 111, 112].reduce((sum, seed) => sum + (rollRaidIngotReward(7, seed).ingots?.ultraRare ?? 0), 0));
    expect(s.materials.ingots.epic).toBe([110, 111, 112].reduce((sum, seed) => sum + (rollRaidIngotReward(7, seed).ingots?.epic ?? 0), 0));
    expect(week.playRewards).toBe(0);
    expect(week.mode).toEqual(before);
    expect(week.points).toBe(90);
    const lost = planEventEncounter(s, WEEK, 114, 'raidBoss', 'ingot') as EncounterPlan;
    settle(s, lost, 114, 'enemy');
    expect(s.materials.ingots.rare).toBe(15);
    expect(s.materials.ingots.ultraRare).toBe([110, 111, 112].reduce((sum, seed) => sum + (rollRaidIngotReward(7, seed).ingots?.ultraRare ?? 0), 0));
    expect(s.materials.ingots.epic).toBe([110, 111, 112].reduce((sum, seed) => sum + (rollRaidIngotReward(7, seed).ingots?.epic ?? 0), 0));
    expect(week.mode).toEqual(before);
    expect(week.points).toBe(90);
  });

  it('higher difficulties guarantee growing low-tier payouts and independently roll declining high-tier rates', () => {
    const expected = [
      { tier: 5, guaranteed: 3, bonuses: { ultraRare: 0.25 } },
      { tier: 6, guaranteed: 4, bonuses: { ultraRare: 0.35 } },
      { tier: 7, guaranteed: 5, bonuses: { ultraRare: 0.38, epic: 0.12 } },
      { tier: 8, guaranteed: 6, bonuses: { ultraRare: 0.45, epic: 0.18 } },
      { tier: 9, guaranteed: 7, bonuses: { ultraRare: 0.48, epic: 0.20, mythic: 0.04 } },
      { tier: 10, guaranteed: 8, bonuses: { ultraRare: 0.52, epic: 0.22, mythic: 0.06 } },
      { tier: 11, guaranteed: 9, bonuses: { ultraRare: 0.56, epic: 0.24, mythic: 0.08 } },
      { tier: 12, guaranteed: 10, bonuses: { ultraRare: 0.60, epic: 0.30, mythic: 0.10 } },
    ] as const;
    for (const { tier, guaranteed, bonuses } of expected) {
      expect(RAID_INGOT_REWARDS[tier - 1]!.guaranteed).toEqual({ key: 'rare', count: guaranteed });
      for (const seed of [1, 3, 5, 10, 100]) {
        const reward = rollRaidIngotReward(tier, seed).ingots!;
        expect(reward.rare).toBe(guaranteed);
        expect((reward.ultraRare ?? 0) + (reward.epic ?? 0) + (reward.mythic ?? 0)).toBeLessThanOrEqual(3);
      }
      for (const [key, chance] of Object.entries(bonuses)) {
        const drops = Array.from({ length: 4000 }, (_, seed) => rollRaidIngotReward(tier, seed).ingots?.[key as keyof typeof bonuses] ?? 0);
        expect(drops.reduce<number>((sum, count) => sum + count, 0) / drops.length).toBeCloseTo(chance, 1);
        expect(drops).toContain(0);
        expect(drops).toContain(1);
      }
    }
    const tier10Both = Array.from({ length: 1200 }, (_, seed) => rollRaidIngotReward(10, seed).ingots!)
      .find(ingots => ingots.epic === 1 && ingots.mythic === 1);
    const tier12Both = Array.from({ length: 1000 }, (_, seed) => rollRaidIngotReward(12, seed).ingots!)
      .find(ingots => ingots.epic === 1 && ingots.mythic === 1);
    expect(tier10Both).toBeDefined();
    expect(tier12Both).toBeDefined();
    expect(RAID_INGOT_REWARDS.flatMap(row => row.bonus.map(drop => drop.key))).not.toContain('legendary');
    expect(rollRaidIngotReward(0, 1)).toEqual({});
    expect(rollRaidIngotReward(13, 1)).toEqual({});
  });

  it('exploration no longer has ingots in its random drop line or rewards preview', async () => {
    const s = save();
    const plan = planExploreEncounter(KINGDOM_ORDER[0]!, 1, 5, 0);
    const detail = settle(s, plan, 5, 'player');
    expect(detail.lines.find(line => line.key === 'explore-drop')?.mats?.ingots).toBeUndefined();
    const { questRewardsHtml, questModeLootHtml } = await import('../../src/meta/screens/questRewards');
    expect(questRewardsHtml(KINGDOM_ORDER[0]!, 'hard', 1)).not.toContain('data-reward="ingot:');
    expect(questModeLootHtml(KINGDOM_ORDER[0]!, 'hard')).not.toContain('data-reward="ingot:');
  });
});
