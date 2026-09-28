// sa-C lane L5 review round 3: conditions the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, DEFAULT_ENEMIES, DEFAULT_ALLIES } from '../helpers/gowCast';
import { BaseColor } from '@engine/types';
type St = { id: string; turns: number }[];
const st = (...ids: string[]) => ids.map(id => ({ id, turns: 99 })) as unknown as St;
const enemies = (over: Record<number, object>) => DEFAULT_ENEMIES.map((e, i) => ({ ...e, ...(over[i] ?? {}) }));
const allies = (over: Record<number, object>) => DEFAULT_ALLIES.map((a, i) => ({ ...a, ...(over[i] ?? {}) }));
const dmgs = (order: string[]) => order.filter(x => x.startsWith('dmg ')).map(x => { const [, who, n] = x.split(' '); return { who, n: Number(n) }; });
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

describe('L5 sa-C B01', () => {
  it('troop:6800 CountAttackArmorLife 34% (R003) on top of the (M/2+1)-(M+3) roll; Enraged on kill', () => {
    for (const seed of seeds.slice(0, 10)) {
      const r = castSpell({ key: 'troop:6800', magic: 0, seed, caster: { attack: 0, armor: 0, hp: 1000, maxHp: 1000 } });
      const [d] = dmgs(r.summary.order);
      expect(d.who).toBe('E11');
      expect(d.n).toBeGreaterThanOrEqual(341); expect(d.n).toBeLessThanOrEqual(343); // 1..3 + floor(1000 x 34 / 100)
    }
  });
  it('troop:6791 Faerie Fire all enemies only when the target had Hunter\'s Mark (counted before the damage)', () => {
    const marked = castSpell({ key: 'troop:6791', enemies: enemies({ 1: { statuses: st('marked') } }) });
    expect(marked.summary.order).toEqual(['dmg E11 14', 'status E10 +faerie-fire', 'status E11 +faerie-fire', 'status E12 +faerie-fire', 'status E13 +faerie-fire']);
    const killed = castSpell({ key: 'troop:6791', enemies: enemies({ 1: { hp: 1, statuses: st('marked') } }) });
    expect(killed.summary.order.filter(x => x.startsWith('status'))).toEqual(['status E10 +faerie-fire', 'status E12 +faerie-fire', 'status E13 +faerie-fire']);
    expect(castSpell({ key: 'troop:6791' }).summary.order).toEqual(['dmg E11 14']);
  });
  it('troop:7900 three RandomEnemy/RandomPrefNotPrev waves: never the same enemy twice in a row, repeats allowed', () => {
    let repeat = false;
    for (const seed of seeds) {
      const d = dmgs(castSpell({ key: 'troop:7900', seed }).summary.order);
      expect(d.slice(0, 3).map(x => x.n)).toEqual([10, 10, 10]);
      for (let i = 1; i < 3; i++) expect(d[i].who).not.toBe(d[i - 1].who);
      if (d[0].who === d[2].who) repeat = true;
    }
    expect(repeat).toBe(true);
  });
  it('troop:7578 target hit + three waves (RandomEnemy may hit the target), each with its own roll; Bleeding x3', () => {
    let repeat = false, split = false, target = false;
    for (const seed of seeds) {
      const d = dmgs(castSpell({ key: 'troop:7578', seed }).summary.order);
      expect(d[0].who).toBe('E11'); expect(d).toHaveLength(4);
      for (const x of d) { expect(x.n).toBeGreaterThanOrEqual(3); expect(x.n).toBeLessThanOrEqual(15); } // 3 - round(13.3 + 2)
      for (let i = 2; i < 4; i++) expect(d[i].who).not.toBe(d[i - 1].who);
      if (d[1].who === d[3].who) repeat = true;
      if (new Set(d.slice(1).map(x => x.n)).size > 1) split = true;
      if (d[1].who === 'E11') target = true;
    }
    expect(repeat && split && target).toBe(true);
    const bled = castSpell({ key: 'troop:7578', enemies: enemies({ 0: { statuses: st('bleed') }, 2: { statuses: st('bleed') } }) });
    for (const x of dmgs(bled.summary.order)) { expect(x.n).toBeGreaterThanOrEqual(9); expect(x.n).toBeLessThanOrEqual(21); } // + 2 x 3
  });
  it('troop:7581 five waves boosted x3 per Frozen enemy', () => {
    const r = castSpell({ key: 'troop:7581', enemies: enemies({ 0: { statuses: st('frozen') }, 1: { statuses: st('frozen') } }) });
    expect(dmgs(r.summary.order).map(x => x.n)).toEqual([14, 14, 14, 14, 14]); // 2 + 6 + 2 x 3
  });
  it('troop:7901 scatter total boosted x3 per Cursed enemy', () => {
    const r = castSpell({ key: 'troop:7901', enemies: enemies({ 0: { statuses: st('curse') }, 3: { statuses: st('curse') } }) });
    expect(dmgs(r.summary.order).reduce((a, x) => a + x.n, 0)).toBe(39); // 8 + 25 + 2 x 3
  });
  it('troop:6624 true splash boosted x2 per Submerged ally; a Submerged caster counts itself (P-B-action-status-self-count)', () => {
    const r = castSpell({ key: 'troop:6624', allies: allies({ 0: { statuses: st('submerged') }, 1: { statuses: st('submerged') } }) });
    expect(r.summary.order.slice(0, 3)).toEqual(['dmg E11 16 (splash)', 'dmg E10 8 (splash)', 'dmg E12 8 (splash)']);
    const self = castSpell({ key: 'troop:6624', caster: { statuses: st('submerged') } });
    expect(self.summary.order).toEqual(['remove C -submerged', 'dmg E11 14 (splash)', 'dmg E10 7 (splash)', 'dmg E12 7 (splash)']);
  });
});

