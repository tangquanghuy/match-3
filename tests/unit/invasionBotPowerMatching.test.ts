import { describe, expect, it } from 'vitest';
import { buildDemoSave } from '../../src/meta/server/demo';
import { botInvasionCandidates, invasionPlayerPower, invasionRosterFresh, rebuildInvasionRoster } from '../../src/meta/systems/invasion';
import { teamPower } from '../../src/meta/systems/invasionMirrors';
import { teamStatPower } from '../../src/meta/systems/combatPower';
import { enemyToSnapshot } from '../../src/meta/systems/battleBridge';
import { getTroopById } from '../../src/data/troops';
import { allKingdoms } from '../../src/meta/data/kingdoms';

const WEEK = Date.UTC(2026, 9, 4);
function player(league = 9) {
  const save = buildDemoSave(WEEK);
  save.hero.level = 83;
  save.invasion.weekStart = WEEK;
  save.invasion.league = league;
  return save;
}

describe('simulated invasion matchmaking', () => {
  it('uses league for the draft and a bounded level floor, team power for the actual difficulty bands', () => {
    const weak = player();
    const before = botInvasionCandidates(weak, WEEK, WEEK);
    const stronger = structuredClone(weak);
    for (const member of stronger.teams[0]!.members) {
      if (member.kind !== 'troop') continue;
      stronger.collection[String(member.troopId)]!.level = 20;
      stronger.collection[String(member.troopId)]!.traits = [true, true, true];
    }
    const power = invasionPlayerPower(stronger);
    expect(power).toBeGreaterThan(invasionPlayerPower(weak) * 1.5);
    const after = botInvasionCandidates(stronger, WEEK, WEEK);
    expect(after.map(m => m.defense.map(d => d.troopId))).toEqual(before.map(m => m.defense.map(d => d.troopId)));
    expect(after[1]!.rating).toBeGreaterThan(before[1]!.rating);
    expect(after[1]!.rating).toBeGreaterThan(power * 0.85);
    expect(after[1]!.rating).toBeLessThan(power * 1.15);
    expect(after[0]!.rating).toBeLessThan(after[1]!.rating);
    expect(after[1]!.rating).toBeLessThan(after[2]!.rating);
    for (const m of after) {
      expect(m.defense.every(d => d.level >= 10 && d.level <= 100)).toBe(true);
      const snapshots = m.defense.map((d, i) => enemyToSnapshot(getTroopById(d.troopId)!, d, i));
      expect(m.rating).toBe(teamPower(snapshots));
      expect(m.statRating).toBe(teamStatPower(snapshots));
    }
    rebuildInvasionRoster(weak, WEEK, WEEK, [], 1);
    expect(invasionRosterFresh(weak, WEEK, WEEK)).toBe(true);
    weak.collection = stronger.collection;
    expect(invasionRosterFresh(weak, WEEK, WEEK)).toBe(false);
  });

  it('scales beyond the old Lv.32/34/36 templates for a developed Lv.100 team', () => {
    const save = player(0);
    save.hero.level = 100;
    for (const member of save.teams[0]!.members) {
      if (member.kind !== 'troop') continue;
      save.collection[String(member.troopId)]!.level = 20;
      save.collection[String(member.troopId)]!.traits = [true, true, true];
    }
    for (const kingdom of allKingdoms()) {
      save.kingdoms[kingdom] = { level: 10, questsDone: 8, exploreTier: 0, clearedExploreTiers: [], lastTributeAt: WEEK };
    }
    const candidates = botInvasionCandidates(save, WEEK, WEEK);
    expect(candidates[1]!.defense[0]!.level).toBeGreaterThan(36);
    expect(candidates[2]!.defense[0]!.level).toBeGreaterThan(36);
    expect(candidates[1]!.rating / invasionPlayerPower(save)).toBeGreaterThan(0.9);
    expect(candidates[1]!.rating / invasionPlayerPower(save)).toBeLessThan(1.1);
  });

  it('does not equate hero Lv.83 or Lv.100 with an NPC level; league still changes the opponent pool', () => {
    const save = player();
    const highLeague = botInvasionCandidates(save, WEEK, WEEK);
    expect(highLeague[1]!.defense[0]!.level).toBeLessThan(83);
    save.hero.level = 100;
    const maxHero = botInvasionCandidates(save, WEEK, WEEK);
    expect(maxHero[1]!.defense[0]!.level).toBeLessThan(100);
    save.invasion.league = 0;
    const lowLeague = botInvasionCandidates(save, WEEK, WEEK);
    expect(highLeague[1]!.league).toBe(9);
    expect(lowLeague[1]!.league).toBe(0);
    expect(highLeague[1]!.defense.map(d => d.troopId)).not.toEqual(lowLeague[1]!.defense.map(d => d.troopId));
    expect(lowLeague.every(m => m.defense.every(d => d.level >= 1 && d.level <= 100))).toBe(true);
  });
});
