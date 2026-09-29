import { describe, expect, it, vi } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { ManaDistributor } from '@engine/ManaDistributor';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { getTrait, resolvePassives, applyBigMatchTriggers, applyBattleStartTraits } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem, type Character } from '@engine/types';
import { inflict, reduce, skill } from '@engine/skills/builders';
import { GUANLI_OBSERVER_ID, GUANLI_OBSERVER_SPELL_ID, HONGDIE_ID, HONGDIE_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';

const SURGE = 'guanli_hidden_scale_surge';
function character(id: number, overrides: Partial<Character> = {}): Character {
  return { id, name: `C${id}`, hp: 100, maxHp: 100, attack: 8, armor: 0, magic: 10,
    colors: [BaseColor.Blue], manaCost: 26, mana: 10, skillId: 'none', statuses: [], defeated: false, ...overrides };
}
function setup(id: number, unlocked = false, seed = 10014) {
  const troop = getTroopById(id)!;
  const board = new BoardModel();
  const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  let gemId = 1;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++)
    board.set({ row, col }, { id: gemId++, type: colorGem(palette[(row + col * 2) % 6]!) });
  const traitIds = unlocked ? troop.traits.map(t => t.code) : [];
  const caster = character(1, { colors: troop.manaColors, skillId: String(troop.spell.id), mana: troop.manaCost,
    manaCost: troop.manaCost, traitIds, passive: resolvePassives(traitIds) });
  const enemies = [10, 11, 12, 13].map(id => character(id));
  const allies = [caster, character(2)];
  const state = createGameState(board, { player: PlayerSide.Left, characters: allies }, { player: PlayerSide.Right, characters: enemies });
  const ctx = { state, casterId: caster.id, rng: new SeededRNG(seed), nextGemId: () => gemId++ };
  return { troop, board, caster, allies, enemies, state, ctx };
}

