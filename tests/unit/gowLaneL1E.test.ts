// Lane L1 round 4 (reviewer sa-E): identity / summon / transform / devour / flee skills.
// Cases the standard golden scenarios cannot show (thresholds, branch odds, summon pools vs raw data).
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { castSpell, registry, type BoardFn } from '../helpers/gowCast';
import { BaseColor, PlayerSide, colorGem, type Character } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { TROOPS, troopToSummonTemplate } from '../../src/data/troops';

type RawTroop = { id: number; ReferenceName: string; TroopType: string | null; TroopType2: string | null; KingdomId: number };
const RAW = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops as RawTroop[];
const ROSTER = new Set(TROOPS.map(t => t.referenceName));
const rawByType = (type: string) => RAW.filter(t => [t.TroopType, t.TroopType2].map(s => String(s ?? '').toLowerCase()).includes(type.toLowerCase())).map(t => t.ReferenceName);
const rawByKingdom = (k: number) => RAW.filter(t => t.KingdomId === k).map(t => t.ReferenceName);
const inRoster = (xs: string[]) => [...new Set(xs.filter(x => ROSTER.has(x)))].sort();
const refOf = (id: number) => RAW.find(t => t.id === id)!.ReferenceName;

type Seg = { kind: string; params?: { source: { randomOf?: string[]; ref?: string } }; randomOf?: string[]; ref?: string; options?: Seg[][] };
const segsOf = (skill: string) => (registry.prototypes.get(skill) as { segments: Seg[] }).segments;
const flat = (xs: Seg[]): Seg[] => xs.flatMap(s => [s, ...(s.options ? flat(s.options.flat()) : [])]);
const summonPool = (skill: string) => flat(segsOf(skill)).find(s => s.kind === 'summon')!.params!.source.randomOf!;
const transformPool = (skill: string) => flat(segsOf(skill)).find(s => s.kind === 'transformTroop')!.randomOf!;

const summons = (ev: GameEvent[]) => ev.filter(e => e.type === 'summon') as Extract<GameEvent, { type: 'summon' }>[];
const dmgTo = (ev: GameEvent[], id: number) => ev.filter(e => e.type === 'skill-damage' && e.targetId === id).map(e => (e as { damage: number }).damage);
const nameOfRef = (ref: string) => troopToSummonTemplate(ref)!.name;
/** Red on every third diagonal (22 Reds), Blue/Green elsewhere: no line of three, >= 13 Red. */
const rich = (x: BaseColor): BoardFn => (r, c) => colorGem([x, ...[BaseColor.Blue, BaseColor.Green, BaseColor.Yellow].filter(y => y !== x).slice(0, 2)][(r + c) % 3]);
const redRich = rich(BaseColor.Red);
const oneHp = (n = 4): Partial<Character>[] => Array.from({ length: n }, () => ({ hp: 1, maxHp: 1, armor: 0 }));
const SIDES = [PlayerSide.Left, PlayerSide.Right] as const;

// ---------------------------------------------------------------- B01
describe('L1-E B01 troop:6829 Werecat (8231): x3 and +8 Red at >= 13 Red; 25% transform into Torbern (6830)', () => {
  it('13+ Red: triple damage (3 x 14) and 8 Red created; below 13: 14 and no gems', () => {
    const rich = castSpell({ key: 'troop:6829', board: redRich });
    expect(dmgTo(rich.events, 11)).toEqual([42]);
    expect(rich.summary.gems.created).toMatchObject({ Red: 8 });
    const poor = castSpell({ key: 'troop:6829' });
    expect(dmgTo(poor.events, 11)).toEqual([14]);
    expect(poor.summary.gems.created.Red ?? 0).toBe(0);
  });
  it('transform target is raw 6830 BeastmasterTorbern, ~25% over 200 seeds', () => {
    expect(refOf(6830)).toBe('BeastmasterTorbern');
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = castSpell({ key: 'troop:6829', seed });
      const t = r.events.filter(e => e.type === 'troop-transform');
      if (t.length) { n++; expect((t[0] as { name: string }).name).toBe(nameOfRef('BeastmasterTorbern')); }
    }
    expect(n).toBeGreaterThan(30); expect(n).toBeLessThan(72);
  });
});

