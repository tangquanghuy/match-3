/**
 * Lane L4a review round 3 (sa-A): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';
import { colorGem, skullGem, specialGem, BaseColor } from '@engine/types';

const dmgTargets = (order: string[]) => order.filter(o => o.startsWith('dmg ')).map(o => o.split(' ')[1]);
const ones = (n: number) => Array.from({ length: n }, () => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 }));

describe('L4a R3 B01', () => {
  // troop:7467 KingStormgard (9184): ExplodeColor LightningBlue + LightningYellow = every Lightning gem, after the damage.
  it('troop:7467 explodes both Lightning gem kinds after the damage', () => {
    const board = withCells(reviewBoard, { '6,1': specialGem('lightningRow'), '2,2': specialGem('lightningCol') });
    const r = castSpell({ key: 'troop:7467', board });
    const i = r.summary.order.findIndex(o => o.startsWith('explode '));
    expect(i).toBeGreaterThan(r.summary.order.findIndex(o => o.startsWith('dmg E11')));
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBeGreaterThanOrEqual(1);
    const lightning = [...Array(8).keys()].flatMap(rr => [...Array(8).keys()].map(c => r.f.board.get({ row: rr, col: c })))
      .filter(g => g?.type.kind === 'special' && /lightning/.test(g.type.spec.kind));
    expect(lightning.length).toBe(0);
  });

  // troop:7685 LapinaLancer (9642): Damage@RandomEnemy then Damage@RandomPrefNotPrevEnemy (R007.3: a lone survivor is hit twice).
  it('troop:7685 hits a lone enemy twice', () => {
    const r = castSpell({ key: 'troop:7685', enemies: [{ hp: 500, maxHp: 500, armor: 0 }] });
    expect(dmgTargets(r.summary.order)).toEqual(['E10', 'E10']);
  });
  it.each([1, 2, 3, 4, 5])('troop:7685 two different enemies (seed %i)', (seed) => {
    const t = dmgTargets(castSpell({ key: 'troop:7685', seed }).summary.order);
    expect(t.length).toBe(2); expect(t[0]).not.toBe(t[1]);
  });

  // troop:7874 MineCart (9949): CountGems Skull 300 in the chosen row: 3 + 3 x Skulls in row 3.
  it('troop:7874 creates 3 + 3 per destroyed Skull only', () => {
    const plain = castSpell({ key: 'troop:7874' });
    expect(plain.summary.gems.created.Brown).toBe(3);
    const board = withCells(reviewBoard, { '3,1': skullGem(), '3,6': skullGem() });
    expect(castSpell({ key: 'troop:7874', board }).summary.gems.created.Brown).toBe(9);
  });

  // troop:6224 LionPrince (7366): Damage@FrontEnemy, then Damage@SecondEnemy resolved after the first hit.
  it('troop:6224 second hit goes to the current second enemy after the front dies', () => {
    const r = castSpell({ key: 'troop:6224', enemies: ones(4) });
    expect(dmgTargets(r.summary.order)).toEqual(['E10', 'E12']);
    expect(dmgTargets(castSpell({ key: 'troop:6224' }).summary.order)).toEqual(['E10', 'E11']);
  });

  // troop:6736 HarpyEagle (8106): chosen column (Target Board); 3 + 10 + 4 x Yellow; TroopOrderFront@LastEnemy at its own step.
  it('troop:6736 destroys the chosen column and scales x4 per Yellow', () => {
    const board = withCells(reviewBoard, { '0,3': colorGem(BaseColor.Yellow), '5,3': colorGem(BaseColor.Yellow) });
    const r = castSpell({ key: 'troop:6736', board, cell: { row: 1, col: 3 } });
    const destroy = r.summary.order.find(o => o.startsWith('destroy '))!;
    const y = Number(/Yellow x(\d+)/.exec(destroy)?.[1] ?? 0);
    expect(destroy.startsWith('destroy 8')).toBe(true);
    expect(r.summary.order).toContain(`dmg E13 ${13 + 4 * y}`);
    expect(r.summary.order).toContain('move E13 front');
  });
  it('troop:6736 pulls the new last enemy when the last one dies', () => {
    const r = castSpell({ key: 'troop:6736', enemies: ones(4) });
    expect(r.summary.order).toContain('defeat E13');
    expect(r.summary.order).toContain('move E12 front');
  });
});

describe('L4a R3 B02', () => {
  // troop:6361 MerchantPrince (7513): BoardTarget RowAndColumn of the chosen cell: 15 gems, gold 1 + 10 + 10 x Red.
  it('troop:6361 destroys the chosen row and column', () => {
    const r = castSpell({ key: 'troop:6361' });
    const destroy = r.summary.order.filter(o => o.startsWith('destroy '));
    expect(destroy.length).toBe(1);
    expect(destroy[0].startsWith('destroy 15')).toBe(true);
    const red = Number(/Red x(\d+)/.exec(destroy[0])?.[1] ?? 0);
    expect(r.summary.economy.gold).toBe(11 + 10 * red);
  });
  // troop:7139 Ostryx (8688): chosen column; every Mystic ally (AllyType mystic) gets 3 Magic.
  it('troop:7139 gives 3 Magic to every Mystic ally', () => {
    const allies = [{ hp: 500, maxHp: 500, troopTypes: ['Mystic'] }, { hp: 400, maxHp: 400, troopTypes: ['Mystic'] }, { hp: 400, maxHp: 400 }];
    const r = castSpell({ key: 'troop:7139', allies });
    expect(r.summary.order).toContain('buff A1 magic+3');
    expect(r.summary.order).toContain('buff A2 magic+3');
    expect(r.summary.order.some(o => o.startsWith('buff A3 magic'))).toBe(false);
    expect(r.summary.order.find(o => o.startsWith('destroy '))).toMatch(/Yellow x3/);
    expect(r.summary.order).toContain('buff A1 armor+20');
  });
  // troop:6401 Hippocampus (7556): MultiplyForBlueTarget doubles the Life for a Blue ally.
  it('troop:6401 doubles the Life for a Blue ally', () => {
    const r = castSpell({ key: 'troop:6401', allies: [{ hp: 500, maxHp: 700, colors: [BaseColor.Blue] }], caster: { colors: [BaseColor.Blue] } });
    expect(r.summary.order.find(o => o.startsWith('buff '))).toMatch(/hp\+28 /);
  });
  // troop:6233 Dragotaur (7379): only Dragon allies, Attack and Armor both [Magic] + 2 x Yellow.
  it('troop:6233 boosts Attack and Armor of Dragon allies only', () => {
    const r = castSpell({ key: 'troop:6233', caster: { troopTypes: ['Dragon'] }, allies: [{ hp: 500, maxHp: 500, troopTypes: ['Dragon'] }, { hp: 500, maxHp: 500 }] });
    for (const u of ['C', 'A1']) { expect(r.summary.order).toContain(`buff ${u} attack+16`); expect(r.summary.order).toContain(`buff ${u} armor+16`); }
    expect(r.summary.order.some(o => o.startsWith('buff A2'))).toBe(false);
  });
});
