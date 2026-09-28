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

describe('L4a R3 B03', () => {
  const scatterTotal = (order: string[]) => order.filter(o => o.startsWith('dmg ') && o.endsWith('(scatter)')).reduce((s, o) => s + Number(o.split(' ')[2]), 0);
  // troop:6303 RockSpirit (7453) / weapon:1117 WardensGauntlets (7269): RowAndColumn = one 15-cell cross, count in the cross.
  it.each([
    ['troop:6303', 4, 4, 'Brown'],
    ['weapon:1117', 3, 3, 'Green'],
  ] as const)('%s destroys one cross and scales by %s-colour gems in it', (key, base, per, colour) => {
    const r = castSpell({ key });
    const destroy = r.summary.order.filter(o => o.startsWith('destroy '));
    expect(destroy.length).toBe(1);
    expect(destroy[0].startsWith('destroy 15')).toBe(true);
    const n = Number(new RegExp(`${colour} x(\\d+)`).exec(destroy[0])?.[1] ?? 0);
    expect(scatterTotal(r.summary.order)).toBe(base + 10 + per * n);
  });
  // troop:6720 CorpseMare (8090): CountGems Skull 200 Row → only Skulls in the destroyed row.
  it('troop:6720 steals 1 + 10 + 2 per destroyed Skull', () => {
    expect(castSpell({ key: 'troop:6720' }).summary.order).toContain('dmg E10 11');
    const board = withCells(reviewBoard, { '3,0': skullGem(), '3,7': skullGem() });
    expect(castSpell({ key: 'troop:6720', board }).summary.order.some(o => /^dmg E10 15/.test(o))).toBe(true);
  });
  // troop:7539 FeyDragoon (9297): CountGems Freeze counts Freeze gems (2 here), not every gem in their 3x3 explosions.
  it('troop:7539 boosts by the number of Freeze gems', () => {
    const board = withCells(reviewBoard, { '1,6': specialGem('freezeGem'), '6,1': specialGem('freezeGem') });
    const r = castSpell({ key: 'troop:7539', board });
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBeGreaterThan(0);
    expect(r.summary.order).toContain('dmg E11 15');
  });
});

describe('L4a R3 B04', () => {
  // troop:7304 KingOfRavens (8916): CountGems Spirit x6 before the explosions.
  it('troop:7304 boosts by the Spirit gems it explodes', () => {
    const board = withCells(reviewBoard, { '1,6': specialGem('spiritGem', undefined, BaseColor.Red), '6,1': specialGem('spiritGem', undefined, BaseColor.Green) });
    const r = castSpell({ key: 'troop:7304', board });
    expect(r.summary.order).toContain('dmg E12 25 (all)');
    expect(r.summary.order).toContain('dmg E13 25 (all)');
  });
  // troop:7586 Astaroth (9465): explode 1 random gem per Portal first, then damage by Portals left on the board.
  it('troop:7586 explodes before the damage', () => {
    const board = withCells(reviewBoard, { '0,7': specialGem('daemonicPortalGem'), '7,0': specialGem('daemonicPortalGem') });
    const r = castSpell({ key: 'troop:7586', board, seed: 3 });
    const iExplode = r.summary.order.findIndex(o => o.startsWith('explode '));
    const iDmg = r.summary.order.findIndex(o => o.startsWith('dmg '));
    expect(iExplode).toBeGreaterThanOrEqual(0);
    expect(iExplode).toBeLessThan(iDmg);
  });
  // troop:6778 WarWolf (8168): CountGems Skull 300 Block3x3 → 4 + 3 per Skull in the 3x3.
  it('troop:6778 creates 4 + 3 per exploded Skull', () => {
    expect(castSpell({ key: 'troop:6778' }).summary.gems.created.Red).toBe(7); // (4,2) Skull next to 3,3
    const board = withCells(reviewBoard, { '2,2': skullGem(), '2,3': skullGem() });
    expect(castSpell({ key: 'troop:6778', board }).summary.gems.created.Red).toBe(13);
  });
});

