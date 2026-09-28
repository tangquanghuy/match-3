// sa-R3 lane review round 1, lane L5: conditions the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, DEFAULT_ENEMIES, reviewBoard, withCells } from '../helpers/gowCast';
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

describe('L5 sa-R3 B05', () => {
  const A = (o: object) => [{ hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], ...o }, { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red] }];
  const st = (id: string) => [{ id, turns: 99 }];
  const count = (fn: (r: number, c: number) => ReturnType<typeof colorGem> | null, pred: (g: ReturnType<typeof colorGem>) => boolean) => {
    let n = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = fn(r, c); if (g && pred(g)) n++; } return n;
  };
  const isColor = (col: BaseColor) => (g: ReturnType<typeof colorGem>) => g.kind === 'color' && g.color === col;
  it('weapon:1363 Death Mark first, then damage boosted by Yellow gems [2:1]', () => {
    const y = count(reviewBoard, isColor(BaseColor.Yellow));
    expect(castSpell({ key: 'weapon:1363' }).summary.order).toEqual(['status E11 +death-mark', `dmg E11 ${13 + Math.floor(y / 2)}`]);
  });
  it('troop:7118 slay chance 4% + 4% per Doomskull (24 Doomskulls = certain, one random enemy)', () => {
    const cells: Record<string, ReturnType<typeof colorGem>> = {};
    for (let i = 0; i < 24; i++) cells[`${Math.floor(i / 8) + 4},${i % 8}`] = specialGem('doomSkull');
    const r = castSpell({ key: 'troop:7118', board: withCells(reviewBoard, cells) });
    expect(r.summary.order.slice(0, 4)).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `status ${e} +disease`));
    expect(r.summary.order.filter(x => x.startsWith('defeat'))).toHaveLength(1);
    expect(castSpell({ key: 'troop:7118' }).summary.order.some(x => x.startsWith('defeat'))).toBe(false);
  });
  it('troop:7712 scatter boosted 1:1 by Red and Skull gems; then Burn one random enemy', () => {
    const n = count(reviewBoard, isColor(BaseColor.Red)) + count(reviewBoard, g => g.kind === 'skull');
    const o = castSpell({ key: 'troop:7712' }).summary.order;
    expect(o.filter(x => x.startsWith('dmg')).reduce((s, x) => s + Number(x.split(' ')[2]), 0)).toBe(14 + n);
    expect(o.filter(x => x.endsWith('+burning'))).toHaveLength(1);
  });
  it('troop:7190 x3 per Burning gem, Burning ally and Burning enemy', () => {
    const r = castSpell({ key: 'troop:7190', allies: A({ statuses: st('burning') }), enemies: enemies({ 0: { statuses: st('burning') } }),
      board: withCells(reviewBoard, { '0,1': specialGem('burningGem') }) });
    expect(r.summary.order).toEqual(['dmg E11 21']); // 12 + 3 x 3
  });
  it('troop:6649 boosted 1:1 by Red gems and Burning enemies; double under a Fire storm', () => {
    const red = count(reviewBoard, isColor(BaseColor.Red));
    const f = setupCast({ key: 'troop:6649', enemies: enemies({ 2: { statuses: st('burning') } }) });
    f.state.teams[f.side].storm = { color: BaseColor.Red, turns: 3, troopId: 1 } as never;
    const o = summarize(f, f.cast()).order;
    expect(o[0]).toBe(`dmg E10 ${2 * (11 + red + 1)} (all)`);
  });
  it('weapon:1528 x5 per Angel gem and per Barriered ally', () => {
    const r = castSpell({ key: 'weapon:1528', allies: A({ statuses: st('barrier') }), board: withCells(reviewBoard, { '0,1': specialGem('angelGem') }) });
    expect(r.summary.order).toEqual(['dmg E11 25']);
  });
  it('troop:7792 x2 per Entangle gem and Entangled enemy on Attack, Life and Armor', () => {
    const r = castSpell({ key: 'troop:7792', enemies: enemies({ 0: { statuses: st('entangle') } }), board: withCells(reviewBoard, { '0,1': specialGem('entangleGem') }) });
    expect(r.summary.order).toEqual(['buff C attack+13', 'buff C hp+13 max+13', 'buff C armor+13']);
  });
  it('troop:6962 boosted by Yellow gems [2:1]; Bless only Yellow allies', () => {
    const y = count(reviewBoard, isColor(BaseColor.Yellow));
    const o = castSpell({ key: 'troop:6962' }).summary.order;
    expect(o[0]).toBe(`dmg E10 ${11 + Math.floor(y / 2)} (all)`);
    expect(o.filter(x => x.endsWith('+blessed'))).toEqual(['status C +blessed', 'status A2 +blessed']);
  });
});

