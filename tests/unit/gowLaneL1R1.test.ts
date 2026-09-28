// sa-R5 lane L1 review round 2: native Charm skills (R008: Charm = temporary negative status) and summon
// distributions the four standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import { castSpell, sixColourBoard, registry, entitySkill, withCells, reviewBoard } from '../helpers/gowCast';
import { skullGem } from '@engine/types';
import { TROOPS } from '../../src/data/troops';
type St = { id: string; turns: number }[];
const sub: St = [{ id: 'submerged', turns: 99 }];
const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
describe('L1 R2 charm family (sa-R5)', () => {
  // troop:7803 native Charm -> StealLife [Magic + 1] -> LethalDamageConditional (AddForSubmerged 50) -> CauseSubmerged.
  it.each([
    { already: true, kills: [60, 140] as const },
    { already: false, kills: [0, 0] as const },
  ])('troop:7803 50% execute only when the enemy was ALREADY Submerged ($already)', ({ already, kills }) => {
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = castSpell({ key: 'troop:7803', seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 0, statuses: already ? sub : [] }] });
      expect(r.summary.order.slice(0, 2)).toEqual(['status E11 +charm', 'dmg E11 11']);
      if (r.f.enemies[1].defeated) n++;
      else expect(r.summary.units.E11).toBe('hp-11 +charm+submerged');
    }
    expect(n).toBeGreaterThanOrEqual(kills[0]); expect(n).toBeLessThanOrEqual(kills[1]);
  });
  // troop:7793 Charm@RandomEnemy + drain 8 FromPrevious, Charm@RandomPrefNotPrevEnemy + drain 8 (R007-3).
  it('troop:7793 a lone enemy is drained twice (16); two enemies get 8 each', () => {
    const lone = castSpell({ key: 'troop:7793', enemies: [{ mana: 20 }] });
    expect(lone.summary.order).toEqual(['status E10 +charm', 'buff E10 mana-8', 'status E10 +charm', 'buff E10 mana-8']);
    for (let seed = 1; seed <= 30; seed++) {
      const r = castSpell({ key: 'troop:7793', seed, enemies: [{ mana: 20 }, { mana: 20 }] });
      expect(r.summary.units).toEqual({ E10: 'mana-8 +charm', E11: 'mana-8 +charm' });
    }
  });
  // troop:6305 two independent Charm@RandomEnemy steps: the second may repeat the first.
  it('troop:6305 charms one or two distinct enemies', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = castSpell({ key: 'troop:6305', seed });
      const hits = r.summary.order.filter(o => o.startsWith('status')).map(o => o.split(' ')[1]);
      expect(hits).toHaveLength(2);
      seen.add(new Set(hits).size);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });
  // troop:7515 native Summoning Incubus, Succubus 50%, Incubus 25% (independent): 1/2/3 = 37.5/50/12.5%.
  it('troop:7515 always summons an Incubus first; count distribution follows the native chances', () => {
    const counts: string[] = []; const firsts = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const r = castSpell({ key: 'troop:7515', seed, allies: [] });
      const names = Object.entries(r.summary.units).filter(([, v]) => v.startsWith('new ')).map(([k, v]) => `${k}:${v.split(' ')[1]}`).sort();
      firsts.add(names[0].split(':')[1]);
      counts.push(String(names.length));
    }
    expect([...firsts]).toEqual(['魅魔']);
    const t = tally(counts);
    expect(t['1']).toBeGreaterThan(110); expect(t['1']).toBeLessThan(190);
    expect(t['2']).toBeGreaterThan(160); expect(t['2']).toBeLessThan(240);
    expect(t['3']).toBeGreaterThan(25); expect(t['3']).toBeLessThan(80);
  });
  // troop:6498 native SummoningNoError Bombot + 2 x 50%: 1/2/3 = 25/50/25%.
  it('troop:6498 Bombot count 1/2/3 = 25/50/25%', () => {
    const t = tally(Array.from({ length: 400 }, (_, i) => String(castSpell({ key: 'troop:6498', seed: i + 1, allies: [] }).summary.summons.length)));
    expect(t['1']).toBeGreaterThan(65); expect(t['1']).toBeLessThan(140);
    expect(t['2']).toBeGreaterThan(160); expect(t['2']).toBeLessThan(240);
    expect(t['3']).toBeGreaterThan(65); expect(t['3']).toBeLessThan(140);
  });
  // troop:6605 Randomize AB-CD: (Charm + 40% -> Succubus) or (Charm + 40% -> Incubus): 40% transform, either troop.
  it('troop:6605 charms the chosen enemy; 40% transform into Succubus or Incubus', () => {
    const outs: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const o = castSpell({ key: 'troop:6605', seed }).summary.order;
      expect(o[0]).toBe('status E11 +charm');
      outs.push(o.find(x => x.startsWith('transform')) ?? 'none');
    }
    const t = tally(outs);
    expect(Object.keys(t).sort()).toEqual(['none', 'transform E11 -> 魅妖', 'transform E11 -> 魅魔'].sort());
    expect(t.none).toBeGreaterThan(205); expect(t.none).toBeLessThan(275);
  });
  // troop:6177 Randomize ABC-DEF: scatter + charm, then Bless all allies OR +3 Magic to all allies, only if wounded.
  it('troop:6177 wounded -> bless or +3 magic; unwounded -> neither', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const o = castSpell({ key: 'troop:6177', seed }).summary.order;
      expect(o.filter(x => x.includes('(scatter)')).reduce((s, x) => s + Number(x.split(' ')[2]), 0)).toBe(19);
      expect(o.filter(x => x.endsWith('+charm'))).toHaveLength(1);
      seen.add(o.some(x => x === 'status C +blessed') ? 'bless' : o.includes('buff C magic+3') ? 'magic' : 'none');
      const full = castSpell({ key: 'troop:6177', seed, caster: { hp: 1000, maxHp: 1000 } }).summary.order;
      expect(full.some(x => x.includes('+blessed') || x.includes('magic+'))).toBe(false);
    }
    expect([...seen].sort()).toEqual(['bless', 'magic']);
  });
  // B02 devour family: native ConsumeConditional precedes the damage (R001). A devoured enemy takes no hit;
  // the caster gains its stats; non-matching targets are only hit.
  it.each([
    { key: 'troop:6185', hit: 12, dbl: 24, yes: { troopTypes: ['Knight'] }, p: 0.5 },
    { key: 'troop:6330', hit: 12, dbl: 24, yes: { troopTypes: ['Beast'] }, p: 0.1 },
    { key: 'troop:6404', hit: 14, dbl: 14, yes: { colors: ['Blue'] }, p: 0.3 },
    { key: 'troop:6459', hit: 15, dbl: 15, yes: { statuses: sub }, p: 0.5 },
    { key: 'troop:6577', hit: 14, dbl: 14, yes: { statuses: [{ id: 'web', turns: 99 }] }, p: 0.5 },
    { key: 'troop:6577', hit: 14, dbl: 14, yes: { statuses: [{ id: 'web', turns: 99 }, { id: 'entangle', turns: 99 }] }, p: 0.75 },
  ])('$key devours first with p=$p, otherwise hits for $dbl', ({ key, hit, dbl, yes, p }) => {
    let dev = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const o = castSpell({ key, seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 10, attack: 20, colors: ['Red'], ...yes } as never] }).summary.order;
      if (/^dmg E11 \d+ devoured$/.test(o[0])) { dev++; expect(o.filter(x => x.startsWith('dmg'))).toHaveLength(1); expect(o).toContain('buff C hp+900'); }
      else expect(o[0]).toBe(`dmg E11 ${dbl}`);
    }
    expect(dev / 300).toBeGreaterThan(p - 0.1); expect(dev / 300).toBeLessThan(p + 0.1);
    for (let seed = 1; seed <= 20; seed++)
      expect(castSpell({ key, seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 10, colors: ['Red'] } as never] }).summary.order).toEqual([`dmg E11 ${hit}`]);
  });
  // troop:7050 native ConsumeConditional@LastEnemy 20% only if ALREADY Frozen, then Damage, then Freeze.
  it.each([
    { frozen: true, p: 0.2 }, { frozen: false, p: 0 },
  ])('troop:7050 devour the last enemy only if already Frozen ($frozen)', ({ frozen, p }) => {
    let dev = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const o = castSpell({ key: 'troop:7050', seed, enemies: [{}, {}, {}, { hp: 800, maxHp: 800, armor: 3, statuses: frozen ? [{ id: 'frozen', turns: 99 }] : [] }] }).summary.order;
      if (/^dmg E13 \d+ devoured$/.test(o[0])) { dev++; expect(o.slice(1).filter(x => x.startsWith('dmg') || x.startsWith('status'))).toEqual(['dmg E12 12', 'status E12 +frozen']); }
      else expect(o).toEqual(['dmg E13 12', 'status E13 +frozen']);
    }
    expect(dev / 300).toBeGreaterThanOrEqual(Math.max(0, p - 0.08)); expect(dev / 300).toBeLessThanOrEqual(p + 0.08);
  });
  // troop:6832 second hit RandomPrefNotPrevEnemy: never the chosen enemy while another is alive; lone enemy hit twice.
  it('troop:6832 random hit avoids the chosen enemy', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const o = castSpell({ key: 'troop:6832', seed }).summary.order.filter(x => x.startsWith('dmg') && !x.endsWith('devoured'));
      if (o.length === 2) expect(o[1].split(' ')[1]).not.toBe('E11');
    }
    const lone = castSpell({ key: 'troop:6832', seed: 3, enemies: [{ hp: 900, maxHp: 900, armor: 0, colors: ['Red'] } as never], target: 10 }).summary.order;
    expect(lone.filter(x => x.startsWith('dmg')).length).toBeGreaterThanOrEqual(1);
  });
  // troop:7654 13+ Skulls -> Devour (stat gain, no hit); otherwise [(Magic x 2) + 2] true damage. Then 9 Skulls.
  it.each([{ skulls: 13, dev: true }, { skulls: 12, dev: false }])('troop:7654 with $skulls skulls devour=$dev', ({ skulls, dev }) => {
    const cells = new Set(Array.from({ length: skulls }, (_, i) => `${7 - Math.floor(i / 8)},${i % 8}`));
    const board = (r: number, c: number) => cells.has(`${r},${c}`) ? skullGem() : sixColourBoard(r, c);
    const o = castSpell({ key: 'troop:7654', board, enemies: [{}, { hp: 900, maxHp: 900, armor: 10, attack: 20 }] }).summary.order;
    if (dev) { expect(o[0]).toMatch(/^dmg E11 \d+ devoured$/); expect(o).toContain('buff C attack+20'); expect(o.filter(x => x.startsWith('dmg'))).toHaveLength(1); }
    else expect(o[0]).toBe('dmg E11 22');
    expect(o.some(x => /-> skull x9$/.test(x) || /^create skull x9$/.test(x))).toBe(true);
  });
  // troop:7680 SummoningKingdom 3064 (Wyrmrun) = the 5 raw kingdom members.
  it('troop:7680 summons a Wyrmrun troop', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) seen.add(castSpell({ key: 'troop:7680', seed }).f.state.teams.Left.characters.slice(-1)[0].name);
    expect(seen.size).toBe(5);
    expect([...seen].sort()).toEqual(['DrakeEggs', 'TheGreatWyrm', 'TerraWyrm', 'NetherWyrm', 'HornedWyrm'].map(n => TROOPS.find(t => t.referenceName === n)!.name).sort());
  });
  // troop:6801 Randomize ABC+(D-E-F): 9 Skulls +1 per Green ally/enemy (caster is Green), then one of 3 Gnolls.
  it('troop:6801 skull count and gnoll pool', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = castSpell({ key: 'troop:6801', seed, allies: [{ colors: ['Green'] as never }, { colors: ['Red'] as never }] }).summary;
      expect(s.gems.created.skull).toBe(12);
      seen.add(s.units.A14 ?? s.units.A13 ?? '');
    }
    expect([...seen].map(x => x.split(' ')[1]).sort()).toEqual(['SavageHunter', 'Gnoll', 'BaneJaw'].map(n => TROOPS.find(t => t.referenceName === n)!.name).sort());
  });
  // troop:7014 explode 10 only if a Dragon Spirit was ALREADY on the team (counted before the summons); 1 + 2 x 50% summons.
  it('troop:7014 explode depends on a pre-existing Dragon Spirit; summon count 25/50/25', () => {
    const spirit = TROOPS.find(t => t.referenceName === 'DragonSpirit')!.name;
    const none = castSpell({ key: 'troop:7014' }).summary.order;
    expect(none.some(x => x.startsWith('explode'))).toBe(false);
    const pre = castSpell({ key: 'troop:7014', allies: [{ name: spirit }] }).summary.order;
    expect(pre[0]).toMatch(/^explode \d+$/);
    const t = tally(Array.from({ length: 400 }, (_, i) => String(castSpell({ key: 'troop:7014', seed: i + 1, allies: [] }).summary.summons.length)));
    expect(t['1']).toBeGreaterThan(65); expect(t['1']).toBeLessThan(140);
    expect(t['2']).toBeGreaterThan(160); expect(t['2']).toBeLessThan(240);
    expect(t['3']).toBeGreaterThan(65); expect(t['3']).toBeLessThan(140);
  });
  // troop:7064 / 7066 CountArmyType gnome (zh 地精): Gnome allies boost, Goblin allies do not.
  it.each([
    { key: 'troop:7064', t: ['Gnome'], skulls: 9 }, { key: 'troop:7064', t: ['Goblin'], skulls: 6 },
  ])('$key skulls with a $t ally -> $skulls (caster is a Gnome)', ({ key, t, skulls }) => {
    const s = castSpell({ key, allies: [{ troopTypes: t }, { troopTypes: ['Human'] }] }).summary;
    expect(s.gems.created.skull).toBe(skulls);
  });
  it.each([
    { t: ['Gnome'], dmg: 24 }, { t: ['Goblin'], dmg: 18 },
  ])('troop:7066 damage with a $t ally -> $dmg', ({ t, dmg }) => {
    expect(castSpell({ key: 'troop:7066', allies: [{ troopTypes: t }, { troopTypes: ['Human'] }] }).summary.order[0]).toBe(`dmg E11 ${dmg}`);
  });
  // troop:7719 chosen + RandomEnemy + RandomPrefNotPrevEnemy; two independent random Mech summons.
  it('troop:7719 lone enemy hit three times; two summons can differ', () => {
    const lone = castSpell({ key: 'troop:7719', target: 10, enemies: [{ hp: 900, maxHp: 900, armor: 0 }] }).summary.order.filter(x => x.startsWith('dmg'));
    expect(lone).toHaveLength(3);
    let differ = false;
    for (let seed = 1; seed <= 20 && !differ; seed++) {
      const r = castSpell({ key: 'troop:7719', seed, allies: [{}] });
      const names = Object.values(r.summary.units).filter(v => v.startsWith('new ')).map(v => v.split(' ')[1]);
      expect(names).toHaveLength(2);
      differ = names[0] !== names[1];
    }
    expect(differ).toBe(true);
  });
  // troop:6425 Randomize AB+(C-D-E-F): Silver Drakon 75%, Krystenax 25%.
  it('troop:6425 Silver Drakon 3:1 Krystenax', () => {
    const t = tally(Array.from({ length: 400 }, (_, i) => castSpell({ key: 'troop:6425', seed: i + 1 }).summary.units.A14?.split(' ')[1] ?? 'none'));
    const silver = TROOPS.find(x => x.referenceName === 'SilverDrakon')!.name;
    expect(t[silver]).toBeGreaterThan(260); expect(t[silver]).toBeLessThan(340);
  });
  // troop:6594 3 x 20% daemon transforms: RandomEnemy then RandomPrefNotPrevEnemy x2.
  it('troop:6594 up to three different enemies transformed', () => {
    let three = false;
    for (let seed = 1; seed <= 400 && !three; seed++) {
      const o = castSpell({ key: 'troop:6594', seed }).summary.order.filter(x => x.startsWith('transform'));
      if (o.length === 3) { expect(new Set(o.map(x => x.split(' ')[1])).size).toBeGreaterThanOrEqual(2); three = true; }
    }
    expect(three).toBe(true);
  });
  // weapon:1310 independent 30% extra turn and 30% half mana (8 of 16); no Brown-gem boost (English + native).
  it('weapon:1310 independent 30% chances, half mana = 8', () => {
    let extra = 0, half = 0, both = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = castSpell({ key: 'weapon:1310', seed }).summary;
      const e = s.extraTurn !== null; const m = s.order.includes('buff C mana+8');
      if (!m) expect(s.order.some(x => x.startsWith('buff C mana'))).toBe(false);
      extra += +e; half += +m; both += +(e && m);
    }
    expect(extra).toBeGreaterThan(85); expect(extra).toBeLessThan(155);
    expect(half).toBeGreaterThan(85); expect(half).toBeLessThan(155);
    expect(both).toBeGreaterThan(15); expect(both).toBeLessThan(60);
  });
});