describe('L1-E B01 troop:6244 Kruarg (7387): summon a random Daemon at >= 13 Red', () => {
  it('pool = raw TroopType Daemon in roster', () => {
    expect([...summonPool('7387')].sort()).toEqual(inRoster(rawByType('Daemon')));
  });
  for (const side of SIDES) it(`side=${side}: 13+ Red summons exactly one Daemon; below 13 none`, () => {
    const rich = castSpell({ key: 'troop:6244', side, board: redRich });
    expect(summons(rich.events)).toHaveLength(1);
    const poor = castSpell({ key: 'troop:6244', side });
    expect(summons(poor.events)).toHaveLength(0);
  });
});

describe('L1-E B01 troop:6465 Hyena (7643): kill -> 3 independent Hyena summons', () => {
  it('free team slots: a kill summons 3 Hyenas; no kill summons none', () => {
    const r = castSpell({ key: 'troop:6465', allies: [], enemies: oneHp() });
    expect(summons(r.events).map(e => e.troopId)).toEqual([6465, 6465, 6465]);
    expect(summons(castSpell({ key: 'troop:6465', allies: [] }).events)).toHaveLength(0);
  });
  // Fails today: summon reuses the dead enemy's id, lastTarget resolves to the summon -> 2nd/3rd ifTargetDied skip.
  it.fails('killing the highest-id enemy still summons 3 (P-R5-summon-id-reuse)', () => {
    const r = castSpell({ key: 'troop:6465', allies: [], enemies: oneHp(), target: 13 });
    expect(summons(r.events)).toHaveLength(3);
  });
});

describe('L1-E B01 troop:6231 BabyDragon (7373): transform into a random Dragon', () => {
  it('pool = raw TroopType Dragon in roster', () => {
    expect([...transformPool('7373')].sort()).toEqual(inRoster(rawByType('Dragon')));
  });
});

describe('L1-E B01 weapon:1394 EmperinasTooth (8461): Randomize AB-CD = damage + (extra turn | kingdom-3051 summon)', () => {
  it('pool = raw KingdomId 3051 in roster (no KoboldEmissary, kingdom 3012)', () => {
    expect([...summonPool('gw_EmperinasTooth')].sort()).toEqual(inRoster(rawByKingdom(3051)));
  });
  it('200 seeds: always one Magic+4 hit on the last enemy, then exactly one branch, ~50/50', () => {
    let extra = 0, sum = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = castSpell({ key: 'weapon:1394', seed });
      expect(dmgTo(r.events, 13)).toEqual([14]);
      const e = r.summary.extraTurn ? 1 : 0, s = summons(r.events).length;
      expect(e + s).toBe(1); extra += e; sum += s;
    }
    expect(extra).toBeGreaterThan(70); expect(sum).toBeGreaterThan(70);
  });
});

// ---------------------------------------------------------------- B02
/** Distribution of summon counts over seeds 1..n. */
function countDist(o: Parameters<typeof castSpell>[0], n: number) {
  const d = [0, 0, 0, 0];
  for (let seed = 1; seed <= n; seed++) d[summons(castSpell({ ...o, seed }).events).length]++;
  return d;
}
describe('L1-E B02 troop:7295 CourtHerald (8896): Choose ABC-DEF', () => {
  it('option A summons raw 7297 ShadowFox', () => {
    expect(refOf(7297)).toBe('ShadowFox');
    expect(summons(castSpell({ key: 'troop:7295' }).events).map(e => e.troopId)).toEqual([7297]);
  });
});

describe('L1-E B02 weapon:1213 TomeOfSin (7816): 3 independent kingdom-3037 summons at 100/50/50% if >= 13 Purple', () => {
  it('each summon step draws from raw KingdomId 3037 (not the zh kingdom name, which adds 5 others)', () => {
    const pools = flat(segsOf('gw_TomeOfSin')).filter(s => s.kind === 'summon').map(s => [...s.params!.source.randomOf!].sort());
    expect(pools).toHaveLength(3);
    for (const p of pools) expect(p).toEqual(inRoster(rawByKingdom(3037)));
  });
  it('13+ Purple, free slots, 400 seeds: 1/2/3 summons ~25/50/25%; below 13 none', () => {
    const d = countDist({ key: 'weapon:1213', allies: [], board: rich(BaseColor.Purple) }, 400);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeGreaterThan(70); expect(d[1]).toBeLessThan(130);
    expect(d[2]).toBeGreaterThan(160); expect(d[2]).toBeLessThan(240);
    expect(d[3]).toBeGreaterThan(70); expect(d[3]).toBeLessThan(130);
    expect(summons(castSpell({ key: 'weapon:1213', allies: [] }).events)).toHaveLength(0);
  });
});

