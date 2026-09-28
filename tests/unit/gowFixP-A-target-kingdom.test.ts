import { describe, expect, it } from 'vitest';
import { castSpell, entitySkill, registry, DEFAULT_ENEMIES } from '../helpers/gowCast';
import type { SkillPrototype } from '@engine/skills/prototypes';

// P-A-target-kingdom: native MultiplyForKingdom<id> on Damage@FromTarget tests the DAMAGED target's kingdom
// ("If the Enemy is from <Kingdom> or if the battle is in <Kingdom>, deal double damage"), not "any enemy".
const KEYS = [
  ...Array.from({ length: 33 }, (_, i) => `weapon:${1318 + i}`),
  'weapon:1429', 'weapon:1479', 'weapon:1499', 'weapon:1560', 'troop:7665',
];
type Cond = { kind: string; kingdom?: string; of?: Cond[] };
function kingdomOf(key: string): string {
  const proto = registry.prototypes.get(entitySkill(key).skill) as SkillPrototype;
  const seg = (proto.segments as Array<{ kind: string; condMult?: { cond: Cond } }>).find(s => s.condMult);
  const cond = seg!.condMult!.cond;
  const leaf = cond.kind === 'anyOf' ? cond.of!.find(c => c.kind === 'targetKingdom') : cond;
  expect(leaf?.kind, key).toBe('targetKingdom');
  return leaf!.kingdom!;
}
const hpLost = (key: string, kingdoms: (string | undefined)[]) => {
  const enemies = DEFAULT_ENEMIES.map((e, i) => ({ ...e, kingdom: kingdoms[i] }));
  const r = castSpell({ key, target: 11, enemies, seed: 1 });
  const e11 = r.f.enemies.find(e => e.id === 11)!;
  return 900 - e11.hp;
};

describe('P-A-target-kingdom', () => {
  it.each(KEYS)('%s: only the target\'s own kingdom doubles the hit', (key) => {
    const k = kingdomOf(key);
    const plain = hpLost(key, []);
    expect(plain).toBeGreaterThan(0);
    // a non-target enemy from the kingdom no longer doubles the hit on E11
    expect(hpLost(key, [k, undefined, k, k])).toBe(plain);
    // the target itself from the kingdom doubles it
    expect(hpLost(key, [undefined, k])).toBeGreaterThan(plain);
  });
  it('weapon:1318 repro: E10 from the kingdom, E11 targeted -> single damage', () => {
    const k = kingdomOf('weapon:1318');
    expect(hpLost('weapon:1318', [k])).toBe(hpLost('weapon:1318', []));
  });
});