describe('L5 sa-R3 B06', () => {
  const st = (id: string) => [{ id, turns: 99 }];
  it('troop:7818 x3 per Poison gem; Curse then Bleed every enemy above and below the target', () => {
    const r = castSpell({ key: 'troop:7818', board: withCells(reviewBoard, { '0,1': specialGem('poisonGem'), '5,5': specialGem('poisonGem') }) });
    expect(r.summary.order[0]).toBe('dmg E11 20');
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(['E10', 'E12', 'E13'].map(e => `status ${e} +curse`).concat(['E10', 'E12', 'E13'].map(e => `status ${e} +bleed`)));
  });
  it('weapon:1649 x3 per Curse gem (not Cursed enemies); double vs a Poisoned target; then Poison', () => {
    expect(castSpell({ key: 'weapon:1649', enemies: enemies({ 0: { statuses: st('curse') } }) }).summary.order).toEqual(['dmg E11 13', 'status E11 +poison']);
    expect(castSpell({ key: 'weapon:1649', board: withCells(reviewBoard, { '0,1': specialGem('curseGem') }) }).summary.order[0]).toBe('dmg E11 16');
    expect(castSpell({ key: 'weapon:1649', enemies: enemies({ 1: { statuses: st('poison') } }) }).summary.order[0]).toBe('dmg E11 26');
  });
  it('troop:7653 double damage and Bleed only on a Purple target', () => {
    expect(castSpell({ key: 'troop:7653', target: 12 }).summary.order).toEqual(['dmg E12 72', 'status E12 +bleed']);
    expect(castSpell({ key: 'troop:7653' }).summary.order).toEqual(['dmg E11 36']);
  });
  it('troop:7673 double damage and Entangle only on a Daemon', () => {
    expect(castSpell({ key: 'troop:7673', enemies: enemies({ 1: { troopTypes: ['Daemon'] } }) }).summary.order).toEqual(['dmg E11 34', 'status E11 +entangle']);
  });
  it('troop:7128 Entangle only if the target has strictly more Attack, Disease only if strictly more Armor', () => {
    expect(castSpell({ key: 'troop:7128', caster: { attack: 17, armor: 10 } }).summary.order).toEqual(['dmg E11 16']); // ties
    expect(castSpell({ key: 'troop:7128', caster: { attack: 16, armor: 20 } }).summary.order).toEqual(['dmg E11 16', 'status E11 +entangle']);
    // compared after the hit (native order): E11 armor 30 - 16 = 14 > 9
    expect(castSpell({ key: 'troop:7128', caster: { attack: 30, armor: 9 }, enemies: enemies({ 1: { armor: 30 } }) }).summary.order).toEqual(['dmg E11 16', 'status E11 +disease']);
  });
  it('troop:7875 x2 per Web gem; double vs a Webbed target', () => {
    expect(castSpell({ key: 'troop:7875', board: withCells(reviewBoard, { '0,1': specialGem('web') }) }).summary.order[0]).toBe('dmg E11 15');
    expect(castSpell({ key: 'troop:7875', enemies: enemies({ 1: { statuses: st('web') } }) }).summary.order[0]).toBe('dmg E11 26');
  });
});

