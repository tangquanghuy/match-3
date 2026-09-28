// sa-R5 lane L1 review round 2: native Charm skills (R008: Charm = temporary negative status) and summon
// distributions the four standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
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