describe('L4a R3 B05', () => {
  const scatterTotal = (order: string[]) => order.filter(o => o.startsWith('dmg ') && o.endsWith('(scatter)')).reduce((s, o) => s + Number(o.split(' ')[2]), 0);
  // weapon:1523 Sparkhammer (8995): Bombs in the 3x3 around the chosen gem, x2.
  it('weapon:1523 counts the Bomb in the exploded 3x3', () => {
    const board = withCells(reviewBoard, { '2,3': specialGem('bomb') });
    expect(castSpell({ key: 'weapon:1523', board }).summary.order).toContain('buff C armor+13');
    // a Bomb elsewhere on the board does not count
    const far = withCells(reviewBoard, { '7,7': specialGem('bomb') });
    expect(castSpell({ key: 'weapon:1523', board: far }).summary.order).toContain('buff C armor+11');
  });
  // troop:6188 WinterKnight (7329): explode the chosen Mana Gem; [Magic] + 2 x Blue in the 3x3.
  it('troop:6188 explodes the chosen gem', () => {
    const board = withCells(reviewBoard, { '2,2': colorGem(BaseColor.Blue), '4,4': colorGem(BaseColor.Blue) });
    const r = castSpell({ key: 'troop:6188', board });
    expect(r.summary.order).toContain('buff C armor+16'); // 10 + 2 x 3 (2,2 / 4,4 set Blue, 2,3 Blue on the review board)
  });
  // troop:6793 WildKnight (8184): Attack and Life both [Magic + 1] + 3 x Green in the 3x3.
  it('troop:6793 boosts Attack and Life', () => {
    const r = castSpell({ key: 'troop:6793' });
    expect(r.summary.order).toContain('buff C attack+17');
    expect(r.summary.order.some(o => o.startsWith('buff C hp+17'))).toBe(true);
  });
  // troop:7821 StormOracle (9865): chosen gem; scatter total 8 + 10 + 8 x Yellow in the 3x3.
  it('troop:7821 explodes the chosen gem', () => {
    const board = withCells(reviewBoard, { '2,2': colorGem(BaseColor.Yellow) });
    // 3,3 is Yellow on the review board, plus 2,2
    expect(scatterTotal(castSpell({ key: 'troop:7821', board }).summary.order)).toBe(18 + 8 * 2);
  });
  // troop:7543 Emberclaw (9318): Elemental Stars on the whole board before the row explodes, x5.
  it('troop:7543 counts Elemental Stars in and outside the exploded row', () => {
    expect(castSpell({ key: 'troop:7543' }).summary.order).toContain('dmg E10 12 (all)');
    const board = withCells(reviewBoard, { '3,5': specialGem('elementalStar'), '7,7': specialGem('elementalStar') });
    expect(castSpell({ key: 'troop:7543', board }).summary.order).toContain('dmg E10 22 (all)');
  });
  // troop:7044 Researcher (8569): one explosion of 2 + Bombs counted before it.
  it('troop:7044 explodes 2 + Bombs in one step', () => {
    const r = castSpell({ key: 'troop:7044' });
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBe(1);
  });
  // troop:7086 TerraWyrm (8614): Attack and Armor both 1 + 10 + floor(Skulls / 2).
  it('troop:7086 boosts Attack and Armor', () => {
    const r = castSpell({ key: 'troop:7086' });
    expect(r.summary.order.slice(0, 2)).toEqual(['buff C attack+13', 'buff C armor+13']);
  });
});

describe('L4a R3 B06', () => {
  // Remove-all weapons (R010): damage = base + 10 + floor(removed x Amount / 100); native CountGems before RemoveColor.
  it.each([
    ['weapon:1036', 'E13', 3, 9, 34],
    ['weapon:1037', 'E11', 4, 11, 50],
    ['weapon:1038', 'E11', 4, 9, 34],
    ['weapon:1039', 'E12', 2, 8, 34],
    ['weapon:1040', 'E10', 4, 9, 34],
    ['weapon:1044', 'E11', 2, 13, 50],
  ] as const)('%s boosted by removed gems', (key, target, base, removed, pct) => {
    const r = castSpell({ key });
    expect(r.summary.order.some(o => o.startsWith(`destroy ${removed} `))).toBe(true);
    expect(r.summary.order.some(o => o === `dmg ${target} ${base + 10 + Math.floor(removed * pct / 100)}` || o.startsWith(`dmg ${target} ${base + 10 + Math.floor(removed * pct / 100)} `))).toBe(true);
  });
  // troop:7018 RockSquid (8525): Armor = 2 x gems removed (no base).
  it('troop:7018 gains 2 Armor per removed gem', () => {
    expect(castSpell({ key: 'troop:7018' }).summary.order).toContain('buff C armor+18');
    expect(castSpell({ key: 'troop:7018', magic: 0 }).summary.order).toContain('buff C armor+2');
  });
});

describe('L4a R3 B07', () => {
  // weapon:1138 DragonOak (7308): remove all gems of one of the chosen enemy's colours; 5 + 10 + floor(removed / 2).
  it.each([1, 2, 3, 4])('weapon:1138 removes a colour of the chosen enemy (seed %i)', (seed) => {
    const r = castSpell({ key: 'weapon:1138', seed }); // E11 is Yellow/Blue: 9 Yellow or 11 Blue on the review board
    const d = r.summary.order.find(o => o.startsWith('destroy '))!;
    const m = /^destroy (\d+) \((Yellow|Blue) x\d+\)$/.exec(d);
    expect(m).not.toBeNull();
    expect(r.summary.order.some(o => o.startsWith(`dmg E11 ${15 + Math.floor(Number(m![1]) / 2)}`))).toBe(true);
  });
});
