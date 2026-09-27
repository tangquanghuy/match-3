/** Full roster audit: enumerate missing entries instead of silently skipping them.
 * Smoke execution is not a proof of every conditional branch's semantics.
 * Output is deliberately separate from the historical curated/skipped counters.
 */
import { describe, it, expect } from 'vitest';
import appSource from '../../src/render/App.ts?raw';
import { troopToSnapshot, enemyToSnapshot, buildMetaRegistry } from '../../src/meta/systems/battleBridge';
// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import { TROOPS, troopToCharacter, troopToSummonTemplate } from '../../src/data/troops';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { registerSkillLibrary, curatedSkipped } from '@engine/skills/library';
import { getTrait, setSummonTemplateResolver } from '@engine/traits';
import { BaseColor, PlayerSide, MatchState, colorGem, skullGem } from '@engine/types';
import type { Character, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { inspectBoardEventContract } from '../helpers/boardEventContract';
import { planPresentation } from '../helpers/presentationBudget';

const seeds = [1, 42, 20260925];
const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);
const colors = Object.values(BaseColor);
const counts = (events: GameEvent[]) => {
  const result: Record<string, number> = {};
  for (const e of events) result[e.type] = (result[e.type] ?? 0) + 1;
  return result;
};

function smoke(troop: typeof TROOPS[number], seed: number) {
  let gid = 1;
  const board = new BoardModel();
  const palette: GemType[] = [...colors.map(colorGem), skullGem()];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    board.set({ row: r, col: c }, { id: gid++, type: palette[(r * 3 + c + seed) % palette.length] });
  }
  const caster = troopToCharacter(troop, 0);
  // An intentionally robust target fixture: actual caster stats/traits, wounded allies,
  // four enemies with different types/colors; no opponent traits masking the spell.
  const dummy = (id: number): Character => ({
    id, name: `audit-${id}`, maxHp: 200, hp: id < 4 ? 120 : 200,
    attack: 12, armor: 30, magic: 8, manaCost: 20, mana: 8,
    colors: [colors[id % colors.length]], skillId: '7004', traitIds: [],
    troopTypes: id < 4 ? troop.troopTypes : [['Daemon'], ['Undead'], ['Dragon'], ['Human']][id - 4],
    kingdom: troop.kingdom ?? undefined, statuses: [], defeated: false,
  });
  caster.kingdom = troop.kingdom ?? undefined;
  const state = createGameState(board,
    { player: PlayerSide.Left, characters: [caster, dummy(1), dummy(2), dummy(3)] },
    { player: PlayerSide.Right, characters: [dummy(4), dummy(5), dummy(6), dummy(7)] });
  const presentationBoard = board.clone();
  const engine = new TurnEngine(state, new SeededRNG(seed), () => gid++, registry);
  engine.setSummonResolver(troopToSummonTemplate);
  engine.setSummonKingdomResolver(k => TROOPS.filter(t => t.kingdom === k).map(t => t.referenceName));
  engine.setDaemonPool(TROOPS.filter(t => t.troopTypes.includes('Daemon')).map(t => t.referenceName));
  const initial = engine.takeInitialEvents();
  caster.mana = caster.manaCost;
  const events = engine.castSkill(caster.id);
  const errors: string[] = inspectBoardEventContract(presentationBoard, [...initial, ...events], state.board);
  if (!events.some(e => e.type === 'skill-cast')) errors.push('cast-not-accepted');
  if (![MatchState.AwaitingInput, MatchState.GameOver].includes(state.state)) errors.push(`unsettled:${state.state}`);
  for (const side of [PlayerSide.Left, PlayerSide.Right]) for (const ch of state.teams[side].characters) {
    for (const key of ['hp', 'maxHp', 'armor', 'attack', 'magic', 'mana'] as const) {
      if (!Number.isFinite(ch[key])) errors.push(`nonfinite:${ch.id}:${key}`);
    }
    if (ch.hp < 0 || ch.armor < 0 || ch.mana < 0) errors.push(`negative:${ch.id}`);
  }
  // Full post-cast chain, not just events before the first damage / explosion.
  return { seed, initialEventCounts: counts(initial), eventCounts: counts(events),
    eventCount: events.length, traitBuffs: events.filter(e => e.type === 'buff' && e.source === 'trait').length,
    maxChain: Math.max(0, ...events.map(e => e.type === 'elimination' ? e.chainCount : 0)),
    finalState: state.state, presentation: planPresentation(events), errors };
}