describe('L5 sa-R3 B07', () => {
  const A = (o: object) => [{ hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], ...o }, { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red] }];
  const st = (id: string) => [{ id, turns: 99 }];
  const bleedMag = (u: { statuses: { id: string }[] }) => (u.statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude;
  const reds = (() => { let n = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = reviewBoard(r, c); if (g?.kind === 'color' && g.color === BaseColor.Red) n++; } return n; })();
  it('troop:7759 x3 per Enrage gem; Barrier only if the ally is already Enraged', () => {
    const r = castSpell({ key: 'troop:7759', allies: A({ statuses: st('rage') }), board: withCells(reviewBoard, { '0,1': specialGem('enrageGem') }) });
    expect(r.summary.order).toEqual(['buff A1 hp+14 max+14', 'buff A1 armor+14', 'status A1 +barrier']);
  });
  it('troop:6368 Red gems [3:1] boost both Life and Attack', () => {
    const b = 11 + Math.floor(reds * 34 / 100);
    expect(castSpell({ key: 'troop:6368' }).summary.order).toEqual([`buff C hp+${b} max+${b}`, `buff C attack+${b}`, 'status C +rage']);
  });
  it('troop:7310 2 Magic + 1 per Spirit gem, Enchant, Red allies only', () => {
    const r = castSpell({ key: 'troop:7310', board: withCells(reviewBoard, { '0,1': specialGem('spiritGem', undefined, BaseColor.Red), '5,5': specialGem('spiritGem', undefined, BaseColor.Blue) }) });
    expect(r.summary.order).toEqual(['buff C magic+4', 'buff A2 magic+4', 'status C +enchanted', 'status A2 +enchanted']);
  });
  it('weapon:1279 Stuns only the splashed troops (target and its neighbours)', () => {
    const r = castSpell({ key: 'weapon:1279' });
    expect(r.summary.order.filter(x => x.startsWith('status')).sort()).toEqual(['status E10 +stun', 'status E11 +stun', 'status E12 +stun']);
  });
  it('troop:7550 x3 per Entangle gem, true damage, then Disease all', () => {
    const r = castSpell({ key: 'troop:7550', board: withCells(reviewBoard, { '0,1': specialGem('entangleGem') }) });
    expect(r.summary.order[0]).toBe('dmg E10 15 (all)');
  });
  it('troop:7464 25% per Lycanthropy gem to inflict 4 Bleed stacks on the first two (4 gems = certain)', () => {
    const cells: Record<string, ReturnType<typeof specialGem>> = { '0,1': specialGem('lycanthropyGem'), '2,2': specialGem('lycanthropyGem'), '5,5': specialGem('lycanthropyGem'), '6,1': specialGem('lycanthropyGem') };
    const r = castSpell({ key: 'troop:7464', board: withCells(reviewBoard, cells) });
    expect(r.summary.order).toEqual(['dmg E10 13 (all)', 'dmg E11 13 (all)', 'status E10 +bleed', 'status E11 +bleed']);
    expect(bleedMag(r.f.enemies[1])).toBe(4);
  });
  it('troop:6855 drain is capped by the target Life; weapon:1352 steal is capped by the target Magic', () => {
    expect(castSpell({ key: 'weapon:1352', enemies: enemies({ 1: { magic: 4 } }) }).summary.order).toEqual(['buff E11 magic-4', 'buff C attack+4', 'status C +rage']);
    expect(castSpell({ key: 'troop:6855', enemies: enemies({ 1: { hp: 3 } }) }).summary.units.C).toBe('arm+3');
  });
});

