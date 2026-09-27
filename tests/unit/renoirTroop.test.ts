import { describe, expect, it } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { ManaDistributor } from '@engine/ManaDistributor';
import { ExtensionRegistry } from '@engine/registry';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { dmg, skill } from '@engine/skills/builders';
import { getTrait, attachPassives, applyBigMatchTriggers } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { RENOIR_ID, RENOIR_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';

const codes = ['waterlink', 'spellarmor', 'renoir_butterfly_dance'];
const proto = SKILL_LIBRARY[RENOIR_SPELL_ID];
function setup(unlocked = false) {
  const f = damageFixture();
  Object.assign(f.caster, { manaCost: 18, mana: 18, skillId: String(RENOIR_SPELL_ID),
    colors: [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple], traitIds: unlocked ? codes : [] });
  const allies = [damageCharacter(1, { colors: [BaseColor.Green] }),
    damageCharacter(2, { colors: [BaseColor.Green] }), f.caster, damageCharacter(3, { colors: [BaseColor.Green] })];
  f.state.teams[PlayerSide.Left].characters = allies;
  allies.forEach(ally => attachPassives(ally));
  return { ...f, allies };
}

describe('RenoirSideF / 镜月蝶影 / 蝶舞 integration', () => {
  it('preserves the complete Unicode name and registers art, collection, kingdom and battle traits', () => {
    const troop = getTroopById(RENOIR_ID)!;
    expect(troop.name).toBe("ℛℯ𝓃ℴ𝒾𝓇 [→ sideF →]");
    expect(getTroopByRef('RenoirSideF')).toBe(troop);
    expect(TROOPS.filter(t => t.id === RENOIR_ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === RENOIR_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ rarity: 'Epic', rarityIdx: 4, manaCost: 18,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE],
      manaColors: [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple], spell: { name: '镜月蝶影' } });
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('renoir-sidef.png');
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.traits.map(t => t.code)).toEqual(codes);
    codes.forEach(code => { expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
    expect(getTrait(codes[2])?.onBigMatchTypeAura).toEqual({ troopType: 'all', gains: { attack: 2 } });
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, RENOIR_ID);
    const record = getRecord(save, RENOIR_ID)!;
    expect(troopToSnapshot(troop, record, 'renoir').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'renoir')).toMatchObject({ traitIds: codes,
      skillId: String(RENOIR_SPELL_ID), manaCost: 18, portraitUrl: troop.artUrl });
  });
  it.each([0, 10, 99])('at magic %i grants a fixed 8 attack to all allies and reflect only to the first two', magic => {
    const { ctx, allies, caster, enemies } = setup(); caster.magic = magic;
    executePrototype(proto, ctx);
    expect(allies.map(a => a.attack)).toEqual([25, 25, 25, 25]);
    expect(allies.map(a => a.statuses.some(s => s.id === 'reflect'))).toEqual([true, true, false, false]);
    expect(enemies.every(e => e.attack === 17 && e.statuses.length === 0)).toBe(true);
  });
  it('skips defeated allies and handles fewer than two survivors', () => {
    const { ctx, allies } = setup();
    allies[0].defeated = true; allies[0].hp = 0;
    executePrototype(proto, ctx);
    expect(allies.map(a => a.attack)).toEqual([17, 25, 25, 25]);
    expect(allies.map(a => a.statuses.some(s => s.id === 'reflect'))).toEqual([false, true, true, false]);
    allies[1].defeated = true; allies[3].defeated = true;
    executePrototype(proto, ctx);
    expect(allies[2].attack).toBe(33);
    expect(allies[2].statuses.filter(s => s.id === 'reflect')).toHaveLength(1);
  });
  it('casts through TurnEngine, spending exactly 18 mana', () => {
    const { ctx, state, caster, allies } = setup();
    const registry = new ExtensionRegistry(); registry.prototypes.set(String(RENOIR_SPELL_ID), proto);
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, registry);
    const events = engine.castSkill(caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(caster.mana).toBe(0);
    expect(allies.map(a => a.attack)).toEqual([25, 25, 25, 25]);
    expect(events.filter(e => e.type === 'status-apply' && e.statusId === 'reflect')).toHaveLength(2);
  });
  it('refreshes rather than stacks reflect, and consumes it after one reflected hit', () => {
    const { ctx, allies, enemies } = setup();
    executePrototype(proto, ctx); executePrototype(proto, ctx);
    expect(allies[0].statuses.filter(s => s.id === 'reflect')).toHaveLength(1);
    const enemyCtx = { ...ctx, casterId: enemies[0].id, chosenTargetId: allies[0].id };
    const hit = skill(dmg('enemyChosen', 20, 0));
    executePrototype(hit, enemyCtx);
    expect(allies[0].hp).toBe(980);
    expect(enemies[0].hp).toBe(990);
    expect(allies[0].statuses.some(s => s.id === 'reflect')).toBe(false);
    executePrototype(hit, enemyCtx);
    expect(allies[0].hp).toBe(960);
    expect(enemies[0].hp).toBe(990);
  });
  it.each([4, 5])('a %i-match gives all living allies exactly 2 attack, not just the holder', size => {
    const { allies, enemies, ctx } = setup(true);
    allies[3].defeated = true;
    applyBigMatchTriggers(allies, { size, enemyTeam: enemies, rng: ctx.rng });
    expect(allies.map(a => a.attack)).toEqual([19, 19, 19, 17]);
    expect(enemies.every(e => e.attack === 17)).toBe(true);
  });
  it.each(['locked', 'defeated'] as const)('%s butterfly dance does not buff the team', mode => {
    const { allies, caster } = setup(mode !== 'locked');
    if (mode === 'defeated') caster.defeated = true;
    applyBigMatchTriggers(allies, { size: 4 });
    expect(allies.map(a => a.attack)).toEqual([17, 17, 17, 17]);
  });
  it.each([BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple])('waterlink grants bonus only for blue, matching %s', color => {
    const { caster, state } = setup(true); caster.mana = 0;
    new ManaDistributor().distribute(state.teams[PlayerSide.Left], PlayerSide.Left, color, 3);
    expect(caster.mana).toBe(color === BaseColor.Blue ? 4 : 3);
  });
  it('spellarmor reduces actual incoming spell damage by 25%', () => {
    const { ctx, caster, enemies } = setup(true);
    executePrototype(skill(dmg('enemyChosen', 20, 0)), { ...ctx, casterId: enemies[0].id, chosenTargetId: caster.id });
    expect(caster.hp).toBe(985);
  });
  it.each([3, 4, 5])('real %i-match only triggers butterfly dance for four or more', size => {
    const { board, caster, ctx, state, allies } = setup(true);
    for (let col = 0; col < size; col++) board.set({ row: 7, col },
      { id: 57 + col, type: colorGem(col === 2 ? BaseColor.Green : BaseColor.Red) });
    board.set({ row: 6, col: 2 }, { id: 51, type: colorGem(BaseColor.Red) });
    board.set({ row: 5, col: 2 }, { id: 43, type: colorGem(BaseColor.Blue) });
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, new ExtensionRegistry());
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const buffs = events.filter(e => e.type === 'buff' && e.source === 'trait' && e.stat === 'attack');
    if (size === 3) expect(buffs).toHaveLength(0);
    else {
      for (const ally of allies) expect(buffs.some(e => e.type === 'buff' && e.targetId === ally.id && e.amount === 2)).toBe(true);
      expect(caster.attack).toBeGreaterThanOrEqual(19);
    }
  });
});