// ---------------------------------------------------------------- B06
const devourRate = (key: string, n: number, opts: Parameters<typeof castSpell>[0] = {}) => {
  let dev = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = castSpell({ key, seed, ...opts }).summary;
    const i = s.order.findIndex(x => x.includes('devoured'));
    if (i >= 0) { dev++; expect(s.order.filter(x => x.startsWith('dmg')).length).toBe(1); }
  }
  return dev;
};
describe('L1 R2 B06 (sa-R5)', () => {
  it('weapon:1295 summon pool = every roster troop whose raw TroopType/TroopType2 is Beast', () => {
    const raw = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops as { ReferenceName: string; TroopType: string; TroopType2: string }[];
    const roster = new Set(TROOPS.map(t => t.referenceName));
    const want = raw.filter(t => [t.TroopType, t.TroopType2].map(x => String(x ?? '').toLowerCase()).includes('beast')).map(t => t.ReferenceName).filter(r => roster.has(r));
    const p = registry.prototypes.get('gw_BeastlyClaw') as { segments: { kind: string; params?: { source: { randomOf?: string[] } } }[] };
    expect([...p.segments.find(s => s.kind === 'summon')!.params!.source.randomOf!].sort()).toEqual([...new Set(want)].sort());
  });
  it.each([{ t: ['Beast'], dmg: 16 }, { t: ['Human'], dmg: 12 }])('weapon:1295 first two enemies take 12 + 4 per Beast ally ($t)', ({ t, dmg }) => {
    expect(castSpell({ key: 'weapon:1295', allies: [{ troopTypes: t }] }).summary.order.slice(0, 2)).toEqual([`dmg E10 ${dmg} (all)`, `dmg E11 ${dmg} (all)`]);
  });
  // troop:7063 / 7065 native CountArmyType gnome (caster is a Gnome and counts itself).
  it('troop:7063 / 7065 count Gnome allies, not Goblins', () => {
    for (const key of ['troop:7063', 'troop:7065']) {
      const segs = (registry.prototypes.get(entitySkill(key).skill) as { segments: { modifier?: { source: { race?: string } }; params?: { modifier?: { source: { race?: string } } } }[] }).segments;
      const races = segs.flatMap(s => [s.modifier?.source.race, s.params?.modifier?.source.race]).filter(Boolean);
      expect(new Set(races)).toEqual(new Set(['Gnome']));
    }
  });
  it.each([{ t: ['Gnome'], v: 19 }, { t: ['Goblin'], v: 15 }])('troop:7065 armor AND attack +[Magic+1] +4 per Gnome ($t ally)', ({ t, v }) => {
    expect(castSpell({ key: 'troop:7065', allies: [{ troopTypes: t }] }).summary.order.slice(0, 2)).toEqual([`buff C armor+${v}`, `buff C attack+${v}`]);
  });
  // troop:6135 TrueDamage 1 to ALL allies; Orc count [1:1] boosts both Red and Brown.
  it.each([{ orcs: 0, n: 8 }, { orcs: 2, n: 10 }])('troop:6135 with $orcs Orc allies: every ally loses 1, Red = Brown = $n', ({ orcs, n }) => {
    const allies = [0, 1].map(i => ({ troopTypes: [i < orcs ? 'Orc' : 'Human'] }));
    const s = castSpell({ key: 'troop:6135', allies }).summary;
    expect(s.order.slice(0, 3)).toEqual(['dmg C 1 (all)', 'dmg A1 1 (all)', 'dmg A2 1 (all)']);
    expect(s.gems.created.Red).toBe(n); expect(s.gems.created.Brown).toBe(n);
  });
  // troop:6201 Dispel + 10000 damage on the chosen ally: a Barrier cannot save it; scatter 12 + its Attack.
  it('troop:6201 chosen ally with Barrier is still sacrificed; scatter = 12 + its Attack', () => {
    const r = castSpell({ key: 'troop:6201', target: 2, allies: [{}, { attack: 20, statuses: [{ id: 'barrier', turns: 99 }] as never }] });
    expect(r.f.allies[1].defeated).toBe(true); expect(r.f.allies[0].defeated).toBe(false);
    const scatter = r.summary.order.filter(x => x.endsWith('(scatter)')).reduce((a, x) => a + Number(x.split(' ')[2]), 0);
    expect(scatter).toBe(32);
  });
  // Devour family: native Consume first, then Damage only if not devoured.
  it('troop:6161 25% devour of a random enemy, else Magic+2 to that enemy', () => {
    const n = devourRate('troop:6161', 400); expect(n).toBeGreaterThan(70); expect(n).toBeLessThan(130);
  });
  it('troop:6650 devour chance = my Attack (%)', () => {
    const n = devourRate('troop:6650', 400, { caster: { attack: 50 } }); expect(n).toBeGreaterThan(165); expect(n).toBeLessThan(235);
  });
  it.each([{ key: 'troop:7059', mana: 20, lo: 25, hi: 75 }, { key: 'troop:7059', mana: 3, lo: 8, hi: 45 }, { key: 'troop:7424', mana: 20, lo: 90, hi: 150 }])(
    '$key devour chance per drained Mana (enemy mana $mana), real devour', ({ key, mana, lo, hi }) => {
      const n = devourRate(key, 400, { enemies: [{}, { hp: 900, maxHp: 900, armor: 10, mana }] });
      expect(n).toBeGreaterThan(lo); expect(n).toBeLessThan(hi);
    });
});