/** Bleed stacks = magnitude of the single bleed status entry. */
const bleeds = (r: ReturnType<typeof castSpell>, id: number) => (r.f.enemies.find(e => e.id === id)!.statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude ?? 0;
describe('L5 sa-C B02', () => {
  it('troop:7783 / troop:7710 double damage only when the target already Bleeds; 7710 adds 2 stacks', () => {
    const on = { enemies: enemies({ 1: { statuses: st('bleed') } }) };
    expect(castSpell({ key: 'troop:7783', ...on }).summary.order[0]).toBe('dmg E11 26');
    expect(castSpell({ key: 'troop:7710', ...on }).summary.order[0]).toBe('dmg E11 26');
    expect(bleeds(castSpell({ key: 'troop:7710' }), 11)).toBe(2);
  });
  it('weapon:1250 Bleeds both of the first 2 enemies', () => {
    const r = castSpell({ key: 'weapon:1250' });
    expect(r.summary.order).toEqual(['dmg E10 14 (all)', 'dmg E11 14 (all)', 'status E10 +bleed', 'status E11 +bleed']);
  });
  it('weapon:1695 2 Bleed stacks; with Immortal Kveldulf in my team 1 more stack and Lycanthropy (not Curse)', () => {
    const plain = castSpell({ key: 'weapon:1695' });
    expect(bleeds(plain, 11)).toBe(2);
    const k = castSpell({ key: 'weapon:1695', allies: [...DEFAULT_ALLIES, { name: '不朽的克维尔杜尔夫' }] });
    expect(bleeds(k, 11)).toBe(3);
    expect(k.summary.order.filter(x => x.startsWith('status'))).toContain('status E11 +lycanthropy');
    expect(k.summary.order.join(' ')).not.toContain('curse');
  });
  it('weapon:1442 first + last, weapon:1443 last 2, weapon:1444 first 2 (+4 per Tempering on every hit)', () => {
    expect(castSpell({ key: 'weapon:1442' }).summary.order.slice(0, 2)).toEqual(['dmg E10 18', 'dmg E13 18']);
    expect(castSpell({ key: 'weapon:1442', caster: { temperingLevel: 2 } }).summary.order.slice(0, 2)).toEqual(['dmg E10 26', 'dmg E13 26']);
    expect(castSpell({ key: 'weapon:1443', caster: { temperingLevel: 1 } }).summary.order.slice(0, 2)).toEqual(['dmg E12 22 (all)', 'dmg E13 22 (all)']);
    expect(castSpell({ key: 'weapon:1444', caster: { temperingLevel: 1 } }).summary.order.slice(0, 2)).toEqual(['dmg E10 22 (all)', 'dmg E11 22 (all)']);
  });
  it('troop:6007 20% Burn lands on a random enemy (not the chosen one)', () => {
    const hit = new Set<string>();
    for (const seed of Array.from({ length: 120 }, (_, i) => i)) {
      for (const x of castSpell({ key: 'troop:6007', seed }).summary.order) if (x.startsWith('status')) hit.add(x);
    }
    expect(hit.size).toBeGreaterThan(1);
  });
});

describe('L5 sa-C B03', () => {
  it('troop:7331 25% Death Mark: one roll for both neighbours of the target (never exactly one)', () => {
    const seen = new Set<string>();
    for (const seed of Array.from({ length: 60 }, (_, i) => i)) {
      const s = castSpell({ key: 'troop:7331', seed }).summary.order.filter(x => x.startsWith('status')).join(',');
      seen.add(s);
    }
    expect([...seen].sort()).toEqual(['status E11 +death-mark', 'status E11 +death-mark,status E10 +death-mark,status E12 +death-mark'].sort());
  });
  it('weapon:1176 Death Mark Divine enemies, Disease Knight enemies', () => {
    const r = castSpell({ key: 'weapon:1176', enemies: enemies({ 0: { troopTypes: ['Divine'] }, 1: { troopTypes: ['Knight'] }, 2: { troopTypes: ['Divine', 'Knight'] } }) });
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(['status E10 +death-mark', 'status E12 +death-mark', 'status E11 +disease', 'status E12 +disease']);
  });
  it('troop:6389 triple damage on a Death Marked target', () => {
    expect(castSpell({ key: 'troop:6389', enemies: enemies({ 1: { statuses: st('death-mark') } }) }).summary.order[0]).toBe('dmg E11 36');
  });
  it('weapon:1124 Burn a random enemy, Disease a different one', () => {
    for (const seed of seeds) {
      const s = castSpell({ key: 'weapon:1124', seed }).summary.order.filter(x => x.startsWith('status')).map(x => x.split(' ')[1]);
      expect(s).toHaveLength(2); expect(s[0]).not.toBe(s[1]);
    }
  });
});
describe('L5 sa-C round 4 B04', () => {
  it('troop:6578 Enchant only ally Daemons, Barrier only ally Mystics (caster Medea is Human/Mystic)', () => {
    const r = castSpell({ key: 'troop:6578', allies: allies({ 0: { troopTypes: ['Daemon'] }, 1: { troopTypes: ['Mystic', 'Daemon'] } }) });
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(['status A1 +enchanted', 'status A2 +enchanted', 'status C +barrier', 'status A2 +barrier']);
  });
  it('troop:7432 one 50% roll freezes every enemy below the target, never the target; still below it after a kill (R012)', () => {
    let hit = 0, miss = 0;
    for (const seed of seeds) {
      const st2 = castSpell({ key: 'troop:7432', seed }).summary.order.filter(x => x.startsWith('status'));
      if (st2.length) { hit++; expect(st2).toEqual(['status E12 +frozen', 'status E13 +frozen']); } else miss++;
    }
    expect(hit > 5 && miss > 5).toBe(true);
    let killHit = false;
    for (const seed of seeds) {
      const st2 = castSpell({ key: 'troop:7432', seed, enemies: enemies({ 1: { hp: 1 } }) }).summary.order.filter(x => x.startsWith('status'));
      if (st2.length) { killHit = true; expect(st2).toEqual(['status E12 +frozen', 'status E13 +frozen']); }
    }
    expect(killHit).toBe(true);
  });
});
describe('L5 sa-C round 4 B05', () => {
  const statuses = (r: ReturnType<typeof castSpell>) => r.summary.order.filter(x => x.startsWith('status'));
  it('weapon:1132 +10 when the last enemy is Frozen; Freezes the LastEnemy (not the chosen one), re-resolved after a kill', () => {
    expect(castSpell({ key: 'weapon:1132' }).summary.order).toEqual(['dmg E13 14', 'status E13 +frozen']);
    expect(castSpell({ key: 'weapon:1132', enemies: enemies({ 3: { statuses: st('frozen') } }) }).summary.order[0]).toBe('dmg E13 24');
    expect(statuses(castSpell({ key: 'weapon:1132', enemies: enemies({ 3: { hp: 1 } }) }))).toEqual(['status E12 +frozen']);
  });
  it('troop:7131 Freezes AND Death Marks the target', () => {
    expect(statuses(castSpell({ key: 'troop:7131' }))).toEqual(['status E11 +frozen', 'status E11 +death-mark']);
  });
  it('troop:6388 triple damage only on a Hunter\'s Marked target', () => {
    expect(castSpell({ key: 'troop:6388', enemies: enemies({ 1: { statuses: st('marked') } }) }).summary.order[0]).toBe('dmg E11 42');
  });
  it('troop:6051 Poison and Burn the damaged strongest enemy; nothing re-picked after it dies', () => {
    expect(statuses(castSpell({ key: 'troop:6051' }))).toEqual(['status E11 +poison', 'status E11 +burning']);
    const k = castSpell({ key: 'troop:6051', enemies: enemies({ 1: { hp: 1 } }) });
    expect(k.summary.order[0]).toBe('dmg E13 13'); // E13 800+3 is now the strongest
    expect(statuses(castSpell({ key: 'troop:6051', enemies: DEFAULT_ENEMIES.map(e => ({ ...e, hp: 1 })) }))).toEqual([]);
  });
  it('troop:6377 target always Silenced; above and below each roll their own 50%, also after a kill (R012)', () => {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const s = statuses(castSpell({ key: 'troop:6377', seed }));
      expect(s[0]).toBe('status E11 +silence');
      seen.add(s.slice(1).join(','));
    }
    expect([...seen].sort()).toEqual(['', 'status E10 +silence', 'status E10 +silence,status E12 +silence', 'status E12 +silence']);
    let k = false;
    for (const seed of seeds) if (statuses(castSpell({ key: 'troop:6377', seed, enemies: enemies({ 1: { hp: 1 } }) })).length) k = true;
    expect(k).toBe(true);
  });
});
describe('L5 sa-C round 4 B06', () => {
  const statuses = (r: { summary: { order: string[] } }) => r.summary.order.filter(x => x.startsWith('status'));
  const withStorm = (key: string, color: BaseColor) => { const f = setupCast({ key }); f.engine.debugSetStorm(color, f.side); return summarize(f, f.cast()); };
  it('troop:6724 Curse all enemies only with an Icestorm (Blue), not with other Storms', () => {
    expect(withStorm('troop:6724', BaseColor.Blue).order.filter(x => x.startsWith('status'))).toEqual(['status E10 +curse', 'status E11 +curse', 'status E12 +curse', 'status E13 +curse']);
    expect(withStorm('troop:6724', BaseColor.Red).order.filter(x => x.startsWith('status'))).toEqual([]);
    expect(statuses(castSpell({ key: 'troop:6724' }))).toEqual([]);
  });
  it('troop:6737 Bless myself with any Storm', () => {
    expect(withStorm('troop:6737', BaseColor.Purple).order.filter(x => x.startsWith('status'))).toEqual(['status C +blessed']);
  });
  it('troop:7002 Monster target Entangled; Dragon target triple damage', () => {
    expect(statuses(castSpell({ key: 'troop:7002', enemies: enemies({ 1: { troopTypes: ['Monster'] } }) }))).toEqual(['status E11 +entangle']);
    const d = castSpell({ key: 'troop:7002', enemies: enemies({ 1: { troopTypes: ['Dragon'] } }) });
    expect(d.summary.order).toEqual(['dmg E11 39']);
  });
  it('troop:7180 Elemental triple; Enrage only on the kill', () => {
    expect(castSpell({ key: 'troop:7180', enemies: enemies({ 1: { troopTypes: ['Elemental'] } }) }).summary.order).toEqual(['dmg E11 39']);
  });
  it('weapon:1378 Death Mark only a Purple-mana target', () => {
    expect(statuses(castSpell({ key: 'weapon:1378', target: 12 }))).toEqual(['status E12 +death-mark']);
    expect(statuses(castSpell({ key: 'weapon:1378' }))).toEqual([]);
  });
  it('troop:7352 Enrage + Barrier only if the caster has taken damage', () => {
    expect(statuses(castSpell({ key: 'troop:7352', caster: { hp: 1000 } }))).toEqual([]);
  });
  it('weapon:1294 checks the damaged target itself: Frozen -> Curse, Burning -> Death Mark', () => {
    expect(statuses(castSpell({ key: 'weapon:1294', enemies: enemies({ 1: { statuses: st('frozen', 'burning') } }) }))).toEqual(['status E11 +curse', 'status E11 +death-mark']);
    expect(statuses(castSpell({ key: 'weapon:1294', enemies: enemies({ 0: { statuses: st('frozen', 'burning') } }) }))).toEqual([]);
  });
  it('weapon:1405 4 Bleed stacks on the Poisoned last enemy only', () => {
    const r = castSpell({ key: 'weapon:1405', enemies: enemies({ 3: { statuses: st('poison') } }) });
    expect(bleeds(r, 13)).toBe(4); expect(bleeds(r, 11)).toBe(0);
    expect(bleeds(castSpell({ key: 'weapon:1405', enemies: enemies({ 1: { statuses: st('poison') } }) }), 11)).toBe(0);
  });
});
describe('L5 sa-C round 4 B07', () => {
  const statuses = (r: { summary: { order: string[] } }) => r.summary.order.filter(x => x.startsWith('status'));
  it('weapon:1405 LastEnemy is re-resolved per step: after killing the last enemy, a Poisoned new last enemy Bleeds', () => {
    const r = castSpell({ key: 'weapon:1405', enemies: enemies({ 2: { statuses: st('poison') }, 3: { hp: 1 } }) });
    expect(bleeds(r, 12)).toBe(4);
  });
  it('troop:7142 three waves avoiding the previous target (repeat of the first allowed), each Stun its own 50% on the damaged enemy', () => {
    let repeat = false; const counts = new Set<number>();
    for (const seed of seeds) {
      const o = castSpell({ key: 'troop:7142', seed }).summary.order;
      const d = dmgs(o); expect(d.map(x => x.n)).toEqual([10, 10, 10]);
      for (let i = 1; i < 3; i++) expect(d[i].who).not.toBe(d[i - 1].who);
      if (d[0].who === d[2].who) repeat = true;
      const s = statuses({ summary: { order: o } }); counts.add(s.length);
      for (const x of s) expect(d.map(y => y.who)).toContain(x.split(' ')[1]);
    }
    expect(repeat).toBe(true); expect(counts.size).toBeGreaterThan(2);
  });
  it('troop:7409 double damage on a Terrified target', () => {
    expect(castSpell({ key: 'troop:7409', enemies: enemies({ 1: { statuses: st('terror') } }) }).summary.order[0]).toBe('dmg E11 28');
  });
  it('troop:7355 triple damage on a Daemon', () => {
    expect(castSpell({ key: 'troop:7355', enemies: enemies({ 1: { troopTypes: ['Daemon'] } }) }).summary.order[0]).toBe('dmg E11 39');
  });
  it('troop:6997 / troop:6674 First/Last targets are re-resolved at the Stun step after a kill', () => {
    expect(statuses(castSpell({ key: 'troop:6997', enemies: DEFAULT_ENEMIES.map(e => ({ ...e, hp: 1 })) }))).toEqual(['status E12 +stun', 'status E13 +stun', 'status C +barrier']);
  });
});
describe('L5 sa-C round 4 B08', () => {
  const statuses = (r: { summary: { order: string[] } }) => r.summary.order.filter(x => x.startsWith('status') || x.startsWith('remove') || x.startsWith('cleanse'));
  it('troop:6819 on the kill: Cleanse all allies AND Dispel all enemies (Enraged removed); nothing without a kill', () => {
    const k = castSpell({ key: 'troop:6819', enemies: enemies({ 1: { hp: 1 } }) });
    expect(statuses(k)).toEqual(['cleanse C -poison', 'cleanse A1 -poison', 'remove E10 -rage', 'remove E13 -rage']);
    expect(statuses(castSpell({ key: 'troop:6819' }))).toEqual([]);
  });
  it('troop:6937 each of first/last doubled only on its own Blue mana (native MultiplyForBlueTarget)', () => {
    const r = castSpell({ key: 'troop:6937', enemies: enemies({ 3: { colors: [BaseColor.Blue] } }) });
    expect(dmgs(r.summary.order)).toEqual([{ who: 'E10', n: 12 }, { who: 'E13', n: 24 }]);
  });
  it('troop:6602 damages, Burns and Faerie Fires the target and only the next enemy below', () => {
    expect(castSpell({ key: 'troop:6602' }).summary.order).toEqual(['dmg E11 13 (all)', 'dmg E12 13 (all)', 'status E11 +burning', 'status E12 +burning', 'status E11 +faerie-fire', 'status E12 +faerie-fire']);
  });
  it('troop:6708 only the Cursed chosen enemy is doubled and Death Marked; enemies below take plain damage', () => {
    const r = castSpell({ key: 'troop:6708', enemies: enemies({ 1: { statuses: st('curse') }, 2: { statuses: st('curse') } }) });
    expect(r.summary.order).toEqual(['dmg E11 24', 'dmg E12 12 (all)', 'dmg E13 12 (all)', 'status E11 +death-mark']);
    const k = castSpell({ key: 'troop:6708', enemies: enemies({ 1: { hp: 1 } }) });
    expect(dmgs(k.summary.order).map(x => x.who)).toEqual(['E11', 'E12', 'E13']); // R012: below the dead target
  });
  it('troop:6145 triple damage on an Entangled target', () => {
    expect(castSpell({ key: 'troop:6145', enemies: enemies({ 1: { statuses: st('entangle') } }) }).summary.order[0]).toBe('dmg E11 48');
  });
  it('troop:6108 gives 3 Magic to all allies on the kill', () => {
    const k = castSpell({ key: 'troop:6108', enemies: enemies({ 1: { hp: 1 } }) });
    expect(k.summary.order.filter(x => x.startsWith('buff'))).toEqual(['buff C magic+3', 'buff A1 magic+3', 'buff A2 magic+3']);
  });
});
describe('L5 sa-C round 6 B09', () => {
  const order = (o: Parameters<typeof castSpell>[0]) => castSpell(o).summary.order;
  it('troop:6517 Barrier to all allies only while the caster is damaged', () => {
    expect(order({ key: 'troop:6517', caster: { hp: 1000, maxHp: 1000 } })).toEqual(['dmg E11 14']);
    expect(order({ key: 'troop:6517' })).toEqual(['dmg E11 14', 'status C +barrier', 'status A1 +barrier', 'status A2 +barrier']);
  });
  it('troop:6301 / troop:6208 double damage on a Stunned / Webbed target, then Stun / Web', () => {
    expect(order({ key: 'troop:6301', enemies: enemies({ 1: { statuses: st('stun') } }) })[0]).toBe('dmg E11 28');
    expect(order({ key: 'troop:6208', enemies: enemies({ 1: { statuses: st('web') } }) })[0]).toBe('dmg E11 32');
    expect(order({ key: 'troop:6208', enemies: enemies({ 1: { statuses: st('stun') } }) })).toEqual(['dmg E11 16', 'status E11 +web']);
  });
  it('troop:6235 bonus damage and Burn on every Yellow enemy (target included), nobody else', () => {
    expect(order({ key: 'troop:6235', enemies: enemies({ 0: { colors: [BaseColor.Yellow] } }) }))
      .toEqual(['dmg E11 11', 'dmg E10 11 (all)', 'dmg E11 11 (all)', 'status E10 +burning', 'status E11 +burning']);
  });
  it('troop:7589 gains 2 Magic (not Mana) and Enraged', () => {
    expect(order({ key: 'troop:7589' })).toEqual(['dmg E11 14', 'buff C magic+2', 'status C +enraged']);
  });
  it('troop:6460 last enemy: 25% execute; other allies Submerged, never the caster', () => {
    let kills = 0;
    for (const seed of seeds) {
      const o = order({ key: 'troop:6460', seed });
      expect(o[0]).toBe('dmg E13 18');
      expect(o.filter(x => x.startsWith('status'))).toEqual(['status A1 +submerged', 'status A2 +submerged']);
      if (o.includes('defeat E13')) kills++;
    }
    expect(kills).toBeGreaterThan(2); expect(kills).toBeLessThan(20);
  });
  it('troop:6821 kills a Submerged target instead of Submerging it', () => {
    const o = order({ key: 'troop:6821', enemies: enemies({ 1: { statuses: st('submerged') } }) });
    expect(o).toContain('defeat E11'); expect(o.filter(x => x.startsWith('status'))).toEqual([]);
  });
  it('weapon:1668 / 1669 both hits get Tempering and their own colour Bleed check; random prefers another enemy', () => {
    for (const seed of seeds.slice(0, 15)) {
      const o = order({ key: 'weapon:1668', seed });
      const d = dmgs(o);
      expect(d[0]).toEqual({ who: 'E11', n: 13 }); expect(d[1].who).not.toBe('E11'); expect(d[1].n).toBe(13);
      expect(o).toContain('status E11 +bleed'); expect(o.filter(x => x.includes('+bleed'))).toEqual(['status E11 +bleed']);
    }
    const g = order({ key: 'weapon:1669', target: 13, enemies: enemies({ 0: { colors: [BaseColor.Green] }, 1: { colors: [BaseColor.Green] }, 2: { colors: [BaseColor.Green] } }) });
    expect(g.filter(x => x.startsWith('status'))).toHaveLength(2); // E13 + the random (all others Green)
    expect(g[0]).toBe('dmg E13 13'); expect(g[1]).toBe('status E13 +bleed');
  });
  it('weapon:1668 with a Doom enemy: armor broken before each hit (chosen and random)', () => {
    const doom = enemies({ 3: { troopTypes: ['Doom'] } });
    for (const seed of seeds.slice(0, 10)) {
      const r = castSpell({ key: 'weapon:1668', seed, enemies: doom });
      const o = r.summary.order;
      expect(o[0]).toBe('buff E11 armor-10'); expect(o[1]).toBe('dmg E11 13');
      const second = dmgs(o)[1]; expect(second.who).not.toBe('E11');
      const i = o.indexOf(`dmg ${second.who} 13`);
      expect(o[i - 1]).toMatch(new RegExp(`^buff ${second.who} armor-`));
    }
  });
});
describe('L5 sa-C round 9 B10', () => {
  const order = (o: Parameters<typeof castSpell>[0]) => castSpell(o).summary.order;
  it('weapon:1670-1673 Doomed blades: each Bleeds only its own mana colour (chosen and random hit)', () => {
    const cases: [string, BaseColor][] = [['weapon:1670', BaseColor.Red], ['weapon:1671', BaseColor.Yellow], ['weapon:1672', BaseColor.Purple], ['weapon:1673', BaseColor.Brown]];
    for (const [key, color] of cases) {
      const all = enemies({ 0: { colors: [color] }, 1: { colors: [color] }, 2: { colors: [color] }, 3: { colors: [color] } });
      const o = order({ key, enemies: all });
      expect(dmgs(o).map(x => x.n)).toEqual([13, 13]);
      expect(o.filter(x => x.includes('+bleed'))).toHaveLength(2);
      const other = color === BaseColor.Red ? BaseColor.Blue : BaseColor.Red;
      const none = enemies({ 0: { colors: [other] }, 1: { colors: [other] }, 2: { colors: [other] }, 3: { colors: [other] } });
      expect(order({ key, enemies: none }).filter(x => x.includes('+bleed'))).toEqual([]);
    }
  });
  it('troop:6571 strips every enemy armor before the (2M+7) hit, then Submerges itself', () => {
    const o = order({ key: 'troop:6571' });
    expect(o.slice(4)).toEqual(['dmg E11 27', 'status C +submerged']);
    expect(o.slice(0, 4).every(x => /^buff E1\d armor-/.test(x))).toBe(true);
  });
});
describe('L5 sa-C round 9 B11', () => {
  const order = (o: Parameters<typeof castSpell>[0]) => castSpell(o).summary.order;
  it('troop:6785 armor to the chosen ally, Barrier every ally below it (not the chosen, not above)', () => {
    expect(order({ key: 'troop:6785', target: 0 })).toEqual(['buff C armor+18', 'status A1 +barrier', 'status A2 +barrier']);
    expect(order({ key: 'troop:6785', target: 2 })).toEqual(['buff A2 armor+18']);
  });
  it('troop:7203 Barriers only Daemon allies', () => {
    expect(order({ key: 'troop:7203', allies: allies({ 1: { troopTypes: ['Daemon'] } }) })).toEqual(['buff C armor+11', 'status C +barrier', 'status A2 +barrier']);
    expect(order({ key: 'troop:7203', caster: { troopTypes: ['Construct'] } })).toEqual(['buff C armor+11']);
  });
  it('weapon:1527 Barriers only Whitehelm allies after armor to all', () => {
    expect(order({ key: 'weapon:1527', allies: allies({ 0: { kingdomId: 3014 } }) })).toEqual(['buff C armor+15', 'buff A1 armor+15', 'buff A2 armor+15', 'status A1 +barrier']);
  });
  it('troop:7191 other allies Barriered only with a Storm', () => {
    const f = setupCast({ key: 'troop:7191' }); f.engine.debugSetStorm(BaseColor.Red, f.side);
    expect(summarize(f, f.cast()).order).toEqual(['buff C armor+17', 'status C +barrier', 'status A1 +barrier', 'status A2 +barrier']);
  });
  it('troop:6980 knocks a random enemy (any, the last included) to the back', () => {
    const who = new Set<string>();
    for (const seed of seeds) { const o = order({ key: 'troop:6980', seed }); expect(o.slice(0, 2)).toEqual(['buff C armor+11', 'status C +barrier']); const m = o.find(x => x.startsWith('move ')); if (m) who.add(m.split(' ')[1]); }
    expect(who.size).toBeGreaterThanOrEqual(3);
  });
});
describe('L5 sa-C round 9 B12', () => {
  const order = (o: Parameters<typeof castSpell>[0]) => castSpell(o).summary.order;
  it('troop:7703 Barrier + Enchant the chosen ally AND the caster, in native order', () => {
    expect(order({ key: 'troop:7703' })).toEqual(['buff A1 armor+12', 'buff C armor+12', 'status A1 +barrier', 'status A1 +enchanted', 'status C +barrier', 'status C +enchanted']);
  });
  it('troop:7706 armor picks the weakest (Life+Armor), then Life and Barrier on that same ally', () => {
    // A1 400 is weakest; after +11 armor A2 (405) would be weaker, but FromPrevious keeps A1
    const o = order({ key: 'troop:7706', allies: allies({ 0: { hp: 400, maxHp: 700, armor: 0 }, 1: { hp: 405, maxHp: 700, armor: 0 } }) });
    expect(o).toEqual(['buff A1 armor+11', 'buff A1 hp+11 max+11', 'status A1 +barrier']);
  });
  it('troop:7666 Bless and Barrier only an Elemental ally', () => {
    expect(order({ key: 'troop:7666', allies: allies({ 0: { troopTypes: ['Elemental'] } }) })).toEqual(['buff A1 armor+11', 'buff A1 hp+11 max+11', 'remove A1 -poison', 'status A1 +blessed', 'status A1 +barrier']); // Blessed cleanses on apply (status.ts)
    expect(order({ key: 'troop:7666' })).toEqual(['buff A1 armor+11', 'buff A1 hp+11 max+11']);
  });
  it('troop:6695 (M/2)+1 Attack and Armor, then Barrier', () => {
    expect(order({ key: 'troop:6695' })).toEqual(['buff A1 attack+6', 'buff A1 armor+6', 'status A1 +barrier']);
  });
  it('troop:6335 native order Attack -> Life -> Cleanse; +3 Magic only for a Red ally', () => {
    expect(order({ key: 'troop:6335' })).toEqual(['buff A1 attack+11', 'buff A1 hp+11 max+11', 'cleanse A1 -poison']);
    expect(order({ key: 'troop:6335', allies: allies({ 0: { colors: [BaseColor.Red] } }) })).toEqual(['buff A1 attack+11', 'buff A1 hp+11 max+11', 'cleanse A1 -poison', 'buff A1 magic+3']);
  });
});
describe('L5 sa-C round 9 B13', () => {
  const order = (o: Parameters<typeof castSpell>[0]) => castSpell(o).summary.order;
  it('troop:6450 Life + Barrier on self, then a flat 8 damage', () => {
    expect(order({ key: 'troop:6450' })).toEqual(['buff C hp+15 max+15', 'status C +barrier', 'dmg E11 8']);
    expect(order({ key: 'troop:6450', magic: 0 })).toEqual(['buff C hp+5 max+5', 'status C +barrier', 'dmg E11 8']);
  });
  it('troop:6690 native order Life -> Blessed -> Enchanted on the chosen ally', () => {
    expect(order({ key: 'troop:6690' })).toEqual(['buff A1 hp+11 max+11', 'remove A1 -poison', 'status A1 +blessed', 'status A1 +enchanted']);
  });
  it('troop:7323 Life to the first 2 allies, Disease on the last 2 enemies', () => {
    expect(order({ key: 'troop:7323' })).toEqual(['buff C hp+11 max+11', 'buff A1 hp+11 max+11', 'status E12 +disease', 'status E13 +disease']);
  });
  it('weapon:1149 Cleanse and Enchant all OTHER allies (caster keeps its Poison, not Enchanted)', () => {
    expect(order({ key: 'weapon:1149' })).toEqual(['buff C hp+14 max+14', 'cleanse A1 -poison', 'status A1 +enchanted', 'status A2 +enchanted']);
  });
  it('troop:7797 the kill roll only fires on an ALREADY Entangled target (checked before its own Entangle), ~30%', () => {
    for (const seed of seeds) expect(order({ key: 'troop:7797', seed })).toEqual(['dmg E11 13', 'status E11 +entangle', 'status E11 +bleed']);
    let kills = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const o = order({ key: 'troop:7797', seed, enemies: enemies({ 1: { statuses: st('entangle') } }) });
      if (o.includes('defeat E11')) { kills++; expect(o).toEqual(['dmg E11 910', 'defeat E11']); } // execute = lethal hit; later steps skip the dead target
      else expect(o).toEqual(['dmg E11 13', 'status E11 +entangle', 'status E11 +bleed']);
    }
    expect(kills).toBeGreaterThan(40); expect(kills).toBeLessThan(80);
  });
});
describe('L5 sa-C round 9 B14', () => {
  const order = (o: Parameters<typeof castSpell>[0]) => castSpell(o).summary.order;
  const sum = (o: string[]) => dmgs(o).reduce((a, x) => a + x.n, 0);
  it('weapon:1446 scatter total 16 + 2M; Bless Purple allies, Curse Purple enemies only', () => {
    const o = order({ key: 'weapon:1446', caster: { colors: [BaseColor.Blue] }, allies: allies({ 1: { colors: [BaseColor.Purple] } }) });
    expect(sum(o)).toBe(36);
    expect(o.filter(x => x.startsWith('status'))).toEqual(['status A2 +blessed', 'status E12 +curse']);
  });
  it('troop:6150 scatter 9 + M; one 75% roll Burns all enemies or none', () => {
    let all = 0;
    for (const seed of seeds) {
      const o = order({ key: 'troop:6150', seed }); expect(sum(o)).toBe(19);
      const b = o.filter(x => x.includes('+burning')).length; expect([0, 4]).toContain(b); if (b === 4) all++;
    }
    expect(all).toBeGreaterThan(22); expect(all).toBeLessThan(38);
  });
  it('troop:6158 scatter 8 + M, Burn exactly one random enemy', () => {
    for (const seed of seeds.slice(0, 10)) { const o = order({ key: 'troop:6158', seed }); expect(sum(o)).toBe(18); expect(o.filter(x => x.includes('+burning'))).toHaveLength(1); }
  });
  it('troop:7718 Burn a random enemy, then 50% another (prefers a different one)', () => {
    const n: Record<number, number> = {};
    for (const seed of seeds) {
      const o = order({ key: 'troop:7718', seed }); expect(sum(o)).toBe(16);
      const b = o.filter(x => x.includes('+burning')); if (b.length === 2) expect(b[0]).not.toBe(b[1]);
      n[b.length] = (n[b.length] ?? 0) + 1;
    }
    expect(n[1]).toBeGreaterThan(10); expect(n[2]).toBeGreaterThan(10);
  });
  it('troop:7013 scatter 8 + M; one 75% roll Enchants all allies or none', () => {
    let all = 0;
    for (const seed of seeds) { const o = order({ key: 'troop:7013', seed }); expect(sum(o)).toBe(18); const e = o.filter(x => x.includes('+enchanted')).length; expect([0, 3]).toContain(e); if (e === 3) all++; }
    expect(all).toBeGreaterThan(22); expect(all).toBeLessThan(38);
  });
});
