// sa-P review round 2: R012 (relative targets anchored on the chosen target use its cast-start formation slot).
// Native BelowTarget / AboveTarget / NextDownFromTarget (/ NextUpFromTarget) resolve against the position the chosen
// target held when the spell started, so killing it in an earlier step does not cancel "the enemies below / above it".
// Also closes P-R3-below-dead-target (weapon:1605, troop:7818).
import { describe, it, expect } from 'vitest';
import { hasStatus } from '@engine/skills/effects/status';
import { castSpell } from '../helpers/gowCast';

const oneHp = (mana = 10) => ({ hp: 1, maxHp: 1, armor: 0, mana });
const tough = (mana = 10) => ({ hp: 900, maxHp: 900, armor: 0, mana });

describe('R012: BelowTarget / AboveTarget after the anchor died', () => {
  it('weapon:1605 9385: chosen E11 killed -> E12 and E13 still Bled, E10 not', () => {
    const r = castSpell({ key: 'weapon:1605', target: 11, enemies: [tough(), oneHp(), tough(), tough()] });
    expect(r.f.enemies[1].defeated).toBe(true);
    expect(r.f.enemies.map((e) => hasStatus(e, 'bleed'))).toEqual([false, false, true, true]);
  });
  it('troop:7818 9862: chosen E11 killed -> all other enemies Cursed and Bled (above and below)', () => {
    const r = castSpell({ key: 'troop:7818', target: 11, enemies: [tough(), oneHp(), tough(), tough()] });
    expect(r.f.enemies[1].defeated).toBe(true);
    expect(r.summary.order.filter((s) => s.startsWith('status')).sort()).toEqual([
      'status E10 +bleed', 'status E10 +curse', 'status E12 +bleed', 'status E12 +curse', 'status E13 +bleed', 'status E13 +curse',
    ]);
  });
  it('troop:6926 8414: chosen E11 killed -> enemies below it still lose 7 mana; nobody above', () => {
    const r = castSpell({ key: 'troop:6926', target: 11, enemies: [tough(), oneHp(), tough(), tough()] });
    expect(r.f.enemies[1].defeated).toBe(true);
    expect([r.f.enemies[0].mana, r.f.enemies[2].mana, r.f.enemies[3].mana]).toEqual([10, 3, 3]);
  });
  it('anchor alive: unchanged (weapon:1605 bleeds only E12/E13)', () => {
    const r = castSpell({ key: 'weapon:1605', target: 11, enemies: [tough(), tough(), tough(), tough()] });
    expect(r.f.enemies.map((e) => hasStatus(e, 'bleed'))).toEqual([false, false, true, true]);
  });
  it('last enemy chosen and killed: nothing below', () => {
    const r = castSpell({ key: 'weapon:1605', target: 13, enemies: [tough(), tough(), tough(), oneHp()] });
    expect(r.f.enemies.map((e) => hasStatus(e, 'bleed'))).toEqual([false, false, false, false]);
  });
});

describe('R012: AdjacentFromTarget after the anchor died uses its cast-start neighbours only', () => {
  const K = [0, 1, 2, 3].map(() => oneHp(5));
  it('weapon:1156: chosen E11 killed -> E10 and E12 still take the adjacent damage', () => {
    const r = castSpell({ key: 'weapon:1156', target: 11, enemies: K });
    expect(r.summary.order.filter((s) => s.startsWith('dmg')).map((s) => s.split(' ')[1])).toEqual(['E11', 'E10', 'E12']);
    expect(r.f.enemies[3].hp).toBe(1);
  });
  it('weapon:1279: splash kills E10-E12 -> nobody left to Stun (E13 was never adjacent)', () => {
    const r = castSpell({ key: 'weapon:1279', target: 11, enemies: K });
    expect(hasStatus(r.f.enemies[3], 'stun')).toBe(false);
  });
  it('troop:6384: splash kills E10-E12 -> no Magic stolen from E13', () => {
    const r = castSpell({ key: 'troop:6384', target: 11, enemies: K });
    expect(r.summary.order.some((s) => s.startsWith('buff E13 magic'))).toBe(false);
  });
});

describe('R012: troop:6843 8248 NextDownFromTarget (single-segment form is equivalent)', () => {
  it('chosen E11 dies to the first hit -> E12 still takes the true damage', () => {
    const r = castSpell({ key: 'troop:6843', target: 11, enemies: [tough(), oneHp(), tough(), tough()] });
    expect(r.summary.order.filter((s) => s.startsWith('dmg'))).toEqual([expect.stringMatching(/^dmg E11 /), expect.stringMatching(/^dmg E12 /)]);
  });
});
