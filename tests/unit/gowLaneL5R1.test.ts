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
