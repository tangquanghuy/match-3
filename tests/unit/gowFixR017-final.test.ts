// Final 4 (coord, 2026-09-29): R017 user rulings + P-Q2-chosen-stat-at-cast-start + 7724 native Life gain.
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem } from '@engine/types';
import { castSpell, sixColourBoard, withCells } from '../helpers/gowCast';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';

const reg = new ExtensionRegistry();
registerSkillLibrary(reg.prototypes);

describe('R017-1 troop:7468 Judgement: 7% extra turn per BLUE gem (English)', () => {
  it('both branches boost the extra-turn chance by Blue gems, not Yellow', () => {
    const proto = reg.prototypes.get('9185')!;
    const text = JSON.stringify(proto);
    expect(text).toContain('"color":"Blue"');
    expect(text).not.toContain('"color":"Yellow"');
  });
});

describe('R017-2 weapon:1498 Vulpine Protector: Barrier all OTHER allies (English)', () => {
  it('branch B barrier target excludes the caster', () => {
    const text = JSON.stringify(reg.prototypes.get('8869'));
    expect(text).toContain('"allyOthers"');
  });
});

describe('P-Q2-chosen-stat-at-cast-start troop:7116 Despond', () => {
  it('the chosen enemy dies from the first hit; the hit above it still uses its cast-start Attack', () => {
    const r = castSpell({ key: 'troop:7116', target: 11, enemies: [
      { hp: 50, maxHp: 50, armor: 0, attack: 7 }, { hp: 1, maxHp: 1, armor: 0, attack: 9 }, { hp: 50, maxHp: 50, armor: 0 },
    ] });
    const o = r.summary.order;
    expect(o).toContain('dmg E11 9');
    expect(o.some((s) => s.startsWith('dmg E10 9'))).toBe(true);
  });
});

describe('troop:7724 Sandstone Sentinel: native IncreaseAllStats grows current and max Life', () => {
  it('Life gain raises max Life too', () => {
    const board = withCells(sixColourBoard, { '0,0': colorGem(BaseColor.Red) });
    const o = castSpell({ key: 'troop:7724', board }).summary.order;
    expect(o.some((s) => /^buff C hp\+10 max\+10$/.test(s))).toBe(true);
  });
});