describe('L1-E B02 weapon:1238 Riftblade (7991): summon from raw KingdomId 3032', () => {
  it('pool = raw 3032 in roster (incl. ImpOfLove)', () => {
    expect([...summonPool('gw_Riftblade')].sort()).toEqual(inRoster(rawByKingdom(3032)));
  });
});

describe('L1-E B02 troop:6515 QueensHerald (7706): 50% summon raw 6259 QueenYsabelle', () => {
  it('~50% over 200 seeds, always Ysabelle', () => {
    expect(refOf(6259)).toBe('QueenYsabelle');
    const d = countDist({ key: 'troop:6515' }, 200);
    expect(d[1]).toBeGreaterThan(70); expect(d[1]).toBeLessThan(130); expect(d[2] + d[3]).toBe(0);
  });
});

describe('L1-E B02 troop:6509 Morterra (7699): summon a random Undead', () => {
  it('pool = raw TroopType Undead in roster', () => {
    expect([...summonPool('7699')].sort()).toEqual(inRoster(rawByType('Undead')));
  });
});

describe('L1-E B02 troop:7384 Werehound (9026): x3 vs Hunter\'s Mark', () => {
  it('marked target takes 3 x 13; unmarked 13', () => {
    const en = [{}, { hp: 900, maxHp: 900, armor: 10, statuses: [{ id: 'marked', turns: 99 }] }, {}, {}] as Partial<Character>[];
    expect(dmgTo(castSpell({ key: 'troop:7384', enemies: en }).events, 11)).toEqual([39]);
    expect(dmgTo(castSpell({ key: 'troop:7384' }).events, 11)).toEqual([13]);
  });
});

const transformed = (ev: GameEvent[]) => ev.filter(e => e.type === 'troop-transform') as { targetId: number; name: string }[];
describe('L1-E B02 troop:6910 Gael (8371): Daemon target -> 50% into raw 6206 Wraith (only)', () => {
  it('Daemon target: ~50% transform, always Wraith; non-Daemon never', () => {
    expect(refOf(6206)).toBe('Wraith');
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = transformed(castSpell({ key: 'troop:6910', seed, enemies: [{}, { troopTypes: ['Daemon'] }, {}, {}] }).events);
      if (t.length) { n++; expect(t).toHaveLength(1); expect(t[0]).toMatchObject({ targetId: 11, name: nameOfRef('Wraith') }); }
      expect(transformed(castSpell({ key: 'troop:6910', seed }).events)).toHaveLength(0);
    }
    expect(n).toBeGreaterThan(70); expect(n).toBeLessThan(130);
  });
});

describe('L1-E B02 troop:6757 Fungomancer (8137): the Diseased target -> 50% Mushroom Man, then Disease it', () => {
  const dis = [{ id: 'disease', turns: 99 }] as Character['statuses'];
  it('target Diseased: ~50% into raw 6756 MushroomMan; another enemy Diseased only: never', () => {
    expect(refOf(6756)).toBe('MushroomMan');
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = transformed(castSpell({ key: 'troop:6757', seed, enemies: [{}, { statuses: dis }, {}, {}] }).events);
      if (t.length) { n++; expect(t[0]).toMatchObject({ targetId: 11, name: nameOfRef('MushroomMan') }); }
      expect(transformed(castSpell({ key: 'troop:6757', seed, enemies: [{ statuses: dis }, {}, {}, {}] }).events)).toHaveLength(0);
    }
    expect(n).toBeGreaterThan(70); expect(n).toBeLessThan(130);
  });
});

