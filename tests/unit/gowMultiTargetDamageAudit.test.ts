// @ts-expect-error Node types are not installed in the application build.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registerSkillLibrary } from '@engine/skills/library';
import { executePrototype, type DamageSegment } from '@engine/skills/prototypes';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { damageFixture } from '../helpers/damageFixture';

// The inventory selects candidate spells; the expected victim count is read
// independently from the original English clause, not the assembled n/range.
const ledger = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
// @ts-expect-error independent source-text oracle is a Node .mjs module
import { sourceMultiTargetCount, sourceMultiTargetSegments } from '../../scripts/lib/gow-multi-target-oracle.mjs';
const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);
type AuditRow = {
  key: string; kind: string; spellId: number; source: { englishDescription: string; native: { SpellSteps: Array<{ Type: string; Target?: string }> } };
  runtime: { prototype?: { segments: DamageSegment[] } };
};
const cases = (ledger.rows as AuditRow[]).flatMap(row => {
  const segments: DamageSegment[] = sourceMultiTargetSegments(row);
  return segments.flatMap((segment, ordinal) => {
    const expected = sourceMultiTargetCount(row.source.englishDescription, segment.target);
    return expected !== null && expected > 1 ? [{ row, segment, ordinal, expected }] : [];
  });
});
function runtime(row: AuditRow) {
  const key = row.key.startsWith('weapon:') ? String(row.spellId) : String(row.spellId);
  return registry.prototypes.get(key)!;
}

