import { adaptiveDefensePool } from '../../src/meta/data/opponentTeams';
import { troopStrategy, manaLinkScore } from '../../src/meta/data/troopStrategy';
import { describe, it, expect } from 'vitest';
// @ts-expect-error Node-only audit; this browser project does not install Node types.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node-only audit; this browser project does not install Node types.
import { createHash } from 'node:crypto';
import { COMMUNITY_DEFENSES } from '../../src/meta/data/communityDefenses';
import { INVASION_DIFFICULTIES, buildTieredDefense, invasionPoolLeague } from '../../src/meta/data/invasionDifficulty';
import { buildBracket, invasionCandidates, planInvasionBattle } from '../../src/meta/systems/invasion';
import { buildDemoSave } from '../../src/meta/server/demo';
import { getTroopById, knownTroopTypes } from '../../src/data/troops';
import { buildMetaRegistry, enemyToSnapshot, metaKnownTraitIds } from '../../src/meta/systems/battleBridge';
import { BANNERS } from '../../src/meta/data/banners';
import { arenaOpponentPreview } from '../../src/meta/systems/arena';
import { validateBattleRequest } from '../../src/session/validateRequest';
import { BattleSession, mapRequestToTeams } from '../../src/session';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { createGameState } from '../../src/engine/GameState';
import { BoardGenerator } from '../../src/engine/boardGen';
import { SeededRNG } from '../../src/engine/rng';

const WEEK = 1726444800000;
const DAY = 86400000;
const ROOT = 'data/reference/gow-community/';
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const rows: { id: string; slots: string[]; heroClass: string; banner: string }[] = JSON.parse(readFileSync(ROOT + 'lineups.json', 'utf8'));

function saveAt(league: number) {
  const save = buildDemoSave(WEEK);
  save.hero.level = 100;
  save.invasion.weekStart = WEEK;
  save.invasion.league = league;
  return save;
}

describe('archived community lineups and reviewed runtime subset', () => {
  it('both original workbooks match the recorded checksums; reference rows retain their addresses', () => {
    const manifest = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf8'));
    expect(manifest.sources).toHaveLength(2);
    for (const source of manifest.sources) {
      const bytes = readFileSync(ROOT + source.file);
      expect(bytes.subarray(0, 2).toString()).toBe('PK');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
    }
    expect(rows.filter(r => r.id.startsWith('team-share:Teams:'))).toHaveLength(115);
    expect(rows.filter(r => r.id.startsWith('delve-teams:'))).toHaveLength(57);
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
  });
  it('every enabled team preserves all four source slots and ordering, including duplicates', () => {
    const registry = buildMetaRegistry([]);
    for (const team of COMMUNITY_DEFENSES) {
      const source = rows.find(r => r.id === `team-share:Teams:${team.sourceRow}`)!;
      expect(source, team.id).toBeDefined();
      expect(source.heroClass).toBe('None');
      expect(team.troops.map(id => normalize(getTroopById(id)!.referenceName))).toEqual(source.slots.map(normalize));
      expect(BANNERS[team.bannerKingdom]?.official).toBe(true);
      for (const [i, id] of team.troops.entries()) {
        const troop = getTroopById(id)!;
        expect(registry.prototypes.has(String(troop.spell.id)), team.id).toBe(true);
        const snap = enemyToSnapshot(troop, { troopId: id, level: 20, tier: 'minion' }, i);
        expect(snap.traitIds).toEqual(troop.traits.map(t => t.code));
      }
    }
    expect(COMMUNITY_DEFENSES.find(t => t.id === 'share-87')!.troops).toEqual([6103,6103,6042,6103]);
  });
});