describe('L5 sa-R3 B08', () => {
  const A = (o: object) => [{ hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], ...o }, { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red] }];
  const st = (id: string) => [{ id, turns: 99 }];
  it('troop:6985 Enrage self if my Attack is higher; -10 target Attack only if theirs is higher; ties do neither', () => {
    expect(castSpell({ key: 'troop:6985' }).summary.order).toEqual(['dmg E11 13', 'status E11 +frozen']);
    expect(castSpell({ key: 'troop:6985', caster: { attack: 30 } }).summary.order).toEqual(['dmg E11 13', 'status E11 +frozen', 'status C +enraged']); // alias of rage (RAGE_STATUS_IDS)
    expect(castSpell({ key: 'troop:6985', caster: { attack: 5 } }).summary.order).toEqual(['dmg E11 13', 'status E11 +frozen', 'buff E11 attack-10']);
  });
  it('troop:6756 x2 per Diseased enemy', () => {
    expect(castSpell({ key: 'troop:6756', enemies: enemies({ 0: { statuses: st('disease') }, 2: { statuses: st('disease') } }) }).summary.order).toEqual(['status C +rage', 'buff C attack+15']);
  });
  it('troop:7279 Faerie Fire first (spell damage x1.5), boosted x3 per Bleeding enemy', () => {
    expect(castSpell({ key: 'troop:7279', enemies: enemies({ 0: { statuses: st('bleed') } }) }).summary.order).toEqual(['status E11 +faerie-fire', 'dmg E11 21']); // round((11 + 3) x 1.5)
  });
  it('troop:7143 x3 per Blue enemy (not Blue gems) and per Frozen enemy', () => {
    expect(castSpell({ key: 'troop:7143' }).summary.order[0]).toBe('dmg E10 14 (all)');
    expect(castSpell({ key: 'troop:7143', enemies: enemies({ 2: { statuses: st('frozen') } }) }).summary.order[0]).toBe('dmg E10 17 (all)');
  });
  it('troop:6986 x2 per Burning/Enraged ally and enemy', () => {
    const r = castSpell({ key: 'troop:6986', allies: A({ statuses: st('burning') }) });
    expect(r.summary.order[0]).toBe('dmg E10 17 (all)'); // 11 + 2 x (A1 burning, E10 + E13 enraged)
  });
  it('troop:6893 x6 per Burning and Diseased enemy; troop:6952 x5 per Burning and Faerie Fired enemy on the first two', () => {
    const en = enemies({ 0: { statuses: st('burning') }, 3: { statuses: st('disease') } });
    expect(castSpell({ key: 'troop:6893', enemies: en }).summary.order).toEqual(['dmg E11 27']);
    expect(castSpell({ key: 'troop:6952', enemies: enemies({ 2: { statuses: st('burning') }, 3: { statuses: st('faerie-fire') } }) }).summary.order).toEqual(['dmg E10 24 (all)', 'dmg E11 24 (all)']);
  });
});

describe('L5 sa-R3 B09', () => {
  const st = (...ids: string[]) => ids.map(id => ({ id, turns: 99 }));
  const two = (a: string, b: string) => enemies({ 0: { statuses: st(a) }, 2: { statuses: st(b) }, 3: { statuses: st(a, b) } });
  const kills = (key: string, en: object[]) => { let n = 0; for (let seed = 1; seed <= 60; seed++) if (castSpell({ key, seed, enemies: en }).summary.order.includes('defeat E11')) n++; return n; };
  it('status-count boosts: each listed status on each enemy counts once', () => {
    expect(castSpell({ key: 'troop:7863', enemies: two('entangle', 'bleed') }).summary.order[0]).toBe('dmg E10 20 (all)'); // 12 + 2 x 4
    expect(castSpell({ key: 'troop:7547', enemies: two('curse', 'web') }).summary.order).toEqual(['dmg E11 25', 'status E11 +poison']);
    expect(castSpell({ key: 'weapon:1505', enemies: two('web', 'poison') }).summary.order).toEqual(['dmg E11 26', 'status E11 +web', 'status E11 +poison']);
    expect(castSpell({ key: 'troop:6478', enemies: two('disease', 'poison') }).summary.order[0]).toBe('dmg E10 19 (all)');
    const total = (o: string[]) => o.filter(x => x.startsWith('dmg')).reduce((s, x) => s + Number(x.split(' ')[2]), 0);
    expect(total(castSpell({ key: 'troop:6350', enemies: two('poison', 'death-mark') }).summary.order)).toBe(16 + 28);
    const bw = castSpell({ key: 'troop:6790', enemies: two('entangle', 'bleed') }).summary.order;
    expect(bw.slice(0, 3)).toEqual(['dmg E11 50 (splash)', 'dmg E10 37 (splash)', 'dmg E12 37 (splash)']);
    expect(castSpell({ key: 'troop:6813', enemies: two('frozen', 'burning') }).summary.order).toEqual(['dmg E10 20', 'buff C hp+20 max+20']);
  });
  it('slay chance grows with the status counts (Velenne 10% + 4 each, Grimborn / Bothros 20% + 5 each)', () => {
    expect(kills('troop:6950', DEFAULT_ENEMIES)).toBeLessThan(15);
    expect(kills('troop:6950', two('curse', 'web'))).toBeGreaterThan(8);
    const many = (a: string, b: string) => DEFAULT_ENEMIES.map(e => ({ ...e, statuses: st(a, b) }));
    // 20 + 5 x 8 = 60% over 60 seeds vs 20% base
    const g = kills('troop:7624', many('frozen', 'bleed')); expect(g).toBeGreaterThan(24); expect(g).toBeLessThan(50);
    const b = kills('troop:7762', many('poison', 'death-mark')); expect(b).toBeGreaterThan(24); expect(b).toBeLessThan(50);
    expect(kills('troop:7762', DEFAULT_ENEMIES)).toBeLessThan(22);
  });
});

