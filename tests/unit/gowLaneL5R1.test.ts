// sa-R3 lane review round 1, lane L5: conditions the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES, reviewBoard, withCells } from '../helpers/gowCast';
import { BaseColor, colorGem, specialGem } from '@engine/types';

const enemies = (over: Record<number, object>) => DEFAULT_ENEMIES.map((e, i) => ({ ...e, ...(over[i] ?? {}) }));
/** Board with at least `n` gems of `color` (rows 0.. filled left to right). */
const boardWith = (color: BaseColor, n: number) => (r: number, c: number) => (r * 8 + c < n ? colorGem(color) : reviewBoard(r, c));

describe('L5 sa-R3 B01', () => {
  it('weapon:1141 gives [Magic] Life to every ally (not just the caster)', () => {
    const r = castSpell({ key: 'weapon:1141' });
    expect(r.summary.order).toEqual(['cleanse C -poison', 'cleanse A1 -poison', 'buff C hp+10 max+10', 'buff A1 hp+10 max+10', 'buff A2 hp+10 max+10']);
  });
  it('troop:6296 armor boost [2:1]; Silence only Daemons, Burn only Undead (native order)', () => {
    const r = castSpell({ key: 'troop:6296', caster: { armor: 21 },
      enemies: enemies({ 0: { troopTypes: ['Daemon'] }, 1: { troopTypes: ['Undead'] }, 2: { troopTypes: ['Undead', 'Daemon'] } }) });
    const o = r.summary.order;
    expect(o.slice(0, 4)).toEqual(['dmg E10 22 (all)', 'dmg E11 22 (all)', 'dmg E12 22 (all)', 'dmg E13 22 (all)']); // 2 + 10 + floor(21/2)
    expect(o.filter(x => x.startsWith('status'))).toEqual(['status E10 +silence', 'status E12 +silence', 'status E11 +burning', 'status E12 +burning']);
  });
  it('weapon:1113 counts Yellow allies and enemies x2; +2 Magic only with 13+ Red gems', () => {
    const base = castSpell({ key: 'weapon:1113' });
    expect(base.summary.order[0]).toBe('dmg E10 18 (all)'); // 12 + 2 x (C, A2, E11)
    expect(base.summary.units.C).toBe('+barrier');
    const red = castSpell({ key: 'weapon:1113', board: boardWith(BaseColor.Red, 20) });
    expect(red.summary.order).toContain('buff C magic+2');
  });
  it('weapon:1374 counts Purple allies AND enemies x2; +2 Magic only with 13+ Brown gems', () => {
    const base = castSpell({ key: 'weapon:1374' });
    expect(base.summary.order[0]).toBe('dmg E10 16 (all)'); // 12 + 2 x (C, E12)
    expect(base.summary.order).not.toContain('buff C magic+2');
    const brown = castSpell({ key: 'weapon:1374', board: boardWith(BaseColor.Brown, 20) });
    expect(brown.summary.order).toContain('buff C magic+2');
  });
  it('weapon:1256 counts Blue allies AND enemies x4; heavy splash 75%', () => {
    const r = castSpell({ key: 'weapon:1256' });
    expect(r.summary.order.slice(0, 3)).toEqual(['dmg E11 27 (splash)', 'dmg E10 20 (splash)', 'dmg E12 20 (splash)']); // 15 + 4 x (C, A1, E11)
  });
  it('troop:7837 armor boost [1:1] then Stun and knock the target back', () => {
    const r = castSpell({ key: 'troop:7837', caster: { armor: 6 } });
    expect(r.summary.order).toEqual(['dmg E11 20 (splash)', 'dmg E10 15 (splash)', 'dmg E12 15 (splash)', 'status E11 +stun', 'move E11 back']);
  });
  it('weapon:1198 heals exactly the Armor removed', () => {
    const r = castSpell({ key: 'weapon:1198', target: 12 });
    expect(r.summary.order.slice(0, 2)).toEqual(['buff E12 armor-12', 'buff C hp+12 max+12']);
  });
});

