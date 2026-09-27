/** Scoped native IncreaseRandom wording: user-facing snapshots must identify the single stat and recipient.
 * This checks the display pipeline; it is NOT whole-spell GoW acceptance. */
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import troops from '../../src/data/troops.json';
import weapons from '../../src/data/weapons.json';
import { spellDescription } from '../../src/data/combatText';
const cases = [
  { spell: 7009, entity: 6009, recipient: '自身' },
  { spell: 7011, entity: 6011, recipient: '自身' },
  { spell: 7162, entity: 6092, recipient: '所有其他盟友' },
  { spell: 7213, entity: 6121, recipient: '自身' },
  { spell: 7219, entity: 1094, recipient: '自身' },
  { spell: 7261, entity: 6147, recipient: '一名随机盟友' },
  { spell: 7289, entity: 6163, recipient: '自身' },
  { spell: 7322, entity: 6181, recipient: '一名随机盟友' },
  { spell: 7390, entity: 6247, recipient: '自身' },
  { spell: 7407, entity: 6264, recipient: '所有其他盟友' },
  { spell: 7414, entity: 1146, recipient: '一名盟友' },
  { spell: 7538, entity: 6383, recipient: '一名盟友' },
  { spell: 7545, entity: 6390, recipient: '一名随机盟友' },
  { spell: 7954, entity: 6630, recipient: '自身' },
  { spell: 7987, entity: 6652, recipient: '第一位盟友' },
] as const;
const enTroops = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops as Array<{ id: number; stats: { spell: { id: number; desc: string } } }>;
const enWeapons = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json', 'utf8')).weapons as Array<{ id: number; SpellId: number; stats: { spell: { desc: string } } }>;
const pool: Array<{ spellId: number; desc: string }> = fs.readdirSync('scripts/curated-pools').filter((name: string) => name.endsWith('.json')).flatMap((name: string) =>
  JSON.parse(fs.readFileSync(`scripts/curated-pools/${name}`, 'utf8')) as Array<{ spellId: number; desc: string }>);

describe('native IncreaseRandom localized display pipeline (NOT whole-skill signoff)', () => {
  for (const { spell, entity, recipient } of cases) it(`${entity}/${spell}: singular Skill and recipient survive rebuild`, () => {
    const source = entity >= 6000
      ? enTroops.find(t => t.id === entity)?.stats.spell.desc
      : enWeapons.find(w => w.id === entity)?.stats.spell.desc;
    expect(source?.toLowerCase()).toMatch(/random skill/);
    const built = entity >= 6000 ? troops.find(t => t.id === entity) : weapons.find(w => w.id === entity);
    expect(built?.spell.id).toBe(spell);
    const curated = pool.filter(row => row.spellId === spell);
    if (spell === 7954) {
      // 7954 is registered by the residual batch, not a curated pool entry.
      expect(curated).toHaveLength(0);
      const overrides = JSON.parse(fs.readFileSync('src/data/gowSnapshotOverrides.json', 'utf8')).troops;
      expect(built?.spell.description).toBe(overrides[entity].spellDescription);
    } else {
      expect(curated).toHaveLength(1);
      expect(built?.spell.description).toBe(curated[0].desc);
    }
    const text = spellDescription(spell, built!.spell.description);
    expect(text).toContain('一项随机属性');
    expect(text).toContain(recipient);
    expect(text).not.toContain('随机技能值');
    expect(text).not.toContain('??');
  });
});





