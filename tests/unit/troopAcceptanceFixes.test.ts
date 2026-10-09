import { describe, it, expect, vi } from 'vitest';
import { TROOPS, SOURCE_TROOPS, troopToSummonTemplate } from '../../src/data/troops';
import { normalizeCombatText, spellDescription } from '../../src/data/combatText';
import { temporaryAoeDescription } from '../../src/data/temporaryAoeMultipliers';
import { evalMagicExpr, normalizeText } from '../../src/meta/shell/spellText';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { BaseColor, PlayerSide, colorGem, type Character } from '@engine/types';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import type { EffectContext } from '@engine/skills/effects/context';
import { attachPassives, getTrait, TRAIT_LIBRARY } from '@engine/traits';
import { summonEffect, transformTroopEffect } from '@engine/skills/effects/summon';

function fixture(spellId: number) {
  let gid = 1;
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
    board.set({ row: r, col: c }, { id: gid++, type: colorGem((r + c) % 2 ? BaseColor.Red : BaseColor.Blue) });
  const char = (id: number): Character => ({ id, name: `fixture-${id}`, hp: 50, maxHp: 100,
    armor: 0, attack: 10, magic: 7, mana: 0, manaCost: 20, colors: [id === 4 ? BaseColor.Red : BaseColor.Blue],
    skillId: String(spellId), traitIds: [], troopTypes: ['Human'], kingdom: 'old-kingdom', statuses: [], defeated: false });
  const left = [0, 1, 2, 3].map(char), right = [4, 5, 6, 7].map(char);
  const state = createGameState(board, {player: PlayerSide.Left, characters: left}, {player: PlayerSide.Right, characters: right});
  const rng = new SeededRNG(42);
  const ctx: EffectContext = { state, casterId: 0, chosenTargetId: 4, rng, nextGemId: () => gid++, resolveSummonRef: troopToSummonTemplate };
  return { ctx, left, right, run: () => executePrototype(SKILL_LIBRARY[spellId], ctx) };
}

describe('unified project combat wording', () => {
  it('normalizes every displayed troop, trait and fallback definition idempotently while retaining source anchors', () => {
    for (const t of TROOPS) {
      expect(t.spell.description).toBe(temporaryAoeDescription(t.id, spellDescription(t.spell.id, SOURCE_TROOPS.find(s => s.id === t.id)!.spell.description)));
      for (const text of [t.spell.description, ...t.traits.map(x => x.description)]) {
        expect(normalizeText(text)).toBe(text);
        expect(text).not.toMatch(/(?:严重|轻微)(?:的)?\s*溅射|溅射上海/);
      }
      for (const tr of t.traits) expect(getTrait(tr.code)?.description).toBe(normalizeCombatText(getTrait(tr.code)!.description));
    }
    for (const tr of TRAIT_LIBRARY) expect(normalizeText(tr.description)).toBe(tr.description);
  });
  it('preserves true damage, explode/destroy distinctions and scaling formulas', () => {
    expect(normalizeText('严重溅射伤害；轻微的溅射真实伤害；溅射上海')).toBe('重度溅射伤害；真实轻度溅射伤害；溅射伤害');
    expect(normalizeText('摧毁 4 颗宝石；爆破 3 颗宝石；[魔法 + 8]')).toBe('摧毁 4 颗宝石；爆破 3 颗宝石；[魔法 + 8]');
    expect(evalMagicExpr('魔法 + 8', 7)).toBe(15);
  });
});

