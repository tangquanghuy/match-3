/**
 * 战斗层技能绑定：主角武器用 gw_* 出战，部队用法术数字 id。
 * 两边都必须出现在 registerSkillLibrary 的注册表里，否则释放只扣蓝、
 * 不产 skill-damage，表现层也就没有任何动画/音效。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { registerSkillLibrary, SKILL_LIBRARY } from '@engine/skills/library';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { executePrototype } from '@engine/skills/prototypes';
import { destroyRandomGems, skill } from '@engine/skills/builders';
import { prototypeNeedsCell } from '@engine/skills/cellChooser';
import { BaseColor, PlayerSide, colorGem, skullGem, specialGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import { TROOPS } from '../../src/data/troops';
import { CATALOG_WEAPONS } from '../../src/meta/data/weaponCatalog';
import { troopToSummonTemplate } from '../../src/data/troops';

function battleRegistry(): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  return registry;
}

describe('战斗层技能绑定（部队数字 id + 武器 gw_*）', () => {
  it('已编译部队法术全部按 String(spell.id) 挂上，且段非空', () => {
    const registry = battleRegistry();
    const missing = TROOPS.filter((troop) => {
      const proto = SKILL_LIBRARY[troop.spell.id];
      if (!proto) return false;
      const bound = registry.prototypes.get(String(troop.spell.id));
      return !bound || bound.segments.length === 0;
    });
    expect(missing.map((troop) => `${troop.name}:${troop.spell.id}`)).toEqual([]);
  });

  it('已编译武器法术全部按 gw_* 出战键挂上，且与数字 spellId 是同一份原型', () => {
    const registry = battleRegistry();
    const missing = CATALOG_WEAPONS.filter((weapon) => {
      if (!weapon.skill) return false;
      const byGw = registry.prototypes.get(weapon.id);
      const bySpell = registry.prototypes.get(String(weapon.spellId));
      return !byGw || !bySpell || byGw !== weapon.skill || bySpell !== weapon.skill;
    });
    expect(missing.map((weapon) => `${weapon.name}:${weapon.id}:${weapon.spellId}`)).toEqual([]);
  });

  it('寒冰阔剑（gw_IcyGlaive / spell 7074）用出战键释放会打出伤害', () => {
    const icy = CATALOG_WEAPONS.find((weapon) => weapon.id === 'gw_IcyGlaive');
    expect(icy?.name).toBe('寒冰阔剑');
    expect(icy?.spellId).toBe(7074);

    let gid = 0;
    const board = new BoardModel();
    const palette: GemType[] = [
      colorGem(BaseColor.Red), colorGem(BaseColor.Blue), colorGem(BaseColor.Green),
      colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple), colorGem(BaseColor.Brown),
    ];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: gid++, type: palette[(r * 3 + c * 5) % 6] });
      }
    }
    const makeChar = (id: number, over: Partial<Character> = {}): Character => ({
      id, name: `C${id}`, maxHp: 60, hp: 45, attack: 8, armor: 0, magic: 7,
      colors: [BaseColor.Yellow], manaCost: 8, mana: 8,
      skillId: 'none', statuses: [], defeated: false, troopTypes: ['Human'], ...over,
    });
    const left: Team = {
      player: PlayerSide.Left,
      characters: [makeChar(0, { skillId: 'gw_IcyGlaive' }), makeChar(1), makeChar(2)],
    };
    const right: Team = {
      player: PlayerSide.Right,
      characters: [makeChar(4), makeChar(5), makeChar(6)],
    };
    const state = createGameState(board, left, right, PlayerSide.Left);
    const registry = battleRegistry();
    let idg = 200000;
    const engine = new TurnEngine(state, new SeededRNG(20260922), () => idg++, registry);
    engine.skullChance = 0;
    engine.setSummonResolver((ref) => troopToSummonTemplate(ref));
    const events = engine.castSkill(0);
    expect(events[0]).toMatchObject({ type: 'skill-cast', skillId: 'gw_IcyGlaive' });
    expect(events.some((ev) => ev.type === 'skill-damage')).toBe(true);
  });

  it('爆破一颗宝石（spell 7094）需要玩家点选格子', () => {
    const registry = battleRegistry();
    const proto = registry.prototypes.get('7094');
    expect(proto).toBeDefined();
    expect(prototypeNeedsCell(proto!)).toBe(true);
  });

  it('Wand of Stars tempering 9 and 10 activate for both branches only on the weapon', () => {
    function cast(level: number, branch: number, skillId = 'gw_WandOfStars') {
      let gid = 0;
      const board = new BoardModel();
      for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: gid++, type: colorGem([BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow][(r + c) % 4]) });
      }
      const character = (id: number, over: Partial<Character> = {}): Character => ({
        id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
        colors: [BaseColor.Red], manaCost: 8, mana: 8,
        skillId: 'none', statuses: [], defeated: false, ...over,
      });
      const left: Team = { player: PlayerSide.Left, characters: [character(0, { skillId, temperingLevel: level }), character(1)] };
      const right: Team = { player: PlayerSide.Right, characters: [character(4), character(5)] };
      const state = createGameState(board, left, right, PlayerSide.Left);
      const engine = new TurnEngine(state, new SeededRNG(8623), () => gid++, battleRegistry());
      engine.setBranchChooser(new FixedBranchChooser(branch));
      engine.skullChance = 0;
      const events = engine.castSkill(0);
      return { armor: left.characters[0].armor, destroys: events.filter(e => e.type === 'gem-destroy'), events };
    }
    for (const branch of [0, 1]) {
      const lv8 = cast(8, branch);
      const lv9 = cast(9, branch);
      const lv10 = cast(10, branch);
      expect(lv8.armor).toBe(0);
      expect(lv9.armor).toBe(2);
      expect(lv10.armor).toBe(2);
      expect(lv8.destroys).toEqual(lv9.destroys);
      expect(lv10.destroys).toHaveLength(lv9.destroys.length + 1);
      const singleColors = (list: typeof lv9.destroys) => list.filter(e => e.cells.length === 1 && e.cells[0].gemType.kind === 'color').length;
      expect(singleColors(lv10.destroys)).toBe(singleColors(lv9.destroys) + 1);
      expect(lv10.events[0]).toMatchObject({ type: 'skill-cast', skillId: 'gw_WandOfStars' });
    }
    const troop = cast(10, 0, '8623');
    expect(troop.armor).toBe(0);
    expect(troop.destroys).toEqual(cast(8, 0, '8623').destroys);
  });

  it('nonSkull random gem targets include special gems but exclude all skull variants', () => {
    const board = new BoardModel();
    const gems = [skullGem(), specialGem('doomSkull'), specialGem('uberDoomSkull'),
      colorGem(BaseColor.Blue), specialGem('elementalStar')];
    gems.forEach((type, col) => board.set({ row: 0, col }, { id: col, type }));
    const hero: Character = {
      id: 0, name: 'hero', maxHp: 50, hp: 50, attack: 0, armor: 0, magic: 0,
      colors: [BaseColor.Red], manaCost: 8, mana: 8,
      skillId: 'gw_WandOfStars', statuses: [], defeated: false,
    };
    const state = createGameState(board,
      { player: PlayerSide.Left, characters: [hero] },
      { player: PlayerSide.Right, characters: [] }, PlayerSide.Left);
    const events = executePrototype(skill(destroyRandomGems(2, 0, 'nonSkull')),
      { state, casterId: 0, rng: new SeededRNG(7), nextGemId: () => 100 });
    const cells = events.flatMap(e => e.type === 'gem-destroy' ? e.cells : []);
    expect(cells.map(c => c.gemId).sort()).toEqual([3, 4]);
  });
});
