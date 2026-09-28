import { describe, it, expect } from 'vitest';
import { BoardModel } from '../../src/engine/BoardModel';
import { createGameState } from '../../src/engine/GameState';
import { SeededRNG } from '../../src/engine/rng';
import { collectWeaponCurated } from '../../src/engine/skills/curated';
import { executePrototype } from '../../src/engine/skills/prototypes';
import type { EffectContext } from '../../src/engine/skills/effects/context';
import { BaseColor, PlayerSide, colorGem, specialGem } from '../../src/engine/types';
import type { Character, Team } from '../../src/engine/types';

const weapons = collectWeaponCurated().byId;
function character(id: number): Character {
  return { id, name: `unit-${id}`, hp: 100, maxHp: 100, armor: 0, attack: 5, magic: 7,
    mana: 20, manaCost: 20, colors: [BaseColor.Red], skillId: 'none', statuses: [], defeated: false };
}
function cast(id: number, setup?: (ctx: EffectContext) => void) {
  const board = new BoardModel();
  let gemId = 1;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    board.set({ row, col }, { id: gemId++, type: colorGem(BaseColor.Blue) });
  }
  board.set({ row: 0, col: 2 }, { id: gemId++, type: colorGem(BaseColor.Red) });
  board.set({ row: 7, col: 2 }, { id: gemId++, type: colorGem(BaseColor.Red) });
  const allies = [character(1), character(2), character(3)];
  const enemies = [character(5), character(6), character(7)];
  const state = createGameState(board,
    { player: PlayerSide.Left, characters: allies } as Team,
    { player: PlayerSide.Right, characters: enemies } as Team);
  const ctx: EffectContext = { state, casterId: 1, chosenTargetId: id === 7986 || id === 8668 ? 5 : 2,
    chosenCell: { row: 3, col: 3 }, rng: new SeededRNG(11), nextGemId: () => gemId++ };
  setup?.(ctx);
  const proto = weapons.get(id);
  expect(proto, `missing weapon ${id}`).toBeDefined();
  const events = executePrototype(proto!, ctx);
  return { ctx, events, allies, enemies };
}

describe('GoW weapon native-step repair regressions', () => {

  it('7071 explodes a random Gem rather than dealing an unrelated front-target hit', () => {
    const { events } = cast(7071);
    expect(events.some(e => e.type === 'gem-explode')).toBe(true);
    expect(events.some(e => e.type === 'skill-damage')).toBe(false);
  });

  it('8668 curses and gives every negative effect to the enemy, then every positive effect to self', () => {
    const { events, allies, enemies } = cast(8668);
    expect(enemies[0].statuses.some(s => s.id === 'curse')).toBe(true);
    expect(enemies[0].statuses.some(s => s.id === 'poison')).toBe(true);
    expect(new Set(allies[0].statuses.map(s => s.id))).toEqual(new Set([
      'barrier', 'blessed', 'enchanted', 'enraged', 'reflect', 'submerged',
    ]));
    expect(events.filter(e => e.type === 'status-apply').length).toBeGreaterThan(10);
  });

  it('8518 burns one random enemy per destroyed Purple Gem instead of retargeting just one', () => {
    const { events } = cast(8518, ctx => {
      ctx.chosenCell = { row: 3, col: 3 };
      ctx.state.board.set({ row: 3, col: 0 }, { id: 1004, type: colorGem(BaseColor.Purple) });
      ctx.state.board.set({ row: 3, col: 1 }, { id: 1005, type: colorGem(BaseColor.Purple) });
    });
    expect(events.filter(e => e.type === 'status-apply')).toHaveLength(2);
  });

  it('7986 inflicts 1–4 negative statuses on the selected enemy before exploding gems', () => {
    const { events, enemies } = cast(7986);
    const statuses = events.filter(e => e.type === 'status-apply');
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    expect(statuses.length).toBeLessThanOrEqual(4);
    expect(enemies.slice(1).every(e => e.statuses.length === 0)).toBe(true);
    expect(events.findIndex(e => e.type === 'gem-explode')).toBeGreaterThan(0);
  });

  it('7996 hits the enemies once and gives each ally 1–2 positive statuses', () => {
    const { events, allies } = cast(7996);
    expect(events.some(e => e.type === 'skill-damage')).toBe(true);
    for (const ally of allies) {
      expect(ally.statuses.length).toBeGreaterThanOrEqual(1);
      expect(ally.statuses.length).toBeLessThanOrEqual(2);
    }
  });

  it('8084 grants every positive status to the chosen ally and then explodes their mana color', () => {
    const { allies, events } = cast(8084);
    expect(new Set(allies[1].statuses.map(s => s.id))).toEqual(new Set([
      'barrier', 'blessed', 'enchanted', 'enraged', 'reflect', 'submerged',
    ]));
    expect(allies[0].statuses).toHaveLength(0);
    expect(events.some(e => e.type === 'gem-explode')).toBe(true);
  });

  it('8762 converts exactly one complete diagonal and scatters damage once', () => {
    const { ctx, events } = cast(8762);
    const transformed = events.filter(e => e.type === 'gem-transform');
    expect(transformed).toHaveLength(1);
    if (transformed[0].type !== 'gem-transform') throw new Error('missing transform');
    expect(transformed[0].changes).toHaveLength(8);
    expect(transformed[0].changes.every(c => c.to.kind === 'special' && c.to.spec.kind === 'burningGem')).toBe(true);
    const changed = transformed[0].changes.map(c => c.pos);
    expect(changed.every(c => c.row === c.col) || changed.every(c => c.row + c.col === 7)).toBe(true);
    expect(ctx.state.board.get({ row: 0, col: 3 })?.type.kind).toBe('color');
  });

  it('8806 counts only the adjacent Gargoyles before explosion; creates good/evil gems', () => {
    const { events } = cast(8806, ctx => {
      ctx.state.board.set({ row: 3, col: 3 }, { id: 1001, type: specialGem('gargoyleGem', 1) });
      ctx.state.board.set({ row: 2, col: 3 }, { id: 1002, type: specialGem('gargoyleGem', 2) });
      ctx.state.board.set({ row: 4, col: 4 }, { id: 1003, type: specialGem('gargoyleGem', 1) });
    });
    const creates = events.filter(e => e.type === 'gem-create');
    expect(creates).toHaveLength(1);
    if (creates[0].type !== 'gem-create') throw new Error('missing creations');
    expect(creates[0].spawns).toHaveLength(5); // 1 + 2 * two adjacent (center does not count)
    expect(creates[0].spawns.every(s => s.gemType.kind === 'special'
      && s.gemType.spec.kind === 'gargoyleGem' && [1, 2].includes(s.gemType.spec.tier ?? 0))).toBe(true);
  });

  it('9910 creates Poison Gems, then gives each enemy 1–2 negative statuses', () => {
    const { events, enemies } = cast(9910);
    expect(events[0].type).toMatch(/^gem-/);
    for (const enemy of enemies) {
      expect(enemy.statuses.length).toBeGreaterThanOrEqual(1);
      expect(enemy.statuses.length).toBeLessThanOrEqual(2);
    }
  });

  it('8965 blesses based on the original X before destroying it', () => {
    const { events } = cast(8965, ctx => {
      ctx.state.board.set({ row: 0, col: 0 }, { id: 1001, type: colorGem(BaseColor.Yellow) });
      ctx.state.board.set({ row: 1, col: 4 }, { id: 1002, type: colorGem(BaseColor.Yellow) });
      ctx.state.board.set({ row: 2, col: 4 }, { id: 1003, type: colorGem(BaseColor.Yellow) });
    });
    expect(events.filter(e => e.type === 'status-apply')).toHaveLength(2);
    expect(events.findIndex(e => e.type === 'status-apply')).toBeLessThan(events.findIndex(e => e.type === 'gem-destroy'));
  });
});