// ---------------------------------------------------------------- B07
describe('L1 R2 B07 (sa-R5)', () => {
  const firstIs = (key: string, kinds: string[]) => {
    const segs = (registry.prototypes.get(entitySkill(key).skill) as { segments: { kind: string; execute?: boolean }[] }).segments;
    expect(segs.map(s => s.kind).slice(0, kinds.length)).toEqual(kinds);
    expect(segs.some(s => s.execute)).toBe(false);
  };
  // Native ConsumeConditional first (R001) and it is a real Devour (caster gains stats), not an execute.
  it.each([
    { key: 'troop:7081', kinds: ['devour', 'damage'] }, { key: 'troop:7767', kinds: ['devour', 'damage'] },
    { key: 'troop:7049', kinds: ['devour', 'reduce'] }, { key: 'troop:7054', kinds: ['devour', 'status'] },
  ])('$key devour precedes $kinds.1', ({ key, kinds }) => firstIs(key, kinds));
  it('troop:7081 10% + 4% per Blue gem; troop:7049 4% per Skull; devoured target takes no further effect', () => {
    const a = devourRate('troop:7081', 400); expect(a).toBeGreaterThan(180); expect(a).toBeLessThan(250);
    let b = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = castSpell({ key: 'troop:7049', seed }).summary;
      if (s.order[0].includes('devoured')) { b++; expect(s.order.some(x => x.startsWith('buff E11 mana'))).toBe(false); }
      else expect(s.order[0]).toBe('buff E11 mana-8');
    }
    expect(b).toBeGreaterThan(55); expect(b).toBeLessThan(110);
  });
  it.each([{ c: 'Red', lo: 200, hi: 280 }, { c: 'Blue', lo: -1, hi: 1 }])('troop:7767 60% devour only if the target uses $c', ({ c, lo, hi }) => {
    const n = devourRate('troop:7767', 400, { enemies: [{}, { hp: 900, maxHp: 900, colors: [c as never] }] });
    expect(n).toBeGreaterThan(lo); expect(n).toBeLessThan(hi);
  });
  it('troop:7054 5% per Lycanthropy Gem (none on the board -> never), Blue target bled three times', () => {
    expect(devourRate('troop:7054', 100)).toBe(0);
    expect(castSpell({ key: 'troop:7054' }).summary.order).toEqual(['status E11 +bleed', 'status E11 +bleed', 'status E11 +bleed']);
  });
  it('troop:6294 Werewolf transforms into a Villager (native Transform 6295)', () => {
    const r = castSpell({ key: 'troop:6294' });
    expect(r.f.caster.name).toBe(TROOPS.find(t => t.referenceName === 'Villager')!.name);
  });
  // troop:6606 native heal -> summon 6607 Leech -> heal again (Leech included) -> summon 6608 Ocularen.
  it('troop:6606 two heals and Leech-then-Ocularen summons', () => {
    const leech = TROOPS.find(t => t.referenceName === 'OcularenLeech')!.name, ocu = TROOPS.find(t => t.referenceName === 'Ocularen')!.name;
    const one = castSpell({ key: 'troop:6606' }).summary;
    expect(one.units.A1).toBe('hp+32 max+32');
    expect(one.units.A14).toContain(leech); expect(one.order.filter(x => x.startsWith('buff A14'))).toHaveLength(1);
    const two = castSpell({ key: 'troop:6606', allies: [{ hp: 100, maxHp: 700 }] }).summary;
    expect(two.units.A14).toContain(leech); expect(two.units.A15).toContain(ocu);
  });
  // troop:7032 extra turn 7% per Purple gem counted before the Lycanthropy Gems are created.
  it('troop:7032 extra-turn roll precedes gem creation; ~7% per Purple gem', () => {
    const segs = (registry.prototypes.get('8553') as { segments: { kind: string }[] }).segments.map(s => s.kind);
    expect(segs.indexOf('extraTurn')).toBeLessThan(segs.indexOf('gem'));
    let et = 0;
    for (let seed = 1; seed <= 400; seed++) { const s = castSpell({ key: 'troop:7032', seed }).summary; if (s.extraTurn) et++; expect(s.gems.created.lycanthropyGem).toBe(2); }
    expect(et).toBeGreaterThan(210); expect(et).toBeLessThan(290);
  });
});

