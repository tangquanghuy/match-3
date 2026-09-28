// sa-P review round 4: P-R5-faction-kingdom (troop:7357 / 8985, weapon:1274 / 8140).
// Native CountArmyKingdom@AllAllies on a faction kingdom id counts only that raw KingdomId roster:
//   3048 Wild Court = TheWendigo, FeyHound, WildKnight, Puka, RedCap (zh parent kingdom 卜筮之原 = all of Adana)
//   3053 Amanithrax = Lifecap, KingGobtruffle, Exploadstool, Fungomancer, MushroomMan (+ raw-only Deathcap; 齐埃金 = Zaejin)
// Curated now counts by zh troop name (alliesNamed name[]), caster included.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';

const dmgTo = (r: ReturnType<typeof castSpell>, id: number) => r.events
  .filter(e => e.type === 'skill-damage' && e.targetId === id).reduce((a, e) => a + (e as { damage: number }).damage, 0);
const dmgAll = (r: ReturnType<typeof castSpell>) => r.events
  .filter(e => e.type === 'skill-damage' && !(e as { skullBurst?: boolean }).skullBurst).reduce((a, e) => a + (e as { damage: number }).damage, 0);
const tough = { hp: 500, maxHp: 500, armor: 0 };

describe('P-R5-faction-kingdom', () => {
  const ADANA = '卜筮之原';
  it('troop:7357: a non-Wild-Court Adana ally adds nothing; each Wild Court ally adds +4', () => {
    const caster = { name: '妖犬', kingdom: ADANA };
    const base = dmgTo(castSpell({ key: 'troop:7357', caster, allies: [{ name: 'X' }], enemies: [tough, tough] }), 11);
    const pegasus = dmgTo(castSpell({ key: 'troop:7357', caster, allies: [{ name: '天马', kingdom: ADANA }], enemies: [tough, tough] }), 11);
    const court = dmgTo(castSpell({ key: 'troop:7357', caster, allies: [{ name: '红帽', kingdom: ADANA }, { name: '普卡', kingdom: ADANA }], enemies: [tough, tough] }), 11);
    expect(pegasus).toBe(base);
    expect(court).toBe(base + 8);
  });
  it('weapon:1274: Zaejin goblins add nothing; each Amanithrax ally adds +3 scatter and 3 explosions', () => {
    const ZAEJIN = '齐埃金';
    const none = castSpell({ key: 'weapon:1274', allies: [{ name: '哥布林', kingdom: ZAEJIN }], enemies: [tough, tough] });
    const two = castSpell({ key: 'weapon:1274', allies: [{ name: '蘑菇人', kingdom: ZAEJIN }, { name: '霉菌法师', kingdom: ZAEJIN }], enemies: [tough, tough] });
    expect(none.events.some(e => e.type === 'gem-explode')).toBe(false);
    const base = dmgAll(castSpell({ key: 'weapon:1274', allies: [{ name: 'X' }], enemies: [tough, tough] }));
    expect(dmgAll(none)).toBe(base);
    expect(dmgAll(two)).toBeGreaterThanOrEqual(base + 6);
    expect(two.events.some(e => e.type === 'gem-explode')).toBe(true);
  });
});