describe('weapon-wide verified native-step invariants', () => {
  it('native random-positive effects on the four restored weapons use the entire positive pool', () => {
    for (const id of [8670, 8770, 9203, 9916]) {
      const prototype = weapons.get(id);
      expect(prototype, `missing weapon ${id}`).toBeDefined();
      const random = (prototype!.segments as Array<{ kind: string; pool?: string }>).filter(s => s.kind === 'randomStatus');
      expect(random, `weapon ${id}`).toHaveLength(1);
      expect(random[0].pool).toBe('positive');
    }
  });

  it('Silverglade and kingdom-or-battle filters use real kingdoms and both branches', () => {
    const silverglade = String.fromCharCode(0x7389, 0x94f6, 0x6797, 0x5730);
    for (const id of [8347, 8670, 9302, 9574]) {
      expect(JSON.stringify(weapons.get(id))).toContain(silverglade);
      expect(JSON.stringify(weapons.get(id))).not.toContain(silverglade.replace(/^/, silverglade[0]));
    }
    for (const [id, kingdom] of [[8807, String.fromCharCode(0x5730, 0x72f1, 0x60ac, 0x5d16)],
      [9111, String.fromCharCode(0x5348, 0x591c, 0x57ce, 0x5e02)]] as const) {
      const segments = weapons.get(id)!.segments as Array<{ kind: string; condMult?: { cond: { kind: string; of: Array<{ kind: string; kingdom: string }> } } }>;
      const cond = segments.find(s => s.kind === 'damage')?.condMult?.cond;
      expect(cond?.kind).toBe('anyOf');
      expect(cond?.of).toEqual([
        { kind: 'targetKingdom', kingdom },
        { kind: 'kingdomPresent', kingdom },
      ]);
    }
  });

  it('9835 and 9916 explode Magic + 1 colored gems, not just one gem', () => {
    for (const id of [9835, 9916]) {
      const gem = (weapons.get(id)!.segments as Array<{ kind: string; params?: { target?: { count?: { base: number; mult: number } } } }>).find(s => s.kind === 'gem');
      expect(gem?.params?.target?.count).toEqual({ base: 1, mult: 1 });
    }
  });
});
