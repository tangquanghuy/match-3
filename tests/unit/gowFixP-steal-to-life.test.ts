// sa-P fix round A: P-steal-to-life (lane-L7 L7-7069).
// Native steal-to-Life chains end in IncreaseHealth Self (Life AND max Life grow by the counter).
// 8597: counter = min(front Attack, Magic + 1) + 2 x Green allies (CountArmyColor added after CountMaxWithMagic).
// 9139 / 9223: counter = min(target stat, Magic + 1); [100:1] is only the CountAttack/CountMagic 100% label.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell } from '../helpers/gowCast';

const lifeGain = (r: ReturnType<typeof castSpell>) => r.events.filter((e) => e.type === 'buff' && e.targetId === r.f.caster.id && e.stat === 'hp');
const green = { colors: [BaseColor.Green] };
const other = { colors: [BaseColor.Red] };

describe('P-steal-to-life: troop:7069 spell 8597', () => {
  // [front Attack, Magic, green allies (besides caster: caster colours Blue/Green count), counter, attack removed]
  for (const [atk, magic, allies, counter, removed] of [
    [5, 10, [green, other], 5 + 2 * 2, 5], // cap 5 + caster and one Green ally
    [30, 10, [other, other], 11 + 2, 13], // uncapped base 11 + caster only; DecreaseAttack also reads the counter
    [0, 10, [green, other], 4, 0], // front Attack 0: only the Green bonus, nothing to reduce
  ] as const) {
    it(`front Attack ${atk}, Magic ${magic}: Life +${counter} and max Life +${counter}; front Attack -${removed}`, () => {
      const r = castSpell({ key: 'troop:7069', magic, allies: [...allies], enemies: [{ attack: atk }, {}, {}, {}] });
      const hp0 = r.f.snap.get(0)!;
      expect(r.f.caster.hp - hp0.hp).toBe(counter);
      expect(r.f.caster.maxHp - hp0.maxHp).toBe(counter);
      expect(r.f.snap.get(10)!.attack - r.f.enemies[0].attack).toBe(removed);
      expect(lifeGain(r)).toEqual([expect.objectContaining({ amount: counter, maxHpGain: counter })]);
    });
  }
});

describe('P-steal-to-life: troop:7437 spell 9139 and troop:7490 spell 9223', () => {
  it('9139: chosen enemy Attack 17, Magic 10 -> steal 11 Attack, Life and max Life +11', () => {
    const r = castSpell({ key: 'troop:7437', magic: 10, target: 11, enemies: [{}, { attack: 17 }, {}, {}] });
    expect(r.f.enemies[1].attack).toBe(6);
    expect(lifeGain(r)).toEqual([expect.objectContaining({ amount: 11, maxHpGain: 11 })]);
  });
  it('9139: chosen enemy Attack 4 -> steal 4, Life +4', () => {
    const r = castSpell({ key: 'troop:7437', magic: 10, target: 11, enemies: [{}, { attack: 4 }, {}, {}] });
    expect(r.f.enemies[1].attack).toBe(0);
    expect(lifeGain(r)).toEqual([expect.objectContaining({ amount: 4, maxHpGain: 4 })]);
  });
  it('9223: chosen enemy Magic 20, Magic 10 -> steal 11 Magic, Life and max Life +11', () => {
    const r = castSpell({ key: 'troop:7490', magic: 10, target: 11, enemies: [{}, { magic: 20 }, {}, {}] });
    expect(r.f.enemies[1].magic).toBe(9);
    expect(lifeGain(r)).toEqual([expect.objectContaining({ amount: 11, maxHpGain: 11 })]);
  });
});