describe('L5 sa-R3 B02', () => {
  const A = (o: object) => [{ hp: 500, maxHp: 700, armor: 4, ...o }, { hp: 650, maxHp: 650, armor: 8 }];
  const st = (id: string) => [{ id, turns: 99 }];
  it('troop:6248 x5 per Whitehelm ally (caster counts) and per Angel gem; gains Barrier', () => {
    expect(castSpell({ key: 'troop:6248' }).summary.order).toEqual(['dmg E11 19', 'status C +barrier']);
    const r = castSpell({ key: 'troop:6248', allies: A({ kingdom: '白盔国' }), board: withCells(reviewBoard, { '0,1': specialGem('angelGem'), '5,5': specialGem('angelGem') }) });
    expect(r.summary.order[0]).toBe('dmg E11 34'); // 14 + 5 x (2 Whitehelm + 2 Angel)
  });
  it('troop:7504 x4 per Bright Forest ally and per Faerie Fired enemy on both Life and Armor', () => {
    const r = castSpell({ key: 'troop:7504', allies: A({ kingdom: '皓彩森林' }), enemies: enemies({ 0: { statuses: st('faerie-fire') } }) });
    expect(r.summary.order).toEqual(['buff C hp+23 max+23', 'buff C armor+23', 'status C +barrier']); // 11 + 4 x (C, A1, E10)
  });
  it('troop:7171 x6 per Forest of Thorns ally; Silence the first enemy', () => {
    const one = castSpell({ key: 'troop:7171' }); const two = castSpell({ key: 'troop:7171', allies: A({ kingdom: '荆棘森林' }) });
    const total = (o: string[]) => o.filter(x => x.startsWith('dmg')).reduce((s, x) => s + Number(x.split(' ')[2]), 0);
    expect(total(one.summary.order)).toBe(22); expect(total(two.summary.order)).toBe(28);
    expect(one.summary.order.at(-1)).toBe('status E10 +silence');
  });
  it('weapon:1657 x8 per Umbral Star; 2 Bleed stacks on all enemies before the damage only with Immortal Leio', () => {
    const total = (o: string[]) => o.filter(x => x.startsWith('dmg')).reduce((s, x) => s + Number(x.split(' ')[2]), 0);
    const stars = castSpell({ key: 'weapon:1657', board: withCells(reviewBoard, { '0,1': specialGem('umbralStar') }) });
    expect(total(stars.summary.order)).toBe(24);
    expect(castSpell({ key: 'weapon:1657' }).summary.order.some(x => x.includes('bleed'))).toBe(false);
    const leio = castSpell({ key: 'weapon:1657', allies: A({ name: '不朽的雷奥' }) });
    expect(leio.summary.order.slice(0, 4)).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `status ${e} +bleed`));
    // state is read after the opponent's turn start, so one holder may already have self-cleansed (R004)
    const mags = leio.f.enemies.map(e => (e.statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude).filter(m => m !== undefined);
    expect(mags.length).toBeGreaterThanOrEqual(3); expect(new Set(mags)).toEqual(new Set([2]));
  });
  it('troop:7007 2 Bleed stacks on the last enemy before the damage only with Ulf Harrigan', () => {
    expect(castSpell({ key: 'troop:7007' }).summary.order).toEqual(['dmg E13 11']);
    const ulf = castSpell({ key: 'troop:7007', allies: A({ name: '尔福·哈利干' }) });
    expect(ulf.summary.order).toEqual(['status E13 +bleed', 'dmg E13 11']);
    expect((ulf.f.enemies[3].statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude).toBe(2);
  });
  it('weapon:1604 x3 per Angel gem on first and last; Bless all allies only with Immortal Libara', () => {
    const r = castSpell({ key: 'weapon:1604', allies: A({ name: '永生神利贝拉' }), board: withCells(reviewBoard, { '0,1': specialGem('angelGem') }) });
    expect(r.summary.order.filter(x => x.startsWith('dmg')).sort()).toEqual(['dmg E10 20', 'dmg E13 20']);
    expect(r.summary.order.filter(x => x.includes('blessed'))).toEqual(['status C +blessed', 'status A1 +blessed', 'status A2 +blessed']);
  });
  it('weapon:1705 x3 per Cursed enemy on both reductions; Silence only with Immortal Byblios', () => {
    const r = castSpell({ key: 'weapon:1705', allies: A({ name: '不朽的拜布利奥斯' }), enemies: enemies({ 1: { statuses: st('curse') }, 2: { statuses: st('curse') } }) });
    expect(r.summary.order).toEqual(['status E11 +silence', 'buff E11 attack-17', 'buff E11 magic-10']);
  });
  it('troop:7327 x3 per Webbed enemy; +10 only with The Silken Queen', () => {
    expect(castSpell({ key: 'troop:7327', enemies: enemies({ 0: { statuses: st('web') } }) }).summary.order).toEqual(['dmg E11 16']);
    expect(castSpell({ key: 'troop:7327', allies: A({ name: '丝绸女皇' }) }).summary.order).toEqual(['dmg E11 23']);
  });
  it('weapon:1605 Bleed all enemies only with Immortal Sagittarian; weapon:1471 Enchant self only with Arcanus', () => {
    const s = castSpell({ key: 'weapon:1605', allies: A({ name: '永生神萨克塔利安' }) });
    expect(s.summary.order.filter(x => x.includes('bleed'))).toContain('status E10 +bleed');
    expect(castSpell({ key: 'weapon:1471', allies: A({ name: '阿卡卢斯' }) }).summary.order).toEqual(['dmg E11 13', 'status C +enchanted']);
  });
});