describe('管理组重点观察对象与虹蝶：图鉴及战斗接入', () => {
  it.each([
    [GUANLI_OBSERVER_ID, '管理组重点观察对象', 'GuanliObserver', 'Legendary', 5, 26, GUANLI_OBSERVER_SPELL_ID, '灵泉凝露', 'guanli-observer.png', ['waterheart', 'manashield', SURGE]],
    [HONGDIE_ID, '虹蝶', 'HongDie', 'UltraRare', 3, 13, HONGDIE_SPELL_ID, '夜蝶迷踪', 'hongdie.png', ['magiclink', 'alert', 'arcane']],
  ] as const)('%s has a unique identity, portrait, traits, collection and spell', (id, name, ref, rarity, rarityIdx, cost, spellId, spellName, portrait, traits) => {
    const troop = getTroopById(id)!;
    expect(getTroopByRef(ref)).toBe(troop);
    expect(TROOPS.filter(t => t.id === id)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === spellId)).toHaveLength(1);
    expect(troop).toMatchObject({ name, rarity, rarityIdx, manaCost: cost, kingdom: COMMUNITY_KINGDOM,
      troopTypes: [COMMUNITY_RACE], spell: { id: spellId, name: spellName } });
    expect(troop.traits.map(t => t.code)).toEqual(traits);
    expect(troop.manaColors).toEqual(id === GUANLI_OBSERVER_ID
      ? [BaseColor.Green, BaseColor.Blue, BaseColor.Purple] : [BaseColor.Red, BaseColor.Blue, BaseColor.Purple]);
    expect(troop.artUrl).toContain(portrait);
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(SKILL_LIBRARY[spellId]).toBeDefined();
    for (const code of traits) {
      expect(getTrait(code)).toBeDefined();
      expect(metaKnownTraitIds()).toContain(code);
    }
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, id);
    const record = getRecord(save, id)!;
    expect(troopToSnapshot(troop, record, ref).traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, ref)).toMatchObject({ name, traitIds: traits,
      skillId: String(spellId), manaCost: cost, portraitUrl: troop.artUrl });
  });

  it('灵泉凝露 first creates one blue and one purple potion, then explodes four random gems', () => {
    const { ctx } = setup(GUANLI_OBSERVER_ID);
    const prototype = SKILL_LIBRARY[GUANLI_OBSERVER_SPELL_ID];
    expect(prototype.segments).toMatchObject([
      { kind: 'gem', params: { op: 'create', gem: { kind: 'special', spec: { kind: 'manaPotionGem', color: BaseColor.Blue } }, count: { base: 1, mult: 0 } } },
      { kind: 'gem', params: { op: 'create', gem: { kind: 'special', spec: { kind: 'manaPotionGem', color: BaseColor.Purple } }, count: { base: 1, mult: 0 } } },
      { kind: 'gem', params: { op: 'clear', mode: 'explode', target: { kind: 'randomGems', count: { base: 4, mult: 0 } } } },
    ]);
    const events = executePrototype(prototype, ctx);
    const transforms = events.filter(e => e.type === 'gem-transform');
    expect(transforms.slice(0, 2).map(e => e.changes.map(c => c.to))).toEqual([
      [{ kind: 'special', spec: { kind: 'manaPotionGem', color: BaseColor.Blue } }],
      [{ kind: 'special', spec: { kind: 'manaPotionGem', color: BaseColor.Purple } }],
    ]);
    expect(events.findIndex(e => e.type === 'gem-explode')).toBeGreaterThan(events.indexOf(transforms[1]!));
    expect(events.some(e => e.type === 'gem-explode')).toBe(true);
  });

  it.each([3, 4, 5, 6])('潜鳞惊澜 triggers exactly two explosion centres for a %i-match', size => {
    const { allies } = setup(GUANLI_OBSERVER_ID, true);
    const explodeSpec = vi.fn(() => []);
    applyBigMatchTriggers(allies, { size, explodeSpec });
    expect(explodeSpec).toHaveBeenCalledTimes(size >= 4 ? 1 : 0);
    if (size >= 4) expect(explodeSpec).toHaveBeenCalledWith({ kind: 'random', tier: undefined, color: '', count: 2 });
  });
  it.each(['locked', 'dead', 'stunned'])('潜鳞惊澜 does not trigger when %s', mode => {
    const { allies, caster } = setup(GUANLI_OBSERVER_ID, mode !== 'locked');
    if (mode === 'dead') caster.defeated = true;
    if (mode === 'stunned') caster.statuses = [{ id: 'stun', turns: 3 }];
    const explodeSpec = vi.fn(() => []);
    applyBigMatchTriggers(allies, { size: 4, explodeSpec });
    expect(explodeSpec).not.toHaveBeenCalled();
  });
  it.each([3, 4, 5])('a real %i-match routes 潜鳞惊澜 through TurnEngine', size => {
    const { board, state, ctx } = setup(GUANLI_OBSERVER_ID, true);
    for (let col = 0; col < size; col++) board.set({ row: 7, col },
      { id: 57 + col, type: colorGem(col === 2 ? BaseColor.Green : BaseColor.Red) });
    board.set({ row: 6, col: 2 }, { id: 51, type: colorGem(BaseColor.Red) });
    board.set({ row: 5, col: 2 }, { id: 43, type: colorGem(BaseColor.Blue) });
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, new ExtensionRegistry());
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.some(e => e.type === 'gem-explode')).toBe(size >= 4);
  });
  it('水系之心 counts living blue allies, including self; 法力之盾 blocks mana drain', () => {
    const { allies, enemies, caster, ctx } = setup(GUANLI_OBSERVER_ID, true);
    applyBattleStartTraits(allies, enemies);
    expect(caster.hp).toBe(102);
    const manaBefore = caster.mana;
    executePrototype(skill(reduce('enemyChosen', 'mana', 7, 0)), { ...ctx, casterId: enemies[0].id, chosenTargetId: caster.id });
    expect(caster.mana).toBe(manaBefore);
    expect(caster.passive?.manaOpsImmunity).toBe(true);
  });

  it.each([0, 10, 25])('夜蝶迷踪 at magic %i damages/silences/drains only the last two enemies', magic => {
    const { caster, enemies, ctx } = setup(HONGDIE_ID);
    caster.magic = magic;
    executePrototype(SKILL_LIBRARY[HONGDIE_SPELL_ID], ctx);
    expect(enemies.map(e => e.hp)).toEqual([100, 100, 100 - magic - 3, 100 - magic - 3]);
    expect(enemies.map(e => e.mana)).toEqual([10, 10, 7, 7]);
    expect(enemies.map(e => e.statuses.some(s => s.id === 'silence'))).toEqual([false, false, true, true]);
  });
  it('does not redirect debuffs when the original rear targets die', () => {
    const { enemies, ctx } = setup(HONGDIE_ID);
    const rearTargets = enemies.slice(2);
    rearTargets.forEach(e => { e.hp = 1; });
    executePrototype(SKILL_LIBRARY[HONGDIE_SPELL_ID], ctx);
    expect(enemies.slice(0, 2).map(e => [e.hp, e.mana, e.statuses.length])).toEqual([[100, 10, 0], [100, 10, 0]]);
    expect(rearTargets.every(e => e.defeated)).toBe(true);
  });
  it('only debuffs the surviving original target when the other rear target dies', () => {
    const { enemies, ctx } = setup(HONGDIE_ID);
    const front = enemies.slice(0, 2);
    const survivor = enemies[2];
    enemies[3].hp = 1;
    executePrototype(SKILL_LIBRARY[HONGDIE_SPELL_ID], ctx);
    expect(front.map(e => [e.hp, e.mana, e.statuses.length])).toEqual([[100, 10, 0], [100, 10, 0]]);
    expect(survivor).toMatchObject({ hp: 87, mana: 7 });
    expect(survivor.statuses.some(s => s.id === 'silence')).toBe(true);
  });
  it('handles one survivor and clamps mana drain at zero', () => {
    const { enemies, ctx } = setup(HONGDIE_ID);
    for (const e of enemies.slice(0, 3)) { e.hp = 0; e.defeated = true; }
    enemies[3].mana = 2;
    executePrototype(SKILL_LIBRARY[HONGDIE_SPELL_ID], ctx);
    expect(enemies[3]).toMatchObject({ hp: 87, mana: 0 });
    expect(enemies[3].statuses.some(s => s.id === 'silence')).toBe(true);
  });
  it('respects silence and mana-drain immunities independently', () => {
    const { enemies, ctx } = setup(HONGDIE_ID);
    enemies[2].traitIds = ['alert']; enemies[2].passive = resolvePassives(['alert']);
    enemies[3].traitIds = ['manashield']; enemies[3].passive = resolvePassives(['manashield']);
    executePrototype(SKILL_LIBRARY[HONGDIE_SPELL_ID], ctx);
    expect(enemies[2]).toMatchObject({ hp: 87, mana: 7, statuses: [] });
    expect(enemies[3]).toMatchObject({ hp: 87, mana: 10 });
    expect(enemies[3].statuses.some(s => s.id === 'silence')).toBe(true);
  });
  it('虹蝶 has working purple link and silence immunity', () => {
    const { caster, ctx, state, enemies } = setup(HONGDIE_ID, true);
    caster.mana = 0;
    new ManaDistributor().distribute(state.teams[PlayerSide.Left], PlayerSide.Left, BaseColor.Purple, 3);
    expect(caster.mana).toBe(4);
    executePrototype(skill(inflict('silence', 'enemyChosen')), { ...ctx, casterId: enemies[0].id, chosenTargetId: caster.id });
    expect(caster.statuses).toEqual([]);
  });
  it.each([GUANLI_OBSERVER_ID, HONGDIE_ID])('%s casts through TurnEngine with its real mana cost and traits', id => {
    const { caster, state, ctx, troop } = setup(id, true);
    const registry = new ExtensionRegistry();
    registry.prototypes.set(String(troop.spell.id), SKILL_LIBRARY[troop.spell.id]);
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, registry);
    const events = engine.castSkill(caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(caster.mana).toBeLessThanOrEqual(caster.manaCost);
    if (id === HONGDIE_ID) {
      expect(caster.mana).toBe(0);
      expect(caster.magic).toBe(11); // 秘法：施法后的既有盟友施法钩子
    } else {
      expect(events.some(e => e.type === 'gem-explode')).toBe(true);
    }
  });
});