describe('invasion daily low / middle / high choice', () => {
  it('all leagues and all days offer exactly one of each band in stable order, even with extreme VP', () => {
    for (let league = 0; league < 10; league++) {
      const save = saveAt(league);
      for (const vp of [0, 999999]) for (let day = 0; day < 7; day++) {
        save.invasion.vp = vp;
        const candidates = invasionCandidates(save, WEEK + day * DAY, WEEK);
        expect(candidates.map(m => m.difficulty)).toEqual(INVASION_DIFFICULTIES);
        expect(new Set(candidates.map(m => m.id)).size).toBe(3);
        expect(candidates.every(m => m.defense.every(d => d.level >= league + 1 && d.level <= 100))).toBe(true);
        expect(candidates.every(m => m.rating > 0 && (m.statRating ?? 0) > 0)).toBe(true);
        expect(candidates).toEqual(invasionCandidates(structuredClone(save), WEEK + day * DAY, WEEK));
      }
      const bracket = buildBracket(WEEK, league);
      expect(bracket.filter(m => m.difficulty === 'hard')).toHaveLength(9);
      expect(bracket.filter(m => m.sourceRow !== null)).toHaveLength(2);
      expect(bracket.filter(m => m.difficulty === 'hard' && m.sourceRow === null)).toHaveLength(7);
      expect(bracket.filter(m => m.difficulty !== 'hard').every(m => m.sourceRow === null)).toBe(true);
      for (const m of bracket.filter(m => m.sourceRow !== null)) {
        const t = COMMUNITY_DEFENSES.find(t => t.id === m.archetypeId)!;
        expect(m.defense.map(d => d.troopId)).toEqual(t.troops);
        expect(m.sourceRow).toBe(t.sourceRow);
        for (const [i, d] of m.defense.entries()) {
          expect(d.level).toBeGreaterThanOrEqual(t.minLevel);
          const snapshot = enemyToSnapshot(getTroopById(d.troopId)!, d, i);
          expect(snapshot.traitIds!.length).toBeGreaterThanOrEqual(t.requiredTraits);
        }
        if (league < 4) expect(t.requiredTraits).toBe(0);
        else expect(t.requiredTraits).toBe(3);
      }
    }
  });
  it('refresh stays stable across days and rerolls within all three tiers', () => {
    const save = saveAt(9);
    expect(invasionCandidates(save, WEEK - DAY, WEEK)).toEqual(invasionCandidates(save, WEEK, WEEK));
    const initial = invasionCandidates(save, WEEK, WEEK).map(m => m.defense);
    expect(invasionCandidates(save, WEEK + DAY, WEEK).map(m => m.defense)).toEqual(initial);
    const days = Array.from({ length: 7 }, (_, d) => {
      save.invasion.refreshCount = d;
      return invasionCandidates(save, WEEK, WEEK);
    });
    for (let tier = 0; tier < 3; tier++) expect(new Set(days.map(day => day[tier]!.id)).size).toBeGreaterThan(1);
  });
  it('banner and full traits reach the actual session, not just the opponent preview', () => {
    const save = saveAt(9);
    const candidates = invasionCandidates(save, WEEK, WEEK);
    for (const mirror of candidates) {
      const plan = planInvasionBattle(save, mirror.id, 12, WEEK, WEEK);
      expect(plan.ok).toBe(true); if (!plan.ok) continue;
      expect(plan.request.enemyTeam).toEqual(mirror.defense.map((d, i) => enemyToSnapshot(getTroopById(d.troopId)!, d, i)));
      // 三档对手都自动挂覆盖本队法力色的旗帜
      expect(mirror.bannerKingdom).not.toBeNull();
      expect(plan.request.enemyBanner?.boosts).toEqual(BANNERS[mirror.bannerKingdom!]!.boosts);
      if (mirror.difficulty === 'hard') {
        // Training/trait unlocks follow the calibrated NPC level rather than a fixed league level.
        expect(plan.request.enemyTeam.every((t, i) => (t.traitIds?.length ?? 0)
          <= (mirror.defense[i]!.level < 10 ? 0 : mirror.defense[i]!.level < 15 ? 1 : mirror.defense[i]!.level < 20 ? 2 : 3))).toBe(true);
        const mapped = mapRequestToTeams(plan.request);
        let id = 900000;
        const board = new BoardGenerator(new SeededRNG(1), () => id++, .12).generate();
        const engine = new TurnEngine(createGameState(board, mapped.playerTeam, mapped.enemyTeam), new SeededRNG(12), () => id++, plan.registry);
        new BattleSession({ request: plan.request, idMap: mapped.idMap, engine });
        expect(engine.enemyBannerBoosts).toEqual(plan.request.enemyBanner?.boosts);
        expect(engine.enemyBannerBoosts).not.toBe(plan.request.enemyBanner?.boosts);
      }
      const opts = { knownSkillIds: new Set([...plan.registry.skills.keys(), ...plan.registry.prototypes.keys()]), knownTraitIds: metaKnownTraitIds(), knownTroopTypes: knownTroopTypes() };
      expect(validateBattleRequest(plan.request, opts).ok).toBe(true);
      for (const bad of [{ boosts: { Red: NaN } }, { boosts: { Red: 5 } }, { boosts: { Skull: 2 } }, null]) {
        expect(validateBattleRequest({ ...plan.request, enemyBanner: bad }, opts).ok).toBe(false);
      }
    }
  });
  it('Arena remains four drafted rarity slots, level 15, with no traits', () => {
    for (let wins = 0; wins < 6; wins++) {
      const arena = arenaOpponentPreview(12, wins, 0);
      expect(arena.enemies.map(t => getTroopById(t.troopId)!.rarityIdx).sort()).toEqual([0,1,2,3]);
      for (const d of arena.enemies) { expect(d.level).toBe(15); expect(d.traitCount).toBe(0); }
    }
  });
});