describe('L5 sa-R3 B10', () => {
  const A = (o: object, o2: object = {}) => [{ hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], ...o }, { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red], ...o2 }];
  const st = (id: string) => [{ id, turns: 99 }];
  const hits = (o: string[]) => o.filter(x => x.startsWith('dmg')).map(x => x.split(' ')[1]);
  it('troop:7650 / troop:7688 random hits only avoid the previous target (repeats allowed, never back-to-back)', () => {
    let repeat650 = false, repeat688 = false;
    for (let seed = 1; seed <= 40; seed++) {
      const a = hits(castSpell({ key: 'troop:7650', seed }).summary.order); expect(a).toHaveLength(3);
      const b = hits(castSpell({ key: 'troop:7688', seed }).summary.order); expect(b).toHaveLength(4);
      for (const h of [a, b]) for (let i = 1; i < h.length; i++) expect(h[i]).not.toBe(h[i - 1]);
      if (new Set(a).size < 3) repeat650 = true; if (new Set(b).size < 4) repeat688 = true;
    }
    expect(repeat650).toBe(true); expect(repeat688).toBe(true);
  });
  it('troop:7650 x3 per Enchanted ally and enemy; troop:7688 x2 per Enraged ally and enemy', () => {
    expect(castSpell({ key: 'troop:7650', allies: A({ statuses: st('enchanted') }), enemies: enemies({ 1: { statuses: st('enchanted') } }) }).summary.order[0]).toMatch(/^dmg E\d+ 18$/);
    expect(castSpell({ key: 'troop:7688', allies: A({ statuses: st('rage') }) }).summary.order[0]).toMatch(/^dmg E\d+ 15$/); // 9 + 2 x (A1, E10, E13)
  });
  it('troop:7791 x1.5 per Blessed ally and enemy (other allies)', () => {
    expect(castSpell({ key: 'troop:7791', allies: A({ statuses: st('blessed') }, { statuses: st('blessed') }) }).summary.order[0]).toBe('dmg E10 13 (all)');
  });
  it('single-source status boosts', () => {
    expect(castSpell({ key: 'troop:6311', enemies: enemies({ 0: { statuses: st('entangle') } }) }).summary.order).toEqual(['dmg E11 16']);
    expect(castSpell({ key: 'troop:6417', allies: A({ statuses: st('enchanted') }) }).summary.order[0]).toBe('dmg E10 13 (all)');
    expect(castSpell({ key: 'troop:6637', enemies: enemies({ 0: { statuses: st('web') } }) }).summary.order).toEqual(['dmg E11 18']);
    expect(castSpell({ key: 'troop:6811', allies: A({ statuses: st('rage') }) }).summary.order).toEqual(['dmg E11 18']);
    expect(castSpell({ key: 'troop:6823', allies: A({ statuses: st('submerged') }) }).summary.order).toEqual(['dmg E11 18']);
    expect(castSpell({ key: 'weapon:1218', enemies: enemies({ 0: { statuses: st('frozen') }, 3: { statuses: st('frozen') } }) }).summary.order[0]).toBe('dmg E10 21 (all)');
    expect(castSpell({ key: 'troop:7508', allies: A({ statuses: st('barrier') }) }).summary.order).toEqual(['dmg E11 23', 'status C +barrier']);
  });
});
