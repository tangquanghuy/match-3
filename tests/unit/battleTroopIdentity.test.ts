import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { battleTroopOf } from '../../src/render/battleTroopIdentity';
import { buildPlayerSnapshots } from '../../src/meta/systems/battleBridge';
import { newSave } from '../../src/meta';
import type { CombatantSnapshot } from '../../src/session/contract';

const yeluo = TROOPS.find(t => t.name === '\u53f6\u843d')!;
const snapshot = (overrides: Partial<CombatantSnapshot>): CombatantSnapshot => ({
  externalId: 'p0-hero', name: yeluo.name,
  stats: { hp: 10, attack: 5, armor: 5, magic: 5 },
  manaCost: 1, manaColors: [], skillId: 'none', ...overrides,
});

describe('battle troop identity', () => {
  it('does not give a same-name hero the troop spell and traits', () => {
    expect(battleTroopOf(yeluo.name, snapshot({}))).toBeUndefined();
    expect(battleTroopOf(yeluo.name, snapshot({ templateId: String(yeluo.id) }))).toBeUndefined();
  });

  it('keeps the real hero distinct in a built player team', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.character = { name: yeluo.name, gender: 'unknown', portrait: 'default:unknown' };
    const result = buildPlayerSnapshots(save);
    if (!result.ok) throw new Error(result.message);
    const hero = result.playerTeam.find(s => s.externalId.endsWith('-hero'))!;
    expect(hero.name).toBe(yeluo.name);
    expect(battleTroopOf(hero.name, hero)).toBeUndefined();
  });

  it('resolves actual troops by template id rather than a shared display name', () => {
    expect(battleTroopOf(yeluo.name, snapshot({ externalId: `p1-${yeluo.id}`, templateId: String(yeluo.id) }))).toBe(yeluo);
    expect(battleTroopOf(yeluo.name, snapshot({ externalId: 'p1-other', templateId: '999999999' }))).toBeUndefined();
  });

  it('allows the current transformed form to be identified separately', () => {
    const other = TROOPS.find(t => t.id !== yeluo.id)!;
    expect(battleTroopOf(other.name, snapshot({}))).toBe(other);
    expect(battleTroopOf(other.name, snapshot({ externalId: `p1-${yeluo.id}`, templateId: String(yeluo.id) }))).toBe(other);
    expect(battleTroopOf(yeluo.name)).toBe(yeluo); // legacy demo battle without snapshots
  });
});