describe('L5 sa-R3 B03', () => {
  const A = (o: object, o2: object = {}) => [{ hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], ...o }, { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red], ...o2 }];
  const st = (id: string) => [{ id, turns: 99 }];
  const bleedMag = (u: { statuses: { id: string }[] }) => (u.statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude;
  it('weapon:1474 2 Bleed stacks only with Desdaemona', () => {
    expect(castSpell({ key: 'weapon:1474' }).summary.order).toEqual(['dmg E11 13']);
    const r = castSpell({ key: 'weapon:1474', allies: A({ name: '黛希德莫娜' }) });
    expect(r.summary.order).toEqual(['dmg E11 13', 'status E11 +bleed']); expect(bleedMag(r.f.enemies[1])).toBe(2);
  });
  it('troop:6519 hits the chosen enemy and only the next one below; x8 per Merfolk and Submerged ally', () => {
    const r = castSpell({ key: 'troop:6519', allies: A({ troopTypes: ['Merfolk'] }, { statuses: st('submerged') }) });
    expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['dmg E11 39 (all)', 'dmg E12 39 (all)']); // 15 + 8 x (C, A1, A2)
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(['status C +submerged', 'status A1 +submerged', 'status E11 +silence']);
  });
  it('troop:6329 true damage x7 per Barriered ally and per Giant ally (caster is a Giant)', () => {
    expect(castSpell({ key: 'troop:6329', allies: A({ statuses: st('barrier') }, { troopTypes: ['Giant'] }) }).summary.order).toEqual(['dmg E11 36']);
  });
  it('weapon:1247 x3 per Daemon ally, then Curse and Burn all enemies', () => {
    const r = castSpell({ key: 'weapon:1247', allies: A({ troopTypes: ['Daemon'] }) });
    expect(r.summary.order[0]).toBe('dmg E10 14 (all)');
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual([...['E10', 'E11', 'E12', 'E13'].map(e => `status ${e} +curse`), ...['E10', 'E11', 'E12', 'E13'].map(e => `status ${e} +burning`)]);
  });
  it('troop:6912 double damage when Enraged; Enrage self only against a Daemon', () => {
    expect(castSpell({ key: 'troop:6912', caster: { statuses: st('rage') } }).summary.order).toEqual(['dmg E11 26']);
    expect(castSpell({ key: 'troop:6912', enemies: enemies({ 1: { troopTypes: ['Daemon'] } }) }).summary.order).toEqual(['dmg E11 13', 'status C +rage']);
  });
  it('troop:7005 Enchant all other allies only against an Elemental', () => {
    expect(castSpell({ key: 'troop:7005', enemies: enemies({ 1: { troopTypes: ['Elemental'] } }) }).summary.order).toEqual(['dmg E11 11', 'status A1 +enchanted', 'status A2 +enchanted']);
  });
  it('troop:6901 x6 per Undead enemy; Curse/Silence rolls only on an Undead target', () => {
    const r = castSpell({ key: 'troop:6901', enemies: enemies({ 0: { troopTypes: ['Undead'] }, 1: { troopTypes: ['Undead'] } }) });
    expect(r.summary.order[0]).toBe('dmg E11 25');
    let curse = 0, silence = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const o = castSpell({ key: 'troop:6901', seed, enemies: enemies({ 1: { troopTypes: ['Undead'] } }) }).summary.order;
      if (o.includes('status E11 +curse')) curse++; if (o.includes('status E11 +silence')) silence++;
    }
    expect(curse).toBeGreaterThan(5); expect(curse).toBeLessThan(35); expect(silence).toBeGreaterThan(5); expect(silence).toBeLessThan(35);
    for (let seed = 1; seed <= 10; seed++) expect(castSpell({ key: 'troop:6901', seed }).summary.order).toEqual(['dmg E11 13']);
  });
  it('troop:7601 x2 per Centaur ally (caster counts), then Barrier and Enchant', () => {
    expect(castSpell({ key: 'troop:7601', allies: A({ troopTypes: ['Centaur'] }) }).summary.order).toEqual(['buff A1 hp+15 max+15', 'status A1 +barrier', 'status A1 +enchanted']);
  });
  it('troop:6484 x4 per Fey ally; Disease on a random enemy about half the time', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) if (castSpell({ key: 'troop:6484', seed }).summary.order.some(x => x.endsWith('+disease'))) hits++;
    expect(hits).toBeGreaterThan(8); expect(hits).toBeLessThan(32);
  });
  it('troop:6384 x6 per Wildfolk ally; steal 1 Magic from each enemy hit, then Burn all', () => {
    const r = castSpell({ key: 'troop:6384', allies: A({ troopTypes: ['Wildfolk'] }) });
    expect(r.summary.order.slice(0, 3)).toEqual(['dmg E11 26 (splash)', 'dmg E10 13 (splash)', 'dmg E12 13 (splash)']);
    expect(r.summary.units.C).toBe('mag+3');
  });
});