// ---------------------------------------------------------------- B08
describe('L1 R2 B08 (sa-R5)', () => {
  const name = (ref: string) => TROOPS.find(t => t.referenceName === ref)!.name;
  it('troop:7456 5 Skulls + 1 per Terror Gem (once), summon pool = raw kingdom 3091 Nightmare Circus', () => {
    const terror = { kind: 'special', spec: { kind: 'terrorGem' } } as never;
    const s = castSpell({ key: 'troop:7456', board: withCells(reviewBoard, { '7,7': terror, '7,6': terror, '7,5': terror }) }).summary;
    expect(s.gems.created.skull).toBe(8);
    const raw = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops as { ReferenceName: string; KingdomId: number }[];
    const p = registry.prototypes.get('9166') as { segments: { kind: string; params?: { source: { randomOf?: string[] } } }[] };
    expect([...p.segments.find(x => x.kind === 'summon')!.params!.source.randomOf!].sort()).toEqual(raw.filter(t => t.KingdomId === 3091).map(t => t.ReferenceName).sort());
  });
  it('troop:6827 [Magic + 3] + Red [3:1] (native Amount 3)', () => {
    expect(castSpell({ key: 'troop:6827' }).summary.order[0]).toBe('dmg E11 16');
  });
  it('troop:6994 native sequential summons: Djinn, then Al-Mundhir, Ifrit, Dao as slots allow', () => {
    expect(Object.values(castSpell({ key: 'troop:6994' }).summary.units).filter(v => v.startsWith('new ')).map(v => v.split(' ')[1])).toEqual([name('Djinn')]);
    expect(Object.values(castSpell({ key: 'troop:6994', allies: [{}] }).summary.units).filter(v => v.startsWith('new ')).map(v => v.split(' ')[1])).toEqual([name('Djinn'), name('Al-Mundhir')]);
  });
  it('troop:7222 devour 10% + 1% per Yellow destroyed (9 -> 19%), real devour', () => {
    const n = devourRate('troop:7222', 400); expect(n).toBeGreaterThan(50); expect(n).toBeLessThan(105);
  });
  it('troop:7155 two independent 30% devours of different random enemies', () => {
    let any = 0, two = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const o = castSpell({ key: 'troop:7155', seed }).summary.order.filter(x => x.includes('devoured'));
      if (o.length) any++; if (o.length === 2) { two++; expect(o[0].split(' ')[1]).not.toBe(o[1].split(' ')[1]); }
    }
    expect(any).toBeGreaterThan(170); expect(any).toBeLessThan(240); expect(two).toBeGreaterThan(18); expect(two).toBeLessThan(60);
  });
  it('troop:7609 devour (30% + 6% per Skull destroyed) precedes the damage to the last enemy', () => {
    const segs = (registry.prototypes.get('9492') as { segments: { kind: string }[] }).segments.map(x => x.kind);
    expect(segs.indexOf('devour')).toBeLessThan(segs.indexOf('damage'));
    // Damage@LastEnemy re-resolves after the devour (same literal-native reading as troop:7050): new last enemy is hit.
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const o = castSpell({ key: 'troop:7609', seed }).summary.order.filter(x => x.startsWith('dmg'));
      if (o[0].includes('devoured')) { n++; expect(o[0]).toMatch(/^dmg E13 /); expect(o[1]).toBe('dmg E12 13'); } else expect(o).toEqual(['dmg E13 13']);
    }
    expect(n).toBeGreaterThan(135); expect(n).toBeLessThan(200);
  });
  it('troop:7569 devour after the damage, 10% + 2% per gem of the enemy most-used colour', () => {
    const segs = (registry.prototypes.get('9364') as { segments: { kind: string }[] }).segments.map(x => x.kind);
    expect(segs).toEqual(['damage', 'devour']);
    let dev = 0;
    for (let seed = 1; seed <= 400; seed++) { const o = castSpell({ key: 'troop:7569', seed }).summary.order; expect(o[0]).toMatch(/^dmg E11 13/); if (o.some(x => x.includes('devoured'))) dev++; }
    expect(dev).toBeGreaterThan(40); expect(dev).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------- B09
describe('L1 R2 B09 (sa-R5)', () => {
  const raw = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops as { ReferenceName: string; KingdomId: number; TroopType: string; TroopType2: string }[];
  const pools = (skill: string) => (registry.prototypes.get(skill) as { segments: { kind: string; chance?: number; params?: { source: { randomOf?: string[] } } }[] }).segments
    .filter(s => s.kind === 'summon').map(s => ({ chance: s.chance ?? 1, pool: [...(s.params?.source.randomOf ?? [])].sort() }));
  const dist = (key: string, n: number, o: Parameters<typeof castSpell>[0]) => {
    const t: Record<number, number> = {};
    for (let seed = 1; seed <= n; seed++) { const k = castSpell({ key, seed, ...o }).summary.summons.length; t[k] = (t[k] ?? 0) + 1; }
    return t;
  };
  it('troop:6930 Bot + 2 x 50% Bots from raw kingdom 3045 (1/2/3 = 25/50/25%)', () => {
    const k = raw.filter(t => t.KingdomId === 3045).map(t => t.ReferenceName).sort();
    expect(pools('8408')).toEqual([{ chance: 1, pool: k }, { chance: 0.5, pool: k }, { chance: 0.5, pool: k }]);
    const t = dist('troop:6930', 400, { allies: [] });
    expect(t[1]).toBeGreaterThan(70); expect(t[1]).toBeLessThan(130); expect(t[2]).toBeGreaterThan(165); expect(t[2]).toBeLessThan(235);
  });
  it('troop:6513 chosen ally (even with Barrier) sacrificed; [(M/2)+1] + its Life [3:1]; Zhul\'Kari summon', () => {
    const r = castSpell({ key: 'troop:6513', target: 2, allies: [{}, { hp: 300, maxHp: 300, statuses: [{ id: 'barrier', turns: 99 }] as never }] });
    expect(r.f.allies[1].defeated).toBe(true); expect(r.f.allies[0].defeated).toBe(false);
    expect(r.summary.order.filter(x => x.startsWith('dmg E'))).toEqual(['dmg E10 108 (all)', 'dmg E11 108 (all)', 'dmg E12 108 (all)', 'dmg E13 108 (all)']);
    expect(pools('7704')).toEqual([{ chance: 1, pool: raw.filter(t => t.KingdomId === 3029).map(t => t.ReferenceName).sort() }]);
  });
  it('troop:6428 steals half the target Magic (floor) and, on a kill, summons Undead 100% / 50% / 25%', () => {
    const s = castSpell({ key: 'troop:6428', enemies: [{}, { hp: 900, maxHp: 900, armor: 0, magic: 11 }] }).summary;
    expect(s.order).toEqual(['dmg E11 22', 'buff C hp+22 max+22', 'buff E11 magic-5', 'buff C magic+5']);
    const undead = new Set(raw.filter(t => [t.TroopType, t.TroopType2].includes('Undead')).map(t => t.ReferenceName));
    const p = pools('7602'); expect(p.map(x => x.chance)).toEqual([1, 0.5, 0.25]);
    for (const x of p) expect(x.pool.every(r => undead.has(r))).toBe(true);
    const t = dist('troop:6428', 400, { allies: [], enemies: [{}, { hp: 5, maxHp: 5, armor: 0 }, {}, {}] });
    expect(t[1]).toBeGreaterThan(120); expect(t[2]).toBeGreaterThan(165); expect(t[3]).toBeGreaterThan(25); expect(t[3]).toBeLessThan(80);
    expect(castSpell({ key: 'troop:6428' }).summary.summons).toEqual([]);
  });
  it('troop:7157 devour branch is a real Devour (1 of 5)', () => {
    const n = devourRate('troop:7157', 400); expect(n).toBeGreaterThan(55); expect(n).toBeLessThan(110);
  });
});