describe('newly wired project spells: deterministic branch coverage', () => {
  it.each([0.1, 0.9])('Gluttony binds the color source and devour target (roll=%f)', roll => {
    const f = fixture(7810);
    vi.spyOn(f.ctx.rng, 'nextInt').mockReturnValue(0);
    vi.spyOn(f.ctx.rng, 'next').mockReturnValue(roll);
    const events = f.run();
    expect(f.ctx.castTracking?.lastTarget?.id).toBe(4);
    expect(f.ctx.castTracking?.destroyed.length).toBeGreaterThan(0);
    expect(f.right.find(c => c.id === 5)?.hp).toBe(50);
    expect(events.some(e => e.type === 'defeat' && e.characterId === 4)).toBe(roll < 0.2);
  });
  it('Gluttony honors devour immunity and handles absent matching gems / enemies', () => {
    const f = fixture(7810);
    f.right[0].traitIds = ['indigestible']; attachPassives(f.right[0]);
    vi.spyOn(f.ctx.rng, 'nextInt').mockReturnValue(0); vi.spyOn(f.ctx.rng, 'next').mockReturnValue(0);
    expect(f.run().some(e => e.type === 'defeat')).toBe(false);
    const emptyColor = fixture(7810);
    emptyColor.right.forEach(c => c.colors = [BaseColor.Purple]);
    vi.spyOn(emptyColor.ctx.rng, 'next').mockReturnValue(0);
    const ev = emptyColor.run();
    expect(ev.some(e => e.type === 'gem-explode')).toBe(false);
    expect(ev.some(e => e.type === 'defeat')).toBe(true);
    const noEnemy = fixture(7810); noEnemy.ctx.state.teams.Right.characters = [];
    expect(noEnemy.run()).toEqual([]);
  });
  // sa-R5 L1-6808: native Randomize AB-CD-EF = (Damage + Submerge) | (TransformType daemon + TroopOrderBack) | (Consume):
  // the damage belongs to branch 0 only.
  it.each([0, 1, 2])('Krampus resolves exactly one native branch %i on the chosen enemy', branch => {
    const f = fixture(8211);
    vi.spyOn(f.ctx.rng, 'nextInt').mockReturnValueOnce(branch);
    const target = f.right[0];
    const events = f.run();
    if (branch === 0) expect(events[0]).toMatchObject({type: 'skill-damage', targetId: 4, damage: 15});
    else expect(events.some(e => e.type === 'skill-damage' && !(e as {devoured?: boolean}).devoured)).toBe(false);
    expect(events.some(e => e.type === 'troop-transform')).toBe(branch === 1);
    expect(events.some(e => e.type === 'defeat')).toBe(branch === 2);
    expect(target.statuses.some(s => s.id === 'submerged')).toBe(branch === 0);
    if (branch === 1) {
      expect(f.ctx.state.teams.Right.characters.at(-1)?.id).toBe(4);
      expect(target.troopTypes).toContain('Daemon');
      expect(target.kingdom).not.toBe('old-kingdom');
      expect(target.traitIds?.length).toBeGreaterThan(0);
    }
  });
  it('Krampus damage branch does not retarget after lethal damage (no Submerge on another enemy)', () => {
    const f = fixture(8211); f.right[0].hp = 1;
    vi.spyOn(f.ctx.rng, 'nextInt').mockReturnValueOnce(0);
    const events = f.run();
    expect(events.some(e => e.type === 'defeat' && e.characterId === 4)).toBe(true);
    expect(f.ctx.state.teams.Right.characters.map(c => c.hp)).toEqual([50,50,50]);
    expect(events.some(e => e.type === 'troop-transform' || e.type === 'status-apply')).toBe(false);
  });
});

describe('summon metadata survives field entry and transformation', () => {
  it('copies metadata for the available slot and compiles passives before it can be targeted', () => {
    const f = fixture(7004);
    const troop = TROOPS.find(t => t.kingdom && t.traits.some(tr => tr.code === 'indigestible'))!;
    const template = troopToSummonTemplate(troop.referenceName)!;
    f.ctx.state.teams.Left.characters = f.left.slice(0,3);
    const events = summonEffect({source: {template}, countRange: {min: 2, max: 2}}).apply(f.ctx);
    expect(events.map(e => e.type === 'summon' ? e.destination : '')).toEqual(['field']);
    const team = f.ctx.state.teams.Left;
    const active = team.characters.at(-1)!;
    expect(active.kingdom).toBe(troop.kingdom);
    expect(active.traitIds).toEqual(troop.traits.map(t => t.code));
    expect(active.troopTypes).toEqual(troop.troopTypes);
    expect(active.passive?.devourImmunity).toBe(true);
    expect(active.traitIds).not.toBe(template.traitIds);
    expect(team.characters).toHaveLength(4);
    expect(team.summonQueue).toBeUndefined();
    const target = f.right[0];
    transformTroopEffect({targets:[target], ref: troop.referenceName}).apply(f.ctx);
    expect(target.kingdom).toBe(troop.kingdom);
    expect(target.traitIds).toEqual(template.traitIds);
    expect(target.passive?.devourImmunity).toBe(true);
  });

});


