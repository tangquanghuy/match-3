import { describe, expect, it } from 'vitest';
import { buildDemoSave } from '../../src/meta/server/demo';
import { defenseRecord } from '../../src/meta/systems/invasionDefense';
import { botInvasionCandidates } from '../../src/meta/systems/invasion';
import { buildInvasionRoster, compatibleMirrorRuleset, invasionPoolQuery, teamPower, usableEntry } from '../../src/meta/systems/invasionMirrors';
import { RULESET_VERSION } from '../../src/session/contract';

describe('thin-pool invasion matchmaking', () => {
  it('searches neighboring leagues and only reuses compatible older battle snapshots', () => {
    const query = invasionPoolQuery(5, 1000, 1000);
    expect([query.leagueMin, query.leagueMax]).toEqual([3, 7]);
    expect(compatibleMirrorRuleset(RULESET_VERSION)).toBe(true);
    expect(compatibleMirrorRuleset('1.0.0')).toBe(true);
    expect(compatibleMirrorRuleset('2.0.0')).toBe(false);
    expect(compatibleMirrorRuleset('corrupt')).toBe(false);
  });

  it('uses a single lower-league player with a bounded boost reflected in the battle snapshot', () => {
    const save = buildDemoSave(1000);
    save.invasion.defenseTeam = structuredClone(save.teams[0]!);
    const record = defenseRecord(save, 1000)!;
    const team = record.team.map(c => ({ ...c, stats: {
      hp: Math.max(1, Math.floor(c.stats.hp * 0.72)),
      armor: Math.floor(c.stats.armor * 0.72),
      attack: Math.floor(c.stats.attack * 0.72),
      magic: Math.floor(c.stats.magic * 0.72),
    } }));
    const entry = { ...record, team, ownerKey: 'rival', name: 'Rival', league: 4, power: teamPower(team) };
    expect(usableEntry(entry, 1000)).toBe(true);
    save.invasion.league = 6;
    const bots = botInvasionCandidates(save, 1000, 1000);
    const power = entry.power / 0.72;
    const rosters = Array.from({ length: 30 }, (_, seed) => buildInvasionRoster({ bots, league: 6, playerPower: power,
      pool: [entry], recent: [], now: 1000, seed: seed + 1 }));
    const picked = rosters.flat().find(m => m.player?.ownerKey === 'rival');
    expect(picked).toBeDefined();
    expect(picked!.rating).toBeGreaterThan(entry.power);
    expect(picked!.player!.team[0]!.stats.hp).toBeGreaterThan(entry.team[0]!.stats.hp);
    expect(picked!.player!.team[0]!.stats.hp).toBeLessThanOrEqual(Math.ceil(entry.team[0]!.stats.hp * 1.5));
    expect(buildInvasionRoster({ bots, league: 6, playerPower: power, pool: [entry], recent: ['rival'],
      now: 1000, seed: 1 }).every(m => !m.player)).toBe(true);
  });
});
