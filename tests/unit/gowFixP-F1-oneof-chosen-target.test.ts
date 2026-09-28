// P-F1-oneof-chosen-target: a chosen target used only inside oneOf branches (native Randomize
// with FromTarget) must still be requested from the TargetChooser.
import { describe, it, expect } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import type { SkillPrototype, EffectSegment } from '@engine/skills/prototypes';

const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);

const CHOSEN = new Set(['enemyChosen', 'allyChosen', 'enemyChosenAndNextDown', 'enemyChosenAndBelow', 'enemyChosenAndAdjacent']);
function nestedChosen(segs: EffectSegment[]): boolean {
  return segs.some(s => s.kind === 'oneOf'
    ? s.options.some(o => o.some(x => ('target' in x && CHOSEN.has(String(x.target))) || (x.kind === 'oneOf' && nestedChosen([x]))))
    : false);
}

describe('P-F1-oneof-chosen-target', () => {
  it('synthetic prototype: enemyChosen only inside a oneOf branch -> enemyChosen', () => {
    const proto = {
      id: 'synthetic', name: 'x', manaCost: 1,
      segments: [{ kind: 'oneOf', options: [[{ kind: 'damage', target: 'enemyChosen', base: 1 }], [{ kind: 'damage', target: 'enemyChosen', base: 2 }]] }],
    } as unknown as SkillPrototype;
    expect(prototypeChosenTargetMode(proto)).toBe('enemyChosen');
  });

  it('synthetic prototype: allyChosen only inside a oneOf branch -> allyChosen', () => {
    const proto = {
      id: 'synthetic2', name: 'x', manaCost: 1,
      segments: [{ kind: 'extraTurn' }, { kind: 'oneOf', options: [[{ kind: 'buff', target: 'allyChosen', stat: 'attack', amount: 1 }]] }],
    } as unknown as SkillPrototype;
    expect(prototypeChosenTargetMode(proto)).toBe('allyChosen');
  });

  it('every registered prototype with a chosen target inside oneOf requests a target', () => {
    const missing: string[] = [];
    for (const [id, p] of registry.prototypes.entries()) {
      const proto = p as SkillPrototype;
      if (!Array.isArray(proto.segments)) continue;
      if (nestedChosen(proto.segments) && prototypeChosenTargetMode(proto) === null) missing.push(id);
    }
    expect(missing).toEqual([]);
  });
});