describe('broad rarity-weighted invasion drafts', () => {
  it('all tiers generate varied, reproducible rosters from their eligible pools, with increasing rarity', () => {
    const averageRarity: number[] = [];
    const registry = buildMetaRegistry([]);
    for (const difficulty of INVASION_DIFFICULTIES) {
      const used = new Set<number>(), teams = new Set<string>();
      const eligible = new Set(adaptiveDefensePool(invasionPoolLeague(9, difficulty)).map(t => t.id));
      let rarityTotal = 0;
      const rarityCounts = Array(6).fill(0);
      for (let seed = 0; seed < 160; seed++) {
        // Ordinal 0 is always a random roster, including the hard band.
        const team = buildTieredDefense(seed, 9, difficulty, 0);
        expect(team).toEqual(buildTieredDefense(seed, 9, difficulty, 0));
        expect(team.sourceRow).toBeNull();
        expect(new Set(team.troops).size).toBe(4);
        expect(team.troops.some(id => troopStrategy(id).damage || troopStrategy(id).skulls)).toBe(true);
        if (difficulty !== 'easy') expect(team.troops.some(source => team.troops.some(target =>
          source !== target && (troopStrategy(target).damage || troopStrategy(target).skulls) && manaLinkScore(source, target) > 0))).toBe(true);
        teams.add(team.troops.join(','));
        for (const id of team.troops) {
          const troop = getTroopById(id)!;
          expect(eligible.has(id)).toBe(true);
          expect(registry.prototypes.has(String(troop.spell.id)), `troop ${id}`).toBe(true);
          rarityTotal += troop.rarityIdx; rarityCounts[troop.rarityIdx]++;
          used.add(id);
        }
      }
      expect(teams.size).toBeGreaterThan(145);
      expect(used.size).toBeGreaterThan(180);
      expect(rarityCounts.filter(n => n > 0).length).toBeGreaterThanOrEqual(5);
      averageRarity.push(rarityTotal / 640);
    }
    expect(averageRarity[1]!).toBeGreaterThan(averageRarity[0]!);
    expect(averageRarity[2]!).toBeGreaterThan(averageRarity[1]!);
  });
  it('changing NPC ordinal changes random lineups, not just the internal name', () => {
    for (const difficulty of INVASION_DIFFICULTIES) {
      const teams = [0,1,2,4,5,6,8].map(i => buildTieredDefense(123, 9, difficulty, i).troops.join(','));
      expect(new Set(teams).size).toBe(teams.length);
    }
  });
});