describe('roster acceptance inventory', () => {
  it('records every troop binding, all trait references and three complete resolution chains', () => {
    setSummonTemplateResolver(spec => troopToSummonTemplate(spec.referenceName));
    const rows = TROOPS.map(troop => {
      const key = String(troop.spell.id);
      const proto = registry.prototypes.get(key);
      const traitRows = troop.traits.map(t => ({ ...t, implemented: !!getTrait(t.code) }));
      const runs = proto?.segments.length ? seeds.map(seed => {
        try { return smoke(troop, seed); }
        catch (error) { return { seed, errors: [String(error)] }; }
      }) : [];
      const template = troopToSummonTemplate(troop.referenceName);
      const summonMetadataGaps = [
        ...(troop.traits.some(t => !template?.traitIds?.includes(t.code)) ? ['traitIds'] : []),
        ...(troop.troopTypes.some(t => !template?.troopTypes?.includes(t)) ? ['troopTypes'] : []),
        ...(troop.kingdom && template?.kingdom !== troop.kingdom ? ['kingdom'] : []),
      ];
      const serialized = JSON.stringify(proto ?? {});
      const mechanismDependencies = ['randomOfKingdom', 'daemonicPortalGem', 'kingdomOf', 'alliesOfKingdom', 'enemiesOfKingdom']
        .filter(key => serialized.includes('"' + key + '"'));
      return { summonMetadataGaps, mechanismDependencies, troopId: troop.id, troopName: troop.name, spellId: troop.spell.id,
        spellName: troop.spell.name, description: troop.spell.description,
        skillBound: !!proto?.segments.length, segmentKinds: proto?.segments.map(s => s.kind) ?? [],
        traits: traitRows, runs,
        historicalSkipReasons: !proto ? curatedSkipped().filter(s => s.id === troop.spell.id).map(s => s.reason) : [],
      };
    });
    const allCodes = [...new Set(rows.flatMap(r => r.traits.map(t => t.code)))];
    const missingSkills = rows.filter(r => !r.skillBound);
    const missingTraits = allCodes.filter(c => !getTrait(c));
    const runtimeFailures = rows.flatMap(r => r.runs.filter(s => s.errors.length).map(s => ({ troopId: r.troopId, ...s })));
    const report = { generatedAt: new Date().toISOString(), seeds,
      scope: 'All TROOPS including community troops; full TurnEngine.castSkill event chains. Binding/smoke only, not semantic or visual sign-off.',
      summary: { troops: rows.length, uniqueSpells: new Set(rows.map(r => r.spellId)).size,
        boundTroops: rows.length - missingSkills.length, missingSkillTroops: missingSkills.length,
        traitCodes: allCodes.length, implementedTraitCodes: allCodes.length - missingTraits.length,
        missingTraitCodes: missingTraits.length, fullyBoundTroops: rows.filter(r => r.skillBound && r.traits.every(t => t.implemented)).length,
        smokeRuns: rows.reduce((n, r) => n + r.runs.length, 0), runtimeFailures: runtimeFailures.length },
      assembly: {
        appInjectsKingdomSummonResolver: appSource.includes('.setSummonKingdomResolver('),
        appInjectsDaemonPool: appSource.includes('.setDaemonPool('),
        summonTemplatesWithMissingMetadata: rows.filter(r => r.summonMetadataGaps.length).length,
        // These two are actual meta snapshot builders, not a hand-written test adapter.
        playerSnapshotsWithoutKingdom: TROOPS.filter(t => t.kingdom && troopToSnapshot(t,
          { level: 20, traits: [true, true, true] } as Parameters<typeof troopToSnapshot>[1], 'audit').kingdom !== t.kingdom).length,
        enemySnapshotsWithoutKingdom: TROOPS.filter(t => t.kingdom && enemyToSnapshot(t,
          { level: 20, tier: 'minion' } as Parameters<typeof enemyToSnapshot>[1], 0).kingdom !== t.kingdom).length,
        fallbackOnlySkills: missingSkills.map(r => ({ troopId: r.troopId, spellId: r.spellId,
          segmentCount: buildMetaRegistry([String(r.spellId)]).prototypes.get(String(r.spellId))?.segments.length })),
      },
      missingSkills: missingSkills.map(({ runs: _runs, traits: _traits, ...r }) => r),
      missingTraits: missingTraits.map(code => ({ code, users: rows.filter(r => r.traits.some(t => t.code === code)).map(r => ({ id: r.troopId, name: r.troopName })),
        description: rows.flatMap(r => r.traits).find(t => t.code === code)?.description })), runtimeFailures, rows };
    fs.mkdirSync('artifacts/troop-audit', { recursive: true });
    fs.writeFileSync('artifacts/troop-audit/roster.json', JSON.stringify(report, null, 2));
    expect(rows.length).toBe(TROOPS.length);
    expect(runtimeFailures).toEqual([]);
    expect(missingSkills).toEqual([]);
    expect(missingTraits).toEqual([]);
    expect(report.assembly).toMatchObject({ appInjectsKingdomSummonResolver: true,
      appInjectsDaemonPool: true, summonTemplatesWithMissingMetadata: 0,
      playerSnapshotsWithoutKingdom: 0, enemySnapshotsWithoutKingdom: 0, fallbackOnlySkills: [] });
  }, 120_000);
});
