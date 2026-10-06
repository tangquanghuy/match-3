import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { dmgAll, skill } from '@engine/skills/builders';
import { executePrototype } from '@engine/skills/prototypes';
import { applyStatus } from '@engine/skills/effects/status';
import { getTrait, attachPassives, applyBigMatchTriggers } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import type { Character } from '@engine/types';
import { LIANKA_ID, LIANKA_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { rarityNameByIndex } from '../../src/meta/data/rarity';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';

const codes = ['lianka_unquenched', 'lianka_obsidian_robes', 'lianka_eclipse_flame'];
function character(id: number, overrides: Partial<Character> = {}): Character {
  return { id, name: `C${id}`, maxHp: 100, hp: 100, attack: 5, armor: 0, magic: 10,
    colors: [BaseColor.Red, BaseColor.Yellow], manaCost: 15, mana: 15,
    skillId: String(LIANKA_SPELL_ID), statuses: [], defeated: false, ...overrides };
}
function boardWith(red = 0, yellow = 0): BoardModel {
  const board = new BoardModel();
  const other = [BaseColor.Blue, BaseColor.Green, BaseColor.Purple, BaseColor.Brown];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const i = row * 8 + col;
    const color = i < red ? BaseColor.Red : i < red + yellow ? BaseColor.Yellow : other[(row + col) % 4];
    board.set({ row, col }, { id: i + 1, type: colorGem(color) });
  }
  return board;
}
function setup(board = boardWith(), caster = character(0), enemies = [character(10), character(11), character(12), character(13)]) {
  const state = createGameState(board,
    { player: PlayerSide.Left, characters: [caster] },
    { player: PlayerSide.Right, characters: enemies });
  let gid = 1000;
  const rng = new SeededRNG(5);
  const ctx = { state, casterId: caster.id, rng, nextGemId: () => gid++ };
  return { state, ctx, caster, enemies, board };
}