describe('multi-victim damage compared with repository native/English snapshot', () => {
  it('covers a substantial explicit-quantity cross-section of original spells', () => {
    expect(cases.length).toBeGreaterThan(120);
    // 9016 (troop:7376) left this set: native RandomEnemy + 3 x RandomPrefNotPrevEnemy (R007-3, sa-H) is a chain, not N distinct victims
    for (const id of [7012, 7418, 7748, 8752, 9777, 7949, 8072]) {
      expect(cases.some(c => c.row.spellId === id)).toBe(true);
    }
  });
  for (const { row, segment, expected, ordinal } of cases) {
    it(`${row.key}/${row.spellId} segment ${ordinal}: ${expected} victims`, () => {
      // Separate spell segment: isolates targeting/damage from summons, board changes,
      // conditional riders and effects not yet signed off for this entity.
      const f = damageFixture(0, 0, [{}, {}, {}, {}]);
      f.caster.magic = 11;
      const selected = runtime(row).segments.flatMap(s => s.kind === 'choose' ? s.options.flat() : [s]);
      const actual = selected.filter(s => s.kind === 'damage' && s.target === segment.target && !s.range)[ordinal];
      if (!actual) {
        // Fix round A split some "N enemies" spells into one damage segment per native step (each step has
        // its own rider: stun, drain, poison...). Then the N victims come from the damage segments together.
        const perStep = selected.filter(s => s.kind === 'damage') as DamageSegment[];
        expect(perStep.length).toBeGreaterThanOrEqual(expected);
        const hits = executePrototype({ segments: perStep }, f.ctx).filter(e => e.type === 'skill-damage');
        expect(hits.length).toBeGreaterThanOrEqual(expected);
        expect(hits.every(e => e.damage > 0)).toBe(true);
        return;
      }
      const events = executePrototype({ segments: [actual] }, f.ctx);
      const hits = events.filter(e => e.type === 'skill-damage');
      expect(hits).toHaveLength(expected);
      if ((actual as DamageSegment).randomWaves !== undefined) {
        // R007-3: native RandomEnemy + RandomPrefNotPrevEnemy steps avoid only the previous victim.
        expect(hits.every((h, i) => i === 0 || h.targetId !== hits[i - 1].targetId)).toBe(true);
      } else {
        expect(new Set(hits.map(e => e.targetId)).size).toBe(Math.min(4, expected));
        if (expected > 4) expect(new Set(hits.slice(0, 4).map(e => e.targetId)).size).toBe(4);
      }
      expect(hits.every(e => e.damage > 0)).toBe(true);
    });
  }
  for (const [id, targets] of [[7012, [10, 11]], [7418, [10, 11, 12]],
    [7748, [10, 11]], [7546, [10, 11, 12, 13]]] as const) {
    it(`TurnEngine ${id}: original source multi-target spell actually damages ${targets.length} enemies`, () => {
      const row = (ledger.rows as AuditRow[]).find(r => r.spellId === id)!;
      expect(row.source.englishDescription).toMatch(/(?:first 2|3 random|2 weakest|all enemies)/i);
      const f = damageFixture();
      f.caster.skillId = String(id); f.caster.mana = f.caster.manaCost = 100;
      const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
      engine.skullChance = 0;
      const hits = engine.castSkill(f.caster.id).filter(e => e.type === 'skill-damage');
      expect(hits).toHaveLength(targets.length);
      // 7748 "2 weakest" on four equal enemies: R005 breaks the tie with the RNG.
      if (id !== 7418 && id !== 7748) expect(hits.map(h => h.targetId)).toEqual(targets);
      // 7418: native RandomEnemy + 2 x RandomPrefNotPrevEnemy (R007-3, sa-R4): 3 hits, never the previous victim twice.
      else if (id === 7418) expect(hits.every((h, i) => i === 0 || h.targetId !== hits[i - 1].targetId)).toBe(true);
      else expect(new Set(hits.map(h => h.targetId)).size).toBe(targets.length);
      expect(hits.every(h => h.damage > 0)).toBe(true);
    });
  }
  it('five/six-step native random spells are represented as actual sequential waves', () => {
    for (const [id, count] of [[8288, 6], [8410, 6], [9377, 5], [9721, 5]]) {
      const row = (ledger.rows as AuditRow[]).find(r => r.spellId === id)!;
      expect(row.source.englishDescription).toMatch(new RegExp(`${count} random enemies`, 'i'));
      expect(row.source.native.SpellSteps.filter(s => /Damage/.test(s.Type) && /Random.*Enemy/.test(s.Target ?? '')))
        .toHaveLength(count);
      expect(sourceMultiTargetSegments(row)).toHaveLength(1);
      expect(sourceMultiTargetSegments(row)[0].randomWaves).toBe(count);
    }
  });
  for (const [id, count] of [[8288, 6], [8410, 6], [9377, 5], [9721, 5]]) {
    it(`native ${id}: one-survivor sequence still receives ${count} separate hits`, () => {
      const row = (ledger.rows as AuditRow[]).find(r => r.spellId === id)!;
      const segment = runtime(row).segments.find(s => s.kind === 'damage' && s.target === 'enemyRandomN')!;
      const f = damageFixture(0, 0, [{}]);
      const hits = executePrototype({ segments: [segment] }, f.ctx).filter(e => e.type === 'skill-damage');
      expect(hits).toHaveLength(count);
      expect(hits.every(hit => hit.targetId === 10)).toBe(true);
      expect(hits[count - 1].resultingHp).toBeLessThan(hits[0].resultingHp);
    });
  }
  for (const [id, count] of [[8288, 6], [8410, 6], [9377, 5], [9721, 5]]) {
    it(`TurnEngine ${id}: full registered spell resolves ${count} random damage steps`, () => {
      const f = damageFixture();
      f.caster.skillId = String(id);
      f.caster.mana = f.caster.manaCost = 100;
      const engine = new TurnEngine(f.state, new SeededRNG(2368), f.ctx.nextGemId, registry);
      engine.skullChance = 0;
      engine.setCellChooser({ choose: () => ({ row: 3, col: 4 }) });
      const events = engine.castSkill(f.caster.id);
      const hits = events.filter(e => e.type === 'skill-damage');
      expect(events.some(e => e.type === 'skill-cast')).toBe(true);
      expect(hits).toHaveLength(count);
      // R007-3: each RandomPrefNotPrevEnemy step avoids only the immediately previous victim.
      expect(hits.every((h, i) => i === 0 || h.targetId !== hits[i - 1].targetId)).toBe(true);
      expect(new Set(hits.map(hit => hit.targetId)).size).toBeGreaterThan(1);
    });
  }
  it('native 8410 RandomHighDamage rolls its range separately for each hit', () => {
    const row = (ledger.rows as AuditRow[]).find(r => r.spellId === 8410)!;
    const segment = runtime(row).segments.find(s => s.kind === 'damage' && s.randomWaves === 6)!;
    const f = damageFixture();
    f.caster.magic = 32;
    const hits = executePrototype({ segments: [segment] }, f.ctx).filter(e => e.type === 'skill-damage');
    expect(hits).toHaveLength(6);
    expect(new Set(hits.map(hit => hit.damage)).size).toBeGreaterThan(1);
    for (const hit of hits) expect(hit.damage).toBeGreaterThanOrEqual(21);
  });
  it('native 8288 stops picking defeated targets and retains original shot count while survivors remain', () => {
    const row = (ledger.rows as AuditRow[]).find(r => r.spellId === 8288)!;
    const segment = runtime(row).segments.find(s => s.kind === 'damage' && s.randomWaves === 6)!;
    const f = damageFixture(0, 0, [{ hp: 1 }, {}, {}, {}]);
    const hits = executePrototype({ segments: [segment] }, f.ctx).filter(e => e.type === 'skill-damage');
    expect(hits).toHaveLength(6);
    expect(hits.filter(hit => hit.targetId === 10).length).toBeLessThanOrEqual(1);
    expect(hits.filter(hit => hit.targetId === 10).every(hit => hit.resultingHp === 0)).toBe(true);
  });
  it('native 8305: guaranteed last enemy, optional penultimate; never duplicate last hit', () => {
    const original = (ledger.rows as AuditRow[]).find(row => row.spellId === 8305)!;
    expect(original.source.native.SpellSteps.filter(s => s.Type === 'TrueDamage').map(s => s.Target))
      .toEqual(['SecondLastEnemy', 'LastEnemy']);
    const proto = runtime(original);
    expect(proto.segments.filter(s => s.kind === 'damage').map(s => [s.target, s.chance]))
      // native step order (sa-C r9, R001): 50% SecondLastEnemy first, then the guaranteed LastEnemy
      .toEqual([['enemySecondLast', 0.5], ['enemyLast', undefined]]);
    const observed = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const f = damageFixture();
      f.caster.skillId = '8305'; f.caster.mana = 30;
      const engine = new TurnEngine(f.state, new SeededRNG(seed), f.ctx.nextGemId, registry);
      engine.skullChance = 0;
      const ids = engine.castSkill(f.caster.id).filter(e => e.type === 'skill-damage').map(e => e.targetId);
      expect(ids[ids.length - 1]).toBe(13);
      expect(ids.slice(0, -1).every(id => id === 12)).toBe(true);
      expect(ids.length).toBeLessThanOrEqual(2);
      observed.add(ids.length);
    }
    expect(observed).toEqual(new Set([1, 2]));
    const solo = damageFixture(0, 0, [{}]);
    expect(executePrototype(proto, solo.ctx).filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual([10]);
  });
});
