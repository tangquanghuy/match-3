/**
 * Lane L3 review round 2 (sa-R7): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { BaseColor, colorGem, skullGem, specialGem } from '@engine/types';
import type { Character } from '@engine/types';
type E = Partial<Character>;
const en = (colors: BaseColor[], extra: E = {}): E => ({ hp: 100, maxHp: 100, armor: 0, mana: 0, colors, ...extra });
const doom = (colors: BaseColor[], extra: E = {}): E => en(colors, { troopTypes: ['Doom'], ...extra });
const order = (r: ReturnType<typeof castSpell>) => r.summary.order;

describe('L3 R2: Doomed damage weapons (Gain 3 Mana per <colour> enemy, counted before the damage)', () => {
  // native: CountArmyColor@AllEnemies 300 (step 0) -> Damage -> ConvertGems -> CreateGems Doomskull [AddIfEnemyHasDoom 5] -> GenerateMana [counter]
  const fam: [string, BaseColor, BaseColor][] = [
    ['weapon:1226', BaseColor.Blue, BaseColor.Red], ['weapon:1229', BaseColor.Brown, BaseColor.Green],
    ['weapon:1233', BaseColor.Red, BaseColor.Blue], ['weapon:1248', BaseColor.Green, BaseColor.Brown],
    ['weapon:1257', BaseColor.Yellow, BaseColor.Purple], ['weapon:1258', BaseColor.Purple, BaseColor.Yellow],
  ];
  it.each(fam)('%s: an enemy of the counted colour killed by the hit still counts', (key, counted) => {
    const r = castSpell({ key, enemies: [en([counted], { hp: 1, maxHp: 1 }), en([counted]), en([BaseColor.Red === counted ? BaseColor.Blue : BaseColor.Red])] });
    expect(order(r)).toContain('defeat E10');
    expect(order(r)[0]).toBe('buff C mana+6'); // 2 counted enemies x 3
    expect(order(r).filter(o => o.startsWith('dmg '))).toEqual(['dmg E10 13 (all)', 'dmg E11 13 (all)', 'dmg E12 13 (all)']);
  });
  it.each(fam)('%s: Doom enemy -> 5 extra Doomskulls; no Doom -> none', (key, _c, from) => {
    const withDoom = castSpell({ key, enemies: [doom([BaseColor.Red]), en([BaseColor.Blue])] });
    const created = order(withDoom).filter(o => o.startsWith('convert ') && !o.startsWith(`convert ${from} `));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/-> doomSkull x5$/);
    const none = castSpell({ key, enemies: [en([BaseColor.Red]), en([BaseColor.Blue])] });
    expect(order(none).filter(o => o.startsWith('convert ')).length).toBe(1);
  });
  it('R001 equivalence: moving the self-mana first leaves damage and conversion unchanged (default scenario)', () => {
    const r = castSpell({ key: 'weapon:1229' });
    expect(order(r)).toEqual(['buff C mana+3', 'dmg E10 13 (all)', 'dmg E11 13 (all)', 'dmg E12 13 (all)', 'dmg E13 13 (all)', 'convert Green x13 -> doomSkull x13']);
  });
});

describe('L3 R2: Doomed support weapons (2 Magic per <colour> enemy, 5 Mana + 4 per Doom enemy)', () => {
  // native: CountArmyColor 200 -> IncreaseHealth -> IncreaseSpellPower [counter] -> CountSet -> CountArmyType doom 400 -> GenerateMana@AllAlliesButNotSelf 5 [counter]
  const fam: [string, BaseColor][] = [
    ['weapon:1236', BaseColor.Purple], ['weapon:1242', BaseColor.Brown], ['weapon:1245', BaseColor.Yellow],
    ['weapon:1259', BaseColor.Blue], ['weapon:1260', BaseColor.Green], ['weapon:1261', BaseColor.Red],
  ];
  it.each(fam)('%s: two %s Doom enemies -> Magic +4 to all, Mana +13 to the others', (key, c) => {
    const r = castSpell({ key, enemies: [doom([c]), doom([c]), en([c === BaseColor.Red ? BaseColor.Blue : BaseColor.Red])] });
    expect(order(r)).toEqual(['buff C hp+11 max+11', 'buff A1 hp+11 max+11', 'buff A2 hp+11 max+11',
      'buff C magic+4', 'buff A1 magic+4', 'buff A2 magic+4', 'buff A1 mana+13', 'buff A2 mana+13']);
  });
  it.each(fam)('%s: no counted enemy and no Doom -> no Magic, Mana 5', (key, c) => {
    const other = c === BaseColor.Red ? BaseColor.Blue : BaseColor.Red;
    const r = castSpell({ key, enemies: [en([other]), en([other])] });
    expect(order(r).filter(o => o.includes('magic'))).toEqual([]);
    expect(order(r).filter(o => o.includes('mana'))).toEqual(['buff A1 mana+5', 'buff A2 mana+5']);
  });
});

describe('L3 R2: troop:6925 Rogueling (8413) two random hits + extra turn', () => {
  it('a lone enemy is hit twice (RandomEnemy, then RandomPrefNotPrevEnemy may repeat, R007-3)', () => {
    const r = castSpell({ key: 'troop:6925', enemies: [en([BaseColor.Red])] });
    expect(order(r)).toEqual(['dmg E10 15', 'dmg E10 15', 'extra-turn skill']);
    expect(r.summary.turnKept).toBe(true);
  });
  it.each([1, 2, 3, 4, 5, 6])('seed %i: two different enemies while several are alive', (seed) => {
    const r = castSpell({ key: 'troop:6925', seed });
    const hits = order(r).filter(o => o.startsWith('dmg ')).map(o => o.split(' ')[1]);
    expect(hits).toHaveLength(2);
    expect(hits[0]).not.toBe(hits[1]);
  });
  it('boosted x3 per Green ally (caster included): extra Green ally -> 2 + 10 + 6', () => {
    const r = castSpell({ key: 'troop:6925', allies: [{ hp: 500, maxHp: 500, colors: [BaseColor.Green] }], enemies: [en([BaseColor.Red], { hp: 300, maxHp: 300 })] });
    expect(order(r)).toEqual(['dmg E10 18', 'dmg E10 18', 'extra-turn skill']);
  });
});

describe('L3 R2: troop:7646 Shadow Wraith (9550) half mana if the hit enemy uses Purple', () => {
  // seeds picked from the two-enemy board [Red E10, Purple E11]
  it('Red enemy hit, Purple enemy elsewhere -> no mana', () => {
    const r = castSpell({ key: 'troop:7646', seed: 7, enemies: [en([BaseColor.Red]), en([BaseColor.Purple])] });
    expect(order(r)).toEqual(['dmg E10 13']);
  });
  it('Purple enemy hit -> half of 12 mana', () => {
    const r = castSpell({ key: 'troop:7646', seed: 10, enemies: [en([BaseColor.Red]), en([BaseColor.Purple])] });
    expect(order(r)).toEqual(['dmg E11 13', 'buff C mana+6']);
  });
  // P-R7-dead-last-target-cond: native counts the target colour before the hit (CountArmyColor@RandomEnemy step 0)
  it.fails('Purple enemy killed by the hit still refunds half the mana (primitive queue)', () => {
    const r = castSpell({ key: 'troop:7646', seed: 7, enemies: [en([BaseColor.Purple], { hp: 1, maxHp: 1 }), en([BaseColor.Red])] });
    expect(order(r)).toEqual(['dmg E10 13', 'defeat E10', 'buff C mana+6']);
  });
});

describe('L3 R2: Immortal-partner weapons (ExtraTurnConditional / conditional mana on CountArmyTroop)', () => {
  const partner = (name: string): E => ({ name, hp: 500, maxHp: 500 });
  it.each([
    ['weapon:1606', '永生神维拉格', ['convert Green x13 -> faerieFireGem x13', 'buff C hp+12 max+12']],
    ['weapon:1599', '永生神奥西弗', ['convert skull x5 -> uberDoomSkull x5', 'buff C attack+6']],
    ['weapon:1475', '鳞光', ['buff C hp+11 max+11', 'buff A1 hp+11 max+11']],
  ] as [string, string, string[]][])('%s: extra turn only with %s in my team', (key, name, effects) => {
    const withIt = castSpell({ key, allies: [partner(name)] });
    expect(order(withIt)).toEqual([...effects, 'extra-turn skill']);
    expect(withIt.summary.turnKept).toBe(true);
    const without = castSpell({ key, allies: [{ name: 'someone', hp: 500, maxHp: 500 }] });
    expect(order(without)).toEqual(effects);
    expect(without.summary.turnKept).toBe(false);
  });
  it('weapon:1667: Immortal Monstera -> drain all target Mana before the splash; without -> no drain', () => {
    const withIt = castSpell({ key: 'weapon:1667', allies: [partner('不朽的龟背竹')] });
    expect(order(withIt)).toEqual(['buff E11 mana-8', 'dmg E11 38 (splash)', 'dmg E10 19 (splash)', 'dmg E12 19 (splash)']);
    const without = castSpell({ key: 'weapon:1667' });
    expect(order(without)).toEqual(['dmg E11 38 (splash)', 'dmg E10 19 (splash)', 'dmg E12 19 (splash)']);
  });
  // Sparse board: gems only on even/even cells, so each explosion centre clears exactly one gem.
  const SP = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  const sparse = (r: number, c: number) => (r % 2 === 0 && c % 2 === 0 ? colorGem(SP[(r + c / 2) % 6]) : null);
  it('weapon:1656: explode 5 + 1 per Barriered ally; Immortal Zachariel -> extra turn', () => {
    const barrier = [{ id: 'barrier', turns: 99 }] as Character['statuses'];
    const withIt = castSpell({ key: 'weapon:1656', board: sparse, allies: [{ ...partner('不朽的扎卡利尔'), statuses: barrier }, { hp: 500, maxHp: 500, statuses: barrier }] });
    expect(withIt.summary.gems.exploded).toBe(7);
    expect(withIt.summary.extraTurn).toBe('skill');
    const without = castSpell({ key: 'weapon:1656', board: sparse });
    expect(without.summary.gems.exploded).toBe(5);
    expect(without.summary.extraTurn).toBeNull();
  });
});

describe('L3 R2: race-count boosts (allies incl. caster + enemies)', () => {
  it('troop:6391 Queen Grapplepot: caster + 2 enemy Goblins -> 1 + 10 + 3 x 3', () => {
    const r = castSpell({ key: 'troop:6391', enemies: [en([], { troopTypes: ['Goblin'] }), en([], { troopTypes: ['Goblin'] })] });
    expect(order(r)).toEqual(['dmg E10 20 (all)', 'dmg E11 20 (all)', 'extra-turn skill']);
  });
  it.each([['troop:6508', 'Undead', 'attack+5'], ['troop:6648', 'Daemon', 'magic+2']])('%s: caster + ally + enemy %s -> Armor 1 + 10 + 3 x 2; other allies %s, Mana 5', (key, race, buff) => {
    const r = castSpell({ key, allies: [{ hp: 500, maxHp: 500, troopTypes: [race] }], enemies: [en([], { troopTypes: [race] })] });
    expect(order(r)).toEqual(['buff C armor+17', `buff A1 ${buff}`, 'buff A1 mana+5']);
  });
  it('weapon:1631 Dark Engraver: drain 3 Mana per Undead ally only (no base)', () => {
    const r = castSpell({ key: 'weapon:1631', allies: [{ hp: 500, maxHp: 500, troopTypes: ['Undead'] }, { hp: 500, maxHp: 500, troopTypes: ['Undead'] }] });
    expect(order(r)).toEqual(['dmg E11 13', 'buff E11 mana-6']);
    expect(order(castSpell({ key: 'weapon:1631' }))).toEqual(['dmg E11 13']);
  });
});

describe('L3 R2: B03 extra-turn / mana / count checks', () => {
  it('troop:6269 Desdaemona: extra turn only if the chosen enemy is a Daemon (another Daemon enemy does not count)', () => {
    const other = castSpell({ key: 'troop:6269', target: 11, enemies: [en([], { troopTypes: ['Daemon'] }), en([BaseColor.Yellow])] });
    expect(order(other)).toEqual(['dmg E11 24']);
    expect(other.summary.turnKept).toBe(false);
    const hit = castSpell({ key: 'troop:6269', target: 10, enemies: [en([], { troopTypes: ['Daemon'] }), en([])] });
    expect(order(hit)).toEqual(['extra-turn skill', 'dmg E10 12']);
    expect(hit.summary.turnKept).toBe(true);
    // CountArmyType@FromTarget is step 0: a Daemon killed by the hit still grants the extra turn
    const kill = castSpell({ key: 'troop:6269', target: 10, enemies: [en([], { hp: 1, maxHp: 1, troopTypes: ['Daemon'] }), en([])] });
    expect(kill.summary.extraTurn).toBe('skill');
  });
  it('troop:7691 Blackmane Montu: CountAttack 150 floors (attack 17 -> +25), 2 Bleed stacks, half mana (16 -> 8) on kill', () => {
    const r = castSpell({ key: 'troop:7691', enemies: [en([], { attack: 17 }), en([], { attack: 17 })] });
    expect(order(r)).toEqual(['dmg E11 38', 'status E11 +bleed']);
    const bleed = r.f.enemies[1].statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined;
    expect(bleed?.magnitude).toBe(2); // inflict stacks -> magnitude
    const k = castSpell({ key: 'troop:7691', enemies: [en([], { hp: 1, maxHp: 1, attack: 17 }), en([], { hp: 1, maxHp: 1, attack: 17 })] });
    expect(order(k)).toContain('buff C mana+8');
  });
  it.each([[1, 'A1'], [2, 'A2']])('troop:6259 Queen Ysabelle: damage = chosen ally %i pre-buff Attack, buffs go to that ally', (target, who) => {
    const r = castSpell({ key: 'troop:6259', target, allies: [{ hp: 500, maxHp: 500, attack: 9 }, { hp: 500, maxHp: 500, attack: 21 }] });
    const atk = target === 1 ? 9 : 21;
    expect(order(r).slice(0, 3)).toEqual([`dmg E10 ${atk}`, `buff ${who} attack+11`, `buff ${who} armor+11`]);
  });
  it('troop:7437 Satyr Trickster: steals min(Attack, Magic + 1) and heals that much; 25% extra turn', () => {
    const r = castSpell({ key: 'troop:7437', enemies: [en([], { attack: 4 }), en([], { attack: 4 })] });
    expect(order(r).slice(0, 2)).toEqual(['buff E11 attack-4', 'buff C hp+4 max+4']);
    const kept = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(seed => castSpell({ key: 'troop:7437', seed }).summary.turnKept);
    expect(kept.some(Boolean)).toBe(true);
    expect(kept.every(Boolean)).toBe(false);
  });
  it('troop:6598 Sloth: drains allies and enemies, heals the total', () => {
    const r = castSpell({ key: 'troop:6598', allies: [{ hp: 500, maxHp: 500, mana: 7 }, { hp: 500, maxHp: 500, mana: 3 }] });
    expect(order(r)).toEqual(['buff A1 mana-7', 'buff A2 mana-3', 'buff E10 mana-6', 'buff E11 mana-8', 'buff E12 mana-4', 'buff E13 mana-10', 'buff C hp+38 max+38']);
  });
  it('troop:6396 Dwarven Gate: +1 Armor per Dwarf ally incl. caster', () => {
    const r = castSpell({ key: 'troop:6396', allies: [{ hp: 500, maxHp: 500, troopTypes: ['Dwarf'] }] });
    expect(order(r)).toEqual(['buff C armor+15', 'status A1 +barrier', 'buff A1 mana+5']);
  });
  it('troop:6466 Chief Stronghorn: floor((Attack + Armor + Life) x 34%) + Magic + 1 to the pulled enemy', () => {
    const r = castSpell({ key: 'troop:6466', caster: { attack: 10, armor: 20, hp: 70, maxHp: 100 } });
    expect(order(r)).toEqual(['move E11 front', 'dmg E11 45']); // floor(100 x 0.34) = 34 + 11
  });
  it('troop:6114 Cockatrice: 6 + floor(drained x 25%) Brown gems', () => {
    const r = castSpell({ key: 'troop:6114', enemies: [en([]), en([], { mana: 13 })] });
    expect(order(r).slice(0, 2)).toEqual(['status E11 +entangle', 'buff E11 mana-13']);
    expect(order(r)[2]).toMatch(/-> Brown x9$/);
  });
});

describe('L3 R2: "Drain up to N Mana, create/explode per Mana drained" family', () => {
  const rich = (mana: number) => [en([]), en([BaseColor.Purple], { mana })];
  it.each([
    ['troop:6317', 'Blue'], ['troop:6424', 'Green'], ['troop:6710', 'Purple'], ['troop:6792', 'Red'],
    ['troop:6852', 'Brown'], ['troop:7060', 'Yellow'], ['troop:7085', 'skull'],
  ])('%s: 25 Mana -> drains 12, creates 12 %s; 5 Mana -> drains 5, creates 5', (key, gem) => {
    const r = castSpell({ key, enemies: rich(25) });
    expect(order(r)[0]).toBe('buff E11 mana-12');
    expect(order(r)[1]).toMatch(new RegExp(`-> ${gem} x12$`));
    const s = castSpell({ key, enemies: rich(5) });
    expect(order(s)[0]).toBe('buff E11 mana-5');
    expect(order(s)[1]).toMatch(new RegExp(`-> ${gem} x5$`));
  });
  it('troop:7502 Kolfrysti: drains up to 20, 1 Freeze gem per 2 drained (25 -> 20/10, 7 -> 7/3)', () => {
    const a = castSpell({ key: 'troop:7502', enemies: rich(25) });
    expect(order(a)[0]).toBe('buff E11 mana-20');
    expect(order(a)[1]).toMatch(/-> freezeGem x10$/);
    const b = castSpell({ key: 'troop:7502', enemies: rich(7) });
    expect(order(b)[0]).toBe('buff E11 mana-7');
    expect(order(b)[1]).toMatch(/-> freezeGem x3$/);
  });
  const SP = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  const sparse = (r: number, c: number) => (r % 2 === 0 && c % 2 === 0 ? colorGem(SP[(r + c / 2) % 6]) : null);
  it('troop:6878 Blind Guardian: drains up to 10, explodes one gem per Mana drained', () => {
    const r = castSpell({ key: 'troop:6878', board: sparse, enemies: rich(25) });
    expect(order(r)[0]).toBe('buff E11 mana-10');
    expect(r.summary.gems.exploded).toBe(10);
    expect(castSpell({ key: 'troop:6878', board: sparse, enemies: rich(3) }).summary.gems.exploded).toBe(3);
  });
  it('weapon:1219 Symbol of Anu: drain 12, create 12 of the target colour before the hit (a killed target still gives its colour)', () => {
    const r = castSpell({ key: 'weapon:1219', enemies: [en([BaseColor.Red]), en([BaseColor.Purple], { hp: 1, maxHp: 1, mana: 20 })] });
    expect(order(r).slice(0, 4)).toEqual(['buff E11 mana-12', expect.stringMatching(/-> Purple x12$/), 'dmg E11 14', 'defeat E11']);
  });
});

describe('L3 R2: B05 drained-mana / full-enemy / conditional extra-turn checks', () => {
  it('troop:6906 Pandaska Mage: counts [2:1] Mana on Red enemies only, drains 5 from each Red enemy after the hit', () => {
    const r = castSpell({ key: 'troop:6906', target: 11, enemies: [en([BaseColor.Red], { mana: 10 }), en([BaseColor.Blue], { mana: 20 }), en([BaseColor.Red], { mana: 6 })] });
    expect(order(r)).toEqual(['dmg E11 21', 'buff E10 mana-5', 'buff E12 mana-5']); // floor(16 x 50%) = 8
  });
  it('troop:6599 Envy: full-Life and full-Mana enemies counted separately, x4 each', () => {
    const r = castSpell({ key: 'troop:6599', enemies: [
      en([BaseColor.Red], { manaCost: 10, mana: 0 }), en([BaseColor.Red], { hp: 50, manaCost: 10, mana: 10 }),
      en([BaseColor.Red], { manaCost: 10, mana: 10 }), en([BaseColor.Red], { hp: 50, manaCost: 10, mana: 0 }),
    ] });
    // full Life: E10, E12; full Mana: E11, E12 -> 4 x 4 = 16; two strongest (Life + Armor) = E10, E12
    expect(order(r).filter(o => o.startsWith('dmg ')).sort()).toEqual(['dmg E10 28 (all)', 'dmg E12 28 (all)']);
  });
  it('troop:6928 Detect-o-bot: 7 Red gems per enemy at full Mana', () => {
    const r = castSpell({ key: 'troop:6928', seed: 3, enemies: [en([BaseColor.Blue], { manaCost: 10, mana: 10 }), en([BaseColor.Blue], { manaCost: 10, mana: 10 }), en([BaseColor.Blue], { manaCost: 10, mana: 2 })] });
    expect(order(r).find(o => o.startsWith('convert '))).toMatch(/-> Red x14$/);
  });
  it('troop:6862 Scarab Knight: 25% + 2% per Brown gem, extra turn and half mana rolled independently', () => {
    const brown = castSpell({ key: 'troop:6862', board: () => colorGem(BaseColor.Brown) });
    expect(brown.summary.extraTurn).toBe('skill');
    expect(order(brown)).toContain('buff C mana+6');
    const runs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(seed => castSpell({ key: 'troop:6862', seed, board: () => colorGem(BaseColor.Red) }));
    const turn = runs.map(r => r.summary.extraTurn === 'skill');
    const mana = runs.map(r => order(r).includes('buff C mana+6'));
    expect(turn.some(Boolean) && !turn.every(Boolean)).toBe(true);
    expect(mana.some(Boolean) && !mana.every(Boolean)).toBe(true);
    expect(turn.some((t, i) => t !== mana[i])).toBe(true);
  });
});

describe('L3 R2: B06 Tarot "7% extra-turn chance per <colour> gem" family (no base chance, counted at step 0)', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const only = (c: BaseColor, n: number, other: BaseColor) => (r: number, col: number) => colorGem(r * 8 + col < n ? c : other);
  const fam: [string, BaseColor][] = [
    ['troop:7088', BaseColor.Red], ['troop:7107', BaseColor.Purple], ['troop:7244', BaseColor.Green], ['troop:7305', BaseColor.Yellow],
    ['troop:7346', BaseColor.Purple], ['troop:7363', BaseColor.Blue], ['troop:7421', BaseColor.Yellow],
  ];
  it.each(fam)('%s: no %s gems -> never an extra turn', (key, c) => {
    const other = c === BaseColor.Brown ? BaseColor.Red : BaseColor.Brown;
    expect(seeds.some(seed => castSpell({ key, seed, board: only(c, 0, other) }).summary.extraTurn === 'skill')).toBe(false);
  });
  it.each(fam)('%s: 15 %s gems (105%%) -> always an extra turn, even if the cast replaces some of them', (key, c) => {
    const other = c === BaseColor.Brown ? BaseColor.Red : BaseColor.Brown;
    expect(seeds.every(seed => castSpell({ key, seed, board: only(c, 15, other) }).summary.extraTurn === 'skill')).toBe(true);
  });
  it.each(fam)('%s: 5 %s gems (35%%) -> sometimes', (key, c) => {
    const other = c === BaseColor.Brown ? BaseColor.Red : BaseColor.Brown;
    const got = seeds.map(seed => castSpell({ key, seed, board: only(c, 5, other) }).summary.extraTurn === 'skill');
    expect(got.some(Boolean) && !got.every(Boolean)).toBe(true);
  });
});

describe('L3 R2: B06 other checks', () => {
  it('troop:7211 Tourmaline: drain 4 + 3 per Gargoyle gem (Good and Evil), not per gem on the board', () => {
    const board = (r: number, c: number) => (r === 0 && c < 2 ? specialGem('gargoyleGem', c + 1) : colorGem(BaseColor.Red));
    const r = castSpell({ key: 'troop:7211', board, enemies: [en([], { mana: 30 }), en([], { mana: 30 })] });
    expect(order(r).filter(o => o.includes('mana'))).toEqual(['buff E10 mana-10', 'buff E11 mana-10']);
    const none = castSpell({ key: 'troop:7211', board: () => colorGem(BaseColor.Red), enemies: [en([], { mana: 30 })] });
    expect(order(none).filter(o => o.includes('mana'))).toEqual(['buff E10 mana-4']);
  });
  it('troop:7527 Gloomhob: +1 per Undead enemy (a killed Undead target still counts) + extra turn', () => {
    const r = castSpell({ key: 'troop:7527', target: 10, board: () => colorGem(BaseColor.Red), enemies: [en([], { hp: 1, maxHp: 1, troopTypes: ['Undead'] }), en([], { troopTypes: ['Undead'] }), en([])] });
    expect(order(r)).toEqual(['dmg E10 15', 'defeat E10', 'extra-turn skill']);
  });
  it('troop:6825 Tuliao: Enchant + 6 Mana + 1 per 4 gems of the chosen colour, only allies of that colour', () => {
    const board = (r: number, c: number) => colorGem(r * 8 + c < 20 ? BaseColor.Green : BaseColor.Red);
    const r = castSpell({ key: 'troop:6825', color: BaseColor.Green, board, allies: [{ hp: 500, maxHp: 500, colors: [BaseColor.Green], manaCost: 30 }, { hp: 500, maxHp: 500, colors: [BaseColor.Red], manaCost: 30 }] });
    expect(order(r).filter(o => o.startsWith('buff ') || o.startsWith('status '))).toEqual(['status C +enchanted', 'status A1 +enchanted', 'buff C mana+11', 'buff A1 mana+11']);
  });
});

describe('L3 R2: B07 Tarot tail + Dragon "10% extra turn, boosted by <colour> gems" family', () => {
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const gem = (c: BaseColor | 'skull') => (c === 'skull' ? skullGem() : colorGem(c));
  const only = (c: BaseColor | 'skull', n: number, other: BaseColor) => (r: number, col: number) => gem(r * 8 + col < n ? c : other);
  it.each([['troop:7526', BaseColor.Blue], ['troop:7551', BaseColor.Green]] as [string, BaseColor][])('%s: 0 %s gems never, 15 always', (key, c) => {
    expect(seeds(30).some(seed => castSpell({ key, seed, board: only(c, 0, BaseColor.Brown) }).summary.extraTurn === 'skill')).toBe(false);
    expect(seeds(30).every(seed => castSpell({ key, seed, board: only(c, 15, BaseColor.Brown) }).summary.extraTurn === 'skill')).toBe(true);
  });
  const dragons: [string, BaseColor | 'skull', number][] = [
    ['troop:7841', BaseColor.Red, 2], ['troop:7843', BaseColor.Purple, 2], ['troop:7844', BaseColor.Brown, 2],
    ['troop:7839', BaseColor.Blue, 2], ['troop:7842', BaseColor.Yellow, 2], ['troop:7840', BaseColor.Green, 2], ['troop:7845', 'skull', 2.4],
  ];
  it.each(dragons)('%s: damage 3 + Magic x mult + 2 per %s gem; 10%% base chance; 45 gems -> always', (key, c, mult) => {
    const other = c === BaseColor.Brown ? BaseColor.Red : BaseColor.Brown;
    const r = castSpell({ key, board: only(c, 10, other), enemies: [en([]), en([])] });
    const d = 3 + Math.round(10 * mult) + 20;
    expect(order(r).filter(o => o.startsWith('dmg '))).toEqual([`dmg E10 ${d} (all)`, `dmg E11 ${d} (all)`]);
    const base = seeds(60).map(seed => castSpell({ key, seed, board: only(c, 0, other) }).summary.extraTurn === 'skill');
    expect(base.some(Boolean) && !base.every(Boolean)).toBe(true);
    expect(seeds(20).every(seed => castSpell({ key, seed, board: only(c, 45, other) }).summary.extraTurn === 'skill')).toBe(true);
  });
  it('troop:7042 Wereverine: any Lycanthropy gem -> Lycanthropy on the target + full mana back; none -> neither', () => {
    const lyc = (r: number, c: number) => (r === 0 && c === 0 ? specialGem('lycanthropyGem') : colorGem(BaseColor.Red));
    const r = castSpell({ key: 'troop:7042', target: 10, board: lyc, enemies: [en([]), en([])] });
    expect(order(r)).toEqual(['dmg E10 7', 'status E10 +lycanthropy', 'buff C mana+12']);
    const none = castSpell({ key: 'troop:7042', target: 10, board: () => colorGem(BaseColor.Red), enemies: [en([]), en([])] });
    expect(order(none)).toEqual(['dmg E10 7']);
  });
});

describe('L3 R2: B08 Elemental-Dragon "10% extra turn + 3%/gem, counted before the conversion" family', () => {
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const gem = (c: BaseColor | 'skull') => (c === 'skull' ? skullGem() : colorGem(c));
  const only = (c: BaseColor | 'skull', n: number, other: BaseColor) => (r: number, col: number) => gem(r * 8 + col < n ? c : other);
  const fam: [string, BaseColor | 'skull', number][] = [
    ['troop:7251', 'skull', 3], ['troop:7616', BaseColor.Blue, 3], ['troop:7617', BaseColor.Green, 3], ['troop:7618', BaseColor.Red, 3],
    ['troop:7619', BaseColor.Yellow, 3], ['troop:7620', BaseColor.Purple, 3], ['troop:7621', BaseColor.Brown, 3], ['troop:7622', 'skull', 4],
  ];
  it.each(fam)('%s: counted %s gems -> 10%% + %i%%/gem; 100%% reached even though the cast changes those gems', (key, c, per) => {
    const other = c === BaseColor.Brown ? BaseColor.Red : BaseColor.Brown;
    const full = Math.ceil(90 / per);
    expect(seeds(20).every(seed => castSpell({ key, seed, board: only(c, full, other) }).summary.extraTurn === 'skill')).toBe(true);
    const base = seeds(60).map(seed => castSpell({ key, seed, board: only(c, 0, other) }).summary.extraTurn === 'skill');
    expect(base.some(Boolean) && !base.every(Boolean)).toBe(true);
  });
  it('troop:7251 Diamantina: damage 6 + Magic x 2 + 3 per Skull', () => {
    const r = castSpell({ key: 'troop:7251', board: only('skull', 10, BaseColor.Red), enemies: [en([])] });
    expect(order(r)[0]).toBe('dmg E10 56 (all)');
  });
  it('troop:7429 Tempurath: +3 per Hourglass gem; kill -> 4 Hourglass gems + extra turn, no kill -> neither', () => {
    const hg = (r: number, c: number) => (r === 0 && c < 2 ? specialGem('hourglass') : colorGem(BaseColor.Red));
    const miss = castSpell({ key: 'troop:7429', target: 10, board: hg, enemies: [en([]), en([])] });
    expect(order(miss)).toEqual(['dmg E10 19']);
    expect(miss.summary.extraTurn).toBeNull();
    const kill = castSpell({ key: 'troop:7429', target: 10, board: hg, enemies: [en([], { hp: 5, maxHp: 5 }), en([])] });
    expect(order(kill).slice(0, 2)).toEqual(['dmg E10 19', 'defeat E10']);
    expect(order(kill)[2]).toMatch(/-> hourglass x4$/);
    expect(kill.summary.extraTurn).toBe('skill');
  });
  it('troop:7775 Lord Gobthe: +3 per Bleed gem, always an extra turn (Boss clause waived R000)', () => {
    const bg = (r: number, c: number) => (r === 0 && c < 2 ? specialGem('bleedGem') : colorGem(BaseColor.Red));
    const r = castSpell({ key: 'troop:7775', target: 10, board: bg, enemies: [en([]), en([])] });
    expect(order(r)).toEqual(['dmg E10 20', 'extra-turn skill']);
  });
});

describe('L3 R2: B09 gem-count mana / extra-turn checks', () => {
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const only = (c: BaseColor, n: number, other: BaseColor) => (r: number, col: number) => colorGem(r * 8 + col < n ? c : other);
  const specials = (kind: Parameters<typeof specialGem>[0], n: number) => (r: number, c: number) => (r === 0 && c < n ? specialGem(kind) : colorGem(BaseColor.Red));
  it.each([['troop:7193', BaseColor.Green, 7], ['troop:7264', BaseColor.Green, 7], ['troop:7168', BaseColor.Green, 7], ['troop:7229', BaseColor.Blue, 7]] as [string, BaseColor, number][])(
    '%s: extra turn 0 %s gems never, 15 always', (key, c) => {
      expect(seeds(30).some(seed => castSpell({ key, seed, board: only(c, 0, BaseColor.Brown) }).summary.extraTurn === 'skill')).toBe(false);
      expect(seeds(30).every(seed => castSpell({ key, seed, board: only(c, 15, BaseColor.Brown) }).summary.extraTurn === 'skill')).toBe(true);
    });
  it('troop:6307 Shadowblade: 6% per Purple gem to regain the full mana cost (none without Purple, always with 17)', () => {
    const regained = (n: number, seed: number) => order(castSpell({ key: 'troop:6307', seed, board: only(BaseColor.Purple, n, BaseColor.Brown) })).some(o => o.startsWith('buff C mana+'));
    expect(seeds(30).some(seed => regained(0, seed))).toBe(false);
    expect(seeds(30).every(seed => regained(17, seed))).toBe(true);
    expect(order(castSpell({ key: 'troop:6307', board: only(BaseColor.Purple, 17, BaseColor.Brown) }))).toContain('buff C mana+9');
  });
  it('troop:6861 Moth Mage: 25% + 2%/Brown gem, extra turn and half mana (6) independently', () => {
    const brown = castSpell({ key: 'troop:6861', board: () => colorGem(BaseColor.Brown) });
    expect(brown.summary.extraTurn).toBe('skill');
    expect(order(brown)).toContain('buff C mana+6');
    const runs = seeds(20).map(seed => castSpell({ key: 'troop:6861', seed, board: () => colorGem(BaseColor.Red) }));
    const turn = runs.map(r => r.summary.extraTurn === 'skill');
    const mana = runs.map(r => order(r).includes('buff C mana+6'));
    expect(turn.some(Boolean) && !turn.every(Boolean)).toBe(true);
    expect(mana.some(Boolean) && !mana.every(Boolean)).toBe(true);
  });
  it('troop:7103 Water Weird: 2 Mana per Elemental Star only (Tower clause waived)', () => {
    expect(order(castSpell({ key: 'troop:7103', target: 10, board: specials('elementalStar', 3), enemies: [en([])] }))).toEqual(['dmg E10 14', 'buff C mana+6']);
  });
  it('troop:7035 Wereraven: drain 2 + 2 per Lycanthropy gem (counted before creating 1-3 more)', () => {
    const r = castSpell({ key: 'troop:7035', board: specials('lycanthropyGem', 2), enemies: [en([], { mana: 20 }), en([], { mana: 20 })] });
    expect(order(r).slice(0, 2)).toEqual(['buff E10 mana-6', 'buff E11 mana-6']);
  });
  it('troop:7052 Swanmay: 3 Mana per Lycanthropy gem to the other allies only', () => {
    const r = castSpell({ key: 'troop:7052', board: specials('lycanthropyGem', 2), allies: [{ hp: 500, maxHp: 500, manaCost: 30 }] });
    expect(order(r)[0]).toBe('buff A1 mana+6');
    expect(order(r).some(o => o.startsWith('buff C mana'))).toBe(false);
  });
  it('troop:7061 Dark Knight: drain 4 per Purple gem in the destroyed column, no base', () => {
    const col = (n: number) => (r: number, c: number) => colorGem(c === 3 && r < n ? BaseColor.Purple : (r + c) % 2 ? BaseColor.Red : BaseColor.Blue);
    const three = castSpell({ key: 'troop:7061', cell: { row: 0, col: 3 }, board: col(3), enemies: [en([], { mana: 20 })] });
    expect(order(three).filter(o => o.startsWith('buff E10 mana'))).toEqual(['buff E10 mana-12']);
    const none = castSpell({ key: 'troop:7061', cell: { row: 0, col: 3 }, board: col(0), enemies: [en([], { mana: 20 })] });
    expect(order(none).filter(o => o.startsWith('buff E10 mana'))).toEqual([]);
  });
});