describe('Lianka / 日轮坠灭 / 蚀日魔焰', () => {
  it('registers one Epic red-yellow visitor with portrait and unlockable traits', () => {
    const troop = getTroopById(LIANKA_ID)!;
    expect(getTroopByRef('Lianka')).toBe(troop);
    expect(TROOPS.filter(t => t.id === LIANKA_ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === LIANKA_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name: 'Lianka', rarity: 'Epic', rarityIdx: 4, manaCost: 15,
      kingdom: COMMUNITY_KINGDOM, troopTypes: [COMMUNITY_RACE],
      manaColors: [BaseColor.Red, BaseColor.Yellow], spell: { name: '日轮坠灭' } });
    expect(rarityNameByIndex(troop.rarityIdx)).toBe('史诗');
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troop.artUrl).toContain('lianka.webp');
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.traits.map(t => t.code)).toEqual(codes);
    for (const code of codes) {
      expect(getTrait(code)).toBeDefined();
      expect(metaKnownTraitIds()).toContain(code);
    }
    const save = newSave({ now: 0, starterTroopIds: [] });
    grantTroop(save, LIANKA_ID);
    const record = getRecord(save, LIANKA_ID)!;
    expect(troopToSnapshot(troop, record, 'lianka').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(troop, record, 'lianka')).toMatchObject({
      traitIds: codes, skillId: String(LIANKA_SPELL_ID), portraitUrl: troop.artUrl, manaCost: 15,
    });
  });

  it.each([[0, 0], [3, 0], [3, 1], [16, 16], [32, 32]])(
    '%i red + %i yellow creates yellow then red and uses final normal gem count / 3', (red, yellow) => {
      const { ctx, enemies, board, caster } = setup(boardWith(red, yellow));
      const proto = SKILL_LIBRARY[LIANKA_SPELL_ID];
      expect(proto.segments.map(s => s.kind)).toEqual(['gem', 'gem', 'damage']);
      const events = executePrototype(proto, ctx);
      expect(events.filter(e => e.type === 'gem-transform').slice(0, 2)
        .map(e => e.changes[0]?.to)).toEqual([colorGem(BaseColor.Yellow), colorGem(BaseColor.Red)]);
      const count = { [BaseColor.Red]: 0, [BaseColor.Yellow]: 0 } as Record<string, number>;
      board.forEach(gem => {
        if (gem?.type.kind === 'color' && gem.type.color in count) count[gem.type.color]!++;
      });
      const damage = caster.magic + 6 + Math.floor((count[BaseColor.Red]! + count[BaseColor.Yellow]!) / 3);
      expect(enemies.map(e => e.hp)).toEqual(Array(4).fill(100 - damage));
      expect(events.filter(e => e.type === 'skill-damage')).toHaveLength(4);
      if (red === 0 && yellow === 0) {
        expect(count[BaseColor.Yellow]).toBe(6);
        expect(count[BaseColor.Red]).toBe(6);
        expect(damage).toBe(20);
      }
      expect(caster.mana).toBe(15);
    });

  it('uses caster magic plus six as base damage', () => {
    const { ctx, enemies } = setup(boardWith(), character(0, { magic: 21 }));
    executePrototype(SKILL_LIBRARY[LIANKA_SPELL_ID], ctx);
    expect(enemies.map(e => e.hp)).toEqual([69, 69, 69, 69]);
  });

  it('excludes colored special gems, respects armor, and skips defeated enemies', () => {
    const board = boardWith(3, 0);
    for (let i = 3; i < 8; i++) board.set({ row: 0, col: i }, {
      id: i + 1, type: specialGem('dragonGem', undefined, i % 2 ? BaseColor.Red : BaseColor.Yellow),
    });
    const enemies = [character(10, { armor: 50 }), character(11, { armor: 5 }), character(12, { hp: 0, defeated: true })];
    const { ctx } = setup(board, character(0), enemies);
    const events = executePrototype(SKILL_LIBRARY[LIANKA_SPELL_ID], ctx);
    let normal = 0;
    board.forEach(gem => { if (gem?.type.kind === 'color' && [BaseColor.Red, BaseColor.Yellow].includes(gem.type.color)) normal++; });
    const damage = 16 + Math.floor(normal / 3);
    expect(events.filter(e => e.type === 'skill-damage')).toHaveLength(2);
    expect(enemies[0].hp).toBe(100);
    expect(enemies[2].hp).toBe(0);
    expect(enemies[0].armor).toBe(50 - damage);
    expect(enemies[1].hp).toBe(100 - (damage - 5));
  });

  it('casts through TurnEngine, spends mana and spends the turn', () => {
    const { state, caster, ctx } = setup();
    const registry = new ExtensionRegistry();
    registry.prototypes.set(String(LIANKA_SPELL_ID), SKILL_LIBRARY[LIANKA_SPELL_ID]);
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, registry);
    const events = engine.castSkill(caster.id);
    expect(events[0]).toMatchObject({ type: 'skill-cast' });
    expect(events.filter(e => e.type === 'skill-damage')).toHaveLength(4);
    expect(caster.mana).toBe(0);
    expect(state.activePlayer).toBe(PlayerSide.Right);
    expect(events.some(e => e.type === 'turn-end')).toBe(true);
  });

  it('blocks burning and faerie-fire, but still permits poison', () => {
    const holder = character(0, { traitIds: codes });
    attachPassives(holder);
    for (const id of ['burning', 'faerie-fire', 'poison']) applyStatus(holder, { id, turns: 3 });
    expect(holder.statuses.map(s => s.id)).toEqual(['poison']);
  });

  it('reduces incoming spell damage by 25% using the actual damage primitive', () => {
    const protectedTarget = character(10, { traitIds: codes });
    attachPassives(protectedTarget);
    const { ctx } = setup(boardWith(), character(0), [protectedTarget, character(11)]);
    executePrototype(skill(dmgAll(10)), ctx); // magic 10 + base 10
    expect(protectedTarget.hp).toBe(85);
    expect(ctx.state.teams[PlayerSide.Right].characters[1].hp).toBe(80);
  });

  it.each([4, 5])('a %i-match applies 3-turn faerie-fire to exactly one living enemy', size => {
    const holder = character(0, { traitIds: codes });
    attachPassives(holder);
    const enemies = [character(10), character(11), character(12, { hp: 0, defeated: true })];
    applyBigMatchTriggers([holder], { size, enemyTeam: enemies, rng: new SeededRNG(5), applyStatus });
    expect(enemies.flatMap(e => e.statuses)).toEqual([{ id: 'faerie-fire', turns: 3 }]);
    expect(enemies[2].statuses).toEqual([]);
  });

  it('applies faerie-fire to a fresh enemy before any already affected enemy', () => {
    const holder = character(0, { traitIds: codes });
    attachPassives(holder);
    const enemies = [character(10), character(11), character(12)];
    applyStatus(enemies[0], { id: 'faerie-fire', turns: 3 });
    applyStatus(enemies[1], { id: 'faerie-fire', turns: 3 });
    const first = applyBigMatchTriggers([holder], { size: 4, enemyTeam: enemies, rng: new SeededRNG(5), applyStatus });
    expect(first.filter(e => e.type === 'status-apply' && e.statusId === 'faerie-fire')).toMatchObject([{ targetId: 12 }]);
    const exhausted = applyBigMatchTriggers([holder], { size: 4, enemyTeam: enemies, rng: new SeededRNG(5), applyStatus });
    expect(exhausted.some(e => e.type === 'status-apply' && e.statusId === 'faerie-fire')).toBe(false);
  });

  it.each(['three-match', 'locked', 'defeated'])('%s does not trigger the trait', mode => {
    const holder = character(0, { traitIds: mode === 'locked' ? [] : codes, defeated: mode === 'defeated' });
    attachPassives(holder);
    const enemy = character(10);
    applyBigMatchTriggers([holder], { size: mode === 'three-match' ? 3 : 4,
      enemyTeam: [enemy], rng: new SeededRNG(5), applyStatus });
    expect(enemy.statuses).toEqual([]);
  });

  it.each([4, 5])('triggers faerie-fire from a real %i-match in TurnEngine', size => {
    const board = boardWith();
    for (let col = 0; col < size; col++) board.set({ row: 7, col }, {
      id: 57 + col, type: colorGem(col === 2 ? BaseColor.Green : BaseColor.Red),
    });
    board.set({ row: 6, col: 2 }, { id: 51, type: colorGem(BaseColor.Red) });
    board.set({ row: 5, col: 2 }, { id: 43, type: colorGem(BaseColor.Blue) });
    const holder = character(0, { traitIds: codes });
    const { state, ctx } = setup(board, holder);
    const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, new ExtensionRegistry());
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const hits = events.filter(e => e.type === 'status-apply' && e.statusId === 'faerie-fire');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({ turns: 3 });
  });
});