describe('L5 sa-R3 B04', () => {
  const A = (o: object) => [{ hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], ...o }, { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red] }];
  const st = (id: string) => [{ id, turns: 99 }];
  const bleedMag = (u: { statuses: { id: string }[] }) => (u.statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude;
  it('troop:6899 steals at most the enemy Attack (CountMaxWithMagic) into Armor; Barrier only Wildfolk allies', () => {
    const r = castSpell({ key: 'troop:6899', enemies: enemies({ 1: { attack: 6 } }), allies: A({ troopTypes: ['Wildfolk'] }) });
    expect(r.summary.order).toEqual(['buff E11 attack-6', 'buff C armor+6', 'status C +barrier', 'status A1 +barrier']);
  });
  it('troop:6934 boosted by the first enemy Attack [3:1] (not mine); 2 Bleed stacks on it only when I am Enraged', () => {
    const r = castSpell({ key: 'troop:6934', caster: { attack: 90 }, enemies: enemies({ 0: { attack: 30 } }) });
    expect(r.summary.order).toEqual(['dmg E10 24']); // 14 + floor(30 x 0.34)
    const rage = castSpell({ key: 'troop:6934', caster: { statuses: st('rage') } });
    expect(rage.summary.order).toEqual(['dmg E10 19', 'status E10 +bleed']); expect(bleedMag(rage.f.enemies[0])).toBe(2);
  });
  it('troop:7668 boosted by target Attack [4:1]; 2 Bleed stacks only on a Red target', () => {
    const red = castSpell({ key: 'troop:7668', target: 10 });
    expect(red.summary.order).toEqual(['dmg E10 17', 'status E10 +bleed']); expect(bleedMag(red.f.enemies[0])).toBe(2);
  });
  it('troop:6290 boosted by the target enemy Attack only [2:1]', () => {
    expect(castSpell({ key: 'troop:6290', enemies: enemies({ 1: { attack: 40 } }) }).summary.order).toEqual(['dmg E11 31', 'status E11 +frozen']);
  });
  it('weapon:1221 Armor boosted by half the summed Attack of all enemies', () => {
    expect(castSpell({ key: 'weapon:1221' }).summary.order).toEqual(['buff A1 armor+45', 'status A1 +rage', 'status A1 +barrier']); // 11 + 68/2
  });
  it('weapon:1195 dispels all enemies first, then halves the target Attack', () => {
    const r = castSpell({ key: 'weapon:1195', enemies: enemies({ 1: { attack: 31, statuses: st('barrier') } }) });
    expect(r.summary.order.slice(0, 3).sort()).toEqual(['remove E10 -rage', 'remove E11 -barrier', 'remove E13 -rage']);
    expect(r.summary.order.slice(3)).toEqual(['dmg E11 15', 'buff E11 attack-15']);
  });
  it('troop:7072 [3:1] Blue gems boost', () => {
    const fn = boardWith(BaseColor.Blue, 30); let blue = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = fn(r, c); if (g?.kind === 'color' && g.color === BaseColor.Blue) blue++; }
    const r = castSpell({ key: 'troop:7072', board: fn });
    expect(r.summary.order.at(-1)).toBe(`dmg E11 ${11 + Math.floor(blue * 34 / 100)}`);
  });
});