describe('L1-E B02 troop:7111 Oneiros (8654): Nightmare x3 at 100/50/25%', () => {
  it('free slots, 400 seeds: 1/2/3 = 37.5/50/12.5%', () => {
    expect(refOf(6568)).toBe('Nightmare');
    const d = countDist({ key: 'troop:7111', allies: [] }, 400);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeGreaterThan(120); expect(d[1]).toBeLessThan(180);
    expect(d[2]).toBeGreaterThan(165); expect(d[2]).toBeLessThan(235);
    expect(d[3]).toBeGreaterThan(25); expect(d[3]).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------- B03
const fled = (ev: GameEvent[]) => ev.filter(e => e.type === 'flee') as { characterId: number }[];
describe('L1-E B03 RunAway@Self 30%: troop:7491 Valhawk (random column), troop:6596 Glory Gnome (chosen row)', () => {
  for (const key of ['troop:7491', 'troop:6596']) it(`${key}: caster flees ~30% over 300 seeds`, () => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const f = fled(castSpell({ key, seed }).events);
      if (f.length) { n++; expect(f).toEqual([expect.objectContaining({ characterId: 0 })]); }
    }
    expect(n).toBeGreaterThan(60); expect(n).toBeLessThan(120);
  });
  it('Glory Gnome (native Target Board, BoardTarget Row) destroys the chosen row: 8 gems in row 5', () => {
    const r = castSpell({ key: 'troop:6596', cell: { row: 5, col: 0 } });
    expect(r.summary.gems.destroyed).toBe(8);
    expect(registry.prototypes.get('7818')).toMatchObject({ segments: [{ params: { target: { kind: 'chosenLine', orientation: 'row' } } }, {}] });
  });
});

describe('L1-E B03 troop:6631 Angry Mob (7956): Randomize ABC-DEF', () => {
  it('always destroy + burn; then exactly one of (Angry Mob summon | Magic+1 = 11 to the first enemy), ~50/50', () => {
    let s = 0, d = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = castSpell({ key: 'troop:6631', seed, allies: [] });
      const sm = summons(r.events), hit = dmgTo(r.events, 10);
      expect(r.summary.order.filter(x => x.includes('+burning'))).toHaveLength(1);
      if (sm.length) { s++; expect(sm).toHaveLength(1); expect(r.summary.units[`A${sm[0].characterId}`]).toContain(`new ${nameOfRef('AngryMob')} `); expect(r.summary.order.some(x => x.startsWith('dmg '))).toBe(false); }
      else { d++; expect(hit.at(-1)).toBe(11); }
    }
    expect(s).toBeGreaterThan(70); expect(d).toBeGreaterThan(70);
  });
});

describe('L1-E B03 troop:6601 Gluttony (7810): native Target Enemy -> explode the chosen enemy colour, 20% devour it', () => {
  const devoured = (ev: GameEvent[]) => ev.filter(e => e.type === 'skill-damage' && (e as { devoured?: boolean }).devoured).map(e => (e as { targetId: number }).targetId);
  it('devour only ever hits the chosen target, ~20% over 300 seeds', () => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const v = devoured(castSpell({ key: 'troop:6601', seed, target: 12, enemies: oneHp() }).events);
      if (v.length) { n++; expect(v).toEqual([12]); }
    }
    expect(n).toBeGreaterThan(35); expect(n).toBeLessThan(90);
  });
  it('colour comes from the chosen enemy: Purple-only E12 on a board without Purple explodes nothing; Red E10 explodes', () => {
    expect(castSpell({ key: 'troop:6601', target: 12, board: redRich }).summary.gems.exploded).toBe(0);
    expect(castSpell({ key: 'troop:6601', target: 10, board: redRich }).summary.gems.exploded).toBeGreaterThan(0);
  });
});

describe('L1-E B03 SummoningKingdom <id>: pools = raw KingdomId roster (zh kingdom name also merges faction troops)', () => {
  const cases: [string, number][] = [['gw_JellyShot', 3058], ['gw_CobaltineWand', 3030], ['gw_FireGodsHeart', 3000], ['gw_King-Chopper', 3018], ['gw_OldMagusStaff', 3017], ['gw_EmeraldBlade', 3009]];
  for (const [skill, k] of cases) it(`${skill}: kingdom ${k}`, () => {
    expect([...summonPool(skill)].sort()).toEqual(inRoster(rawByKingdom(k)));
  });
});
