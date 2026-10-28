import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { BaseColor, MatchState, PlayerSide, colorGem, snapshotCharacterForm, type Character } from '@engine/types';
import { registerSkillLibrary } from '@engine/skills/library';
import { applyTransformTemplate, summonEffect, summonCopyEffect, transformTroopEffect } from '@engine/skills/effects/summon';
import { getTroopByRef, troopToCharacter, troopToSummonTemplate } from '../../src/data/troops';
import { currentFormSnapshot } from '../../src/render/currentFormSnapshot';
import { tickStatuses } from '@engine/skills/effects/status';
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


describe('event-time character forms', () => {
  it('keeps each form independent through repeated transforms, nested mutations and death', () => {
    const f = fixture();
    const first = transformTroopEffect({ targets: [f.caster], ref: 'Emperina', fullMana: true }).apply(f.ctx)[0];
    expect(first.type).toBe('troop-transform');
    if (first.type !== 'troop-transform') throw new Error('missing transform');
    const expected = snapshotCharacterForm(f.caster);
    const second = transformTroopEffect({ targets: [f.caster], ref: 'BabyDragon' }).apply(f.ctx)[0];
    f.caster.colors.push(BaseColor.Brown);
    f.caster.traitIds!.push('later-trait');
    f.caster.hp = 0; f.caster.defeated = true;
    expect(first.form).toEqual(expected);
    expect(second.type === 'troop-transform' && second.form?.defeated).toBe(false);
    expect(first.form).not.toHaveProperty('passive');
    expect(first.form).not.toBe(f.caster);
    expect(first.form?.colors).not.toBe(f.caster.colors);
  });

  it.each(['ordinary', 'copy'] as const)('captures %s summon before transformation and removal', kind => {
    const f = fixture();
    const events = kind === 'ordinary'
      ? summonEffect({ source: { ref: 'Emperina' } }).apply(f.ctx)
      : summonCopyEffect({ targets: [f.enemy] }).apply(f.ctx);
    const event = events.find(e => e.type === 'summon')!;
    if (event.type !== 'summon') throw new Error('missing summon');
    const summoned = f.state.teams.Left.characters.find(c => c.id === event.characterId)!;
    expect(event.form).toEqual(snapshotCharacterForm(summoned));
    const expected = structuredClone(event.form);
    transformTroopEffect({ targets: [summoned], ref: 'BabyDragon' }).apply(f.ctx);
    summoned.hp = 0; summoned.defeated = true;
    f.state.teams.Left.characters.splice(f.state.teams.Left.characters.indexOf(summoned), 1);
    expect(event.form).toEqual(expected);
    expect(event.form?.defeated).toBe(false);
    expect(event.form?.hp).toBeGreaterThan(0);
  });

  it('captures wolf transformation through the status producer', () => {
    const f = fixture();
    f.caster.statuses = [{ id: 'lycanthropy', turns: 3 }];
    const events = tickStatuses(f.caster, { next: () => 0.12 } as SeededRNG,
      () => troopToSummonTemplate('Emperina')!);
    const event = events.find(e => e.type === 'troop-transform');
    expect(event).toMatchObject({ form: { id: f.caster.id, name: f.caster.name, statuses: [], hp: f.caster.hp } });
    f.caster.hp = 0;
    expect(event?.type === 'troop-transform' && event.form?.hp).toBeGreaterThan(0);
  });

  it('deeply detaches presentation collections and scaling', () => {
    const f = fixture();
    f.caster.battleScaling = { level: 20, difficulty: 1 };
    f.caster.statuses = [{ id: 'poison', turns: 3, magnitude: 2 }];
    const form = snapshotCharacterForm(f.caster);
    f.caster.battleScaling.level = 30;
    f.caster.statuses[0].magnitude = 9;
    f.caster.traitNames!['old-hero-only'] = 'changed';
    f.caster.displayTraitIds!.push('later');
    expect(form.battleScaling?.level).toBe(20);
    expect(form.statuses[0].magnitude).toBe(2);
    expect(form.traitNames!['old-hero-only']).not.toBe('changed');
    expect(form.displayTraitIds).toEqual(['old-hero-only']);
  });
});
