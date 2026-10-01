import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { BaseColor, MatchState, PlayerSide, colorGem, type Character } from '@engine/types';
import { registerSkillLibrary } from '@engine/skills/library';
import { applyTransformTemplate, transformTroopEffect } from '@engine/skills/effects/summon';
import { getTroopByRef, troopToCharacter, troopToSummonTemplate } from '../../src/data/troops';
import { currentFormSnapshot } from '../../src/render/currentFormSnapshot';
import type { CombatantSnapshot } from '@session/contract';

function fixture() {
  let gid = 1;
  const board = new BoardModel();
  const palette = Object.values(BaseColor);
  for (let row = 0; row < BoardModel.ROWS; row++) for (let col = 0; col < BoardModel.COLS; col++) {
    board.set({ row, col }, { id: gid++, type: colorGem(palette[(row * 3 + col * 5) % palette.length]) });
  }
  const baby = getTroopByRef('BabyDragon')!;
  const caster = troopToCharacter(baby, 0);
  caster.mana = caster.manaCost;
  caster.spellName = baby.spell.name;
  caster.spellDescription = baby.spell.description;
  caster.displayTraitIds = ['old-hero-only'];
  caster.traitNames = { 'old-hero-only': '旧特质' };
  const enemy = { ...troopToCharacter(getTroopByRef('Emperina')!, 4), hp: 100000, maxHp: 100000, armor: 100000 };
  const state = createGameState(board, { player: PlayerSide.Left, characters: [caster] },
    { player: PlayerSide.Right, characters: [enemy] });
  const rng = new SeededRNG(42);
  return { caster, enemy, state, rng, ctx: { state, casterId: 0, rng, nextGemId: () => gid++, resolveSummonRef: troopToSummonTemplate } };
}

function snapshot(char: Character): CombatantSnapshot {
  return { externalId: 'stable-host-id', name: char.name, skillId: char.skillId,
    spellName: char.spellName, spellDescription: char.spellDescription, traitNames: char.traitNames,
    stats: { hp: char.maxHp, attack: char.attack, armor: char.armor, magic: char.magic },
    manaColors: [...char.colors], manaCost: char.manaCost };
}

describe('transformation replaces the complete current form', () => {
  it.each([false, true])('reference transformation refreshes skill and traits (arena=%s)', arena => {
    const f = fixture();
    const old = snapshot(f.caster);
    const target = troopToSummonTemplate('Emperina', arena)!;
    const events = transformTroopEffect({ targets: [f.caster], ref: 'Emperina',
      resolveRef: ref => troopToSummonTemplate(ref, arena), fullMana: true }).apply(f.ctx);
    expect(events).toContainEqual(expect.objectContaining({ type: 'troop-transform', targetId: 0, name: target.name }));
    expect(f.caster).toMatchObject({ id: 0, skillId: target.skillId, spellName: target.spellName,
      spellDescription: target.spellDescription, traitNames: target.traitNames,
      mana: target.manaCost, traitIds: target.traitIds, statuses: [] });
    expect(f.caster.displayTraitIds).toBeUndefined();
    expect(currentFormSnapshot(f.caster, old)).toBeUndefined();
    if (arena) expect(f.caster.traitIds).toEqual([]);
  });

  it('custom templates clear absent display fields instead of retaining the old spell', () => {
    const f = fixture();
    const { spellName: _name, spellDescription: _desc, traitNames: _traits, ...template } = troopToSummonTemplate('Emperina')!;
    void _name; void _desc; void _traits;
    applyTransformTemplate(f.caster, template);
    expect(f.caster.spellName).toBeUndefined();
    expect(f.caster.spellDescription).toBeUndefined();
    expect(f.caster.traitNames).toBeUndefined();
    expect(f.caster.displayTraitIds).toBeUndefined();
  });

  it('copy transformation carries new skill metadata without sharing mutable trait displays', () => {
    const f = fixture();
    f.enemy.displayTraitIds = ['new-trait']; f.enemy.traitNames = { 'new-trait': '新特质' };
    transformTroopEffect({ targets: [f.caster], copyOf: [f.enemy] }).apply(f.ctx);
    expect(f.caster.skillId).toBe(f.enemy.skillId);
    expect(f.caster.spellName).toBe(f.enemy.spellName);
    expect(f.caster.traitNames).toEqual(f.enemy.traitNames);
    expect(f.caster.displayTraitIds).toEqual(f.enemy.displayTraitIds);
    f.caster.traitNames!['new-trait'] = 'changed';
    f.caster.displayTraitIds!.push('changed');
    expect(f.enemy.traitNames['new-trait']).toBe('新特质');
    expect(f.enemy.displayTraitIds).toEqual(['new-trait']);
  });

  it('opening metadata remains available only for an unchanged form', () => {
    const { caster } = fixture(); const original = snapshot(caster);
    expect(currentFormSnapshot(caster, original)).toBe(original);
    expect(currentFormSnapshot(caster, undefined)).toBeUndefined();
    caster.skillId = 'changed';
    expect(currentFormSnapshot(caster, original)).toBeUndefined();
    original.skillId = undefined;
    expect(currentFormSnapshot(caster, original)).toBe(original);
    caster.name = 'changed';
    expect(currentFormSnapshot(caster, original)).toBeUndefined();
  });

  it('Baby Dragon casts, transforms through the registered primitive, then really casts the new spell', () => {
    const f = fixture(); const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
    let gid = 10000;
    const engine = new TurnEngine(f.state, f.rng, () => gid++, registry);
    // Pin the randomly requested dragon to a deterministic real dragon for a repeatable second cast.
    engine.setSummonResolver(() => troopToSummonTemplate('Emperina'));
    engine.skullChance = 0;
    const oldSkill = f.caster.skillId;
    const events = engine.castSkill(f.caster.id);
    expect(events).toContainEqual(expect.objectContaining({ type: 'skill-cast', skillId: oldSkill }));
    expect(events.some(e => e.type === 'troop-transform')).toBe(true);
    const dragon = getTroopByRef('Emperina')!;
    expect(f.caster.skillId).toBe(String(dragon.spell.id));
    expect(f.caster.spellName).toBe(dragon.spell.name);
    expect(f.caster.spellDescription).toBe(dragon.spell.description);
    f.state.activePlayer = PlayerSide.Left; f.state.state = MatchState.AwaitingInput;
    f.caster.mana = f.caster.manaCost; f.caster.hp = 1;
    const next = engine.castSkill(f.caster.id);
    expect(next).toContainEqual(expect.objectContaining({ type: 'skill-cast', skillId: String(dragon.spell.id) }));
    expect(next.some(e => e.type === 'troop-transform')).toBe(false);
    expect(f.caster.hp).toBeGreaterThan(1);
  });
});
